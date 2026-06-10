// smartsearch backend: parses natural language search queries with an LLM
// and returns an optimised Google search URL.
//
// Environment variables:
//
//	LLM_PROVIDER      (optional) LLM provider: openai | anthropic | gemini | groq (default: openai)
//	LLM_MODEL         (optional) Override the default model for the chosen provider
//	OPENAI_API_KEY    (required for openai)    Your OpenAI API key
//	ANTHROPIC_API_KEY (required for anthropic) Your Anthropic API key
//	GEMINI_API_KEY    (required for gemini)    Your Google Gemini API key
//	GROQ_API_KEY      (required for groq)      Your Groq API key
//	SERPER_API_KEY    (optional)               Serper.dev key for real search results
//	PORT              (optional) HTTP listen port, default 8080
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	llmbridge "github.com/Vedanshu7/llmbridge"
	"github.com/Vedanshu7/llmbridge/llms/anthropic"
	"github.com/Vedanshu7/llmbridge/llms/compatible"
	"github.com/Vedanshu7/llmbridge/llms/gemini"
	"github.com/Vedanshu7/llmbridge/llms/openai"
	"golang.org/x/time/rate"
)

// SearchIntent is the structured representation the LLM extracts from a
// natural language query.
type SearchIntent struct {
	MainQuery    string   `json:"main_query"`
	ExactPhrases []string `json:"exact_phrases,omitempty"`
	SiteFilter   string   `json:"site_filter,omitempty"`
	FileType     string   `json:"file_type,omitempty"`
	ExcludeWords []string `json:"exclude_words,omitempty"`
	DateRange    string   `json:"date_range,omitempty"`
}

// SerperResult is a single organic result from the Serper.dev Google Search API.
type SerperResult struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Snippet  string `json:"snippet"`
	Position int    `json:"position"`
}

// SearchResponse is the JSON body returned by /search.
type SearchResponse struct {
	SearchURL string         `json:"search_url"`
	Intent    *SearchIntent  `json:"intent"`
	Results   []SerperResult `json:"results,omitempty"`
	Cached    bool           `json:"cached"`
}

// cacheEntry holds a cached search result with an expiry timestamp.
type cacheEntry struct {
	resp      SearchResponse
	expiresAt time.Time
}

// SearchHandler handles /search requests. It holds a llmbridge.Provider, a
// per-IP rate limiter map, and a short-lived response cache.
type SearchHandler struct {
	provider   llmbridge.Provider
	serperKey  string
	httpClient *http.Client

	// limiterMu guards the per-IP limiter map.
	limiterMu sync.Mutex
	limiters  map[string]*rate.Limiter

	// cacheMu guards the prompt-to-result cache.
	cacheMu sync.RWMutex
	cache   map[string]cacheEntry
}

// NewSearchHandler creates a SearchHandler with the given LLM provider and
// optional Serper API key.
func NewSearchHandler(p llmbridge.Provider, serperKey string) *SearchHandler {
	return &SearchHandler{
		provider:   p,
		serperKey:  serperKey,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		limiters:   make(map[string]*rate.Limiter),
		cache:      make(map[string]cacheEntry),
	}
}

// getLimiter returns a token-bucket rate limiter for the given IP address,
// creating one on first access (burst of 5 requests).
func (h *SearchHandler) getLimiter(ip string) *rate.Limiter {
	h.limiterMu.Lock()
	defer h.limiterMu.Unlock()
	if l, ok := h.limiters[ip]; ok {
		return l
	}
	l := rate.NewLimiter(rate.Every(time.Second), 5)
	h.limiters[ip] = l
	return l
}

// cachedResult returns a previously cached response for the prompt, if one
// exists and has not expired.
func (h *SearchHandler) cachedResult(prompt string) (SearchResponse, bool) {
	h.cacheMu.RLock()
	defer h.cacheMu.RUnlock()
	e, ok := h.cache[prompt]
	if !ok || time.Now().After(e.expiresAt) {
		return SearchResponse{}, false
	}
	return e.resp, true
}

// storeResult caches the response for a prompt for 5 minutes.
func (h *SearchHandler) storeResult(prompt string, resp SearchResponse) {
	h.cacheMu.Lock()
	defer h.cacheMu.Unlock()
	h.cache[prompt] = cacheEntry{
		resp:      resp,
		expiresAt: time.Now().Add(5 * time.Minute),
	}
}

// analyzePrompt sends the user's query to the configured LLM provider and
// returns a structured SearchIntent describing the parsed search parameters.
func (h *SearchHandler) analyzePrompt(ctx context.Context, prompt string) (*SearchIntent, error) {
	const systemPrompt = `You are a search query analyzer. Extract search parameters and return ONLY a JSON object:
{
    "main_query": "the main search terms",
    "exact_phrases": ["exact phrase 1"],
    "site_filter": "example.com",
    "file_type": "pdf",
    "exclude_words": ["word1"],
    "date_range": "2023"
}
Use empty arrays [] for missing lists and empty strings "" for missing fields.`

	resp, err := h.provider.Complete(ctx, llmbridge.Request{
		System:      systemPrompt,
		Messages:    []llmbridge.Message{{Role: "user", Content: prompt}},
		Temperature: 0.2,
	})
	if err != nil {
		return nil, fmt.Errorf("LLM call: %w", err)
	}

	var intent SearchIntent
	content := stripCodeFence(strings.TrimSpace(resp.Content))
	if err := json.Unmarshal([]byte(content), &intent); err != nil {
		return nil, fmt.Errorf("parse intent JSON: %w (raw: %s)", err, content)
	}

	// Ensure slices are never nil so JSON serialisation stays consistent.
	if intent.ExactPhrases == nil {
		intent.ExactPhrases = []string{}
	}
	if intent.ExcludeWords == nil {
		intent.ExcludeWords = []string{}
	}

	return &intent, nil
}

// fetchSerperResults queries the Serper.dev Google Search API for the given
// query string. Returns nil results (without error) if no API key is configured.
func (h *SearchHandler) fetchSerperResults(ctx context.Context, query string) ([]SerperResult, error) {
	if h.serperKey == "" {
		return nil, nil
	}

	body, err := json.Marshal(map[string]any{"q": query, "num": 8})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://google.serper.dev/search",
		bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-KEY", h.serperKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("serper request: %w", err)
	}
	defer resp.Body.Close()

	var serperResp struct {
		Organic []SerperResult `json:"organic"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&serperResp); err != nil {
		return nil, fmt.Errorf("serper decode: %w", err)
	}
	return serperResp.Organic, nil
}

// stripCodeFence removes a leading ```json or ``` fence and trailing ``` from s.
// Some providers wrap JSON responses in markdown code blocks despite instructions.
func stripCodeFence(s string) string {
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

// buildSearchURL assembles a Google search URL from a parsed SearchIntent.
func buildSearchURL(intent *SearchIntent) string {
	var parts []string

	if intent.MainQuery != "" {
		parts = append(parts, intent.MainQuery)
	}
	for _, p := range intent.ExactPhrases {
		if p != "" {
			parts = append(parts, fmt.Sprintf(`"%s"`, p))
		}
	}
	if intent.SiteFilter != "" {
		parts = append(parts, "site:"+intent.SiteFilter)
	}
	if intent.FileType != "" {
		parts = append(parts, "filetype:"+intent.FileType)
	}
	for _, w := range intent.ExcludeWords {
		if w != "" {
			parts = append(parts, "-"+w)
		}
	}
	if intent.DateRange != "" {
		parts = append(parts, "after:"+intent.DateRange)
	}

	params := url.Values{}
	params.Set("q", strings.Join(parts, " "))
	return "https://www.google.com/search?" + params.Encode()
}

// setCORSHeaders writes permissive CORS headers to the response.
func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// handleSearch is the HTTP handler for POST /search.
//
// It enforces per-IP rate limiting, checks a short-lived cache for duplicate
// prompts, calls the LLM for new queries, optionally fetches real search
// results via Serper.dev, and returns the assembled Google search URL along
// with the parsed intent.
func (h *SearchHandler) handleSearch(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Rate limiting, keyed by client IP.
	ip := r.RemoteAddr
	if !h.getLimiter(ip).Allow() {
		http.Error(w, "rate limit exceeded, please slow down", http.StatusTooManyRequests)
		return
	}

	var reqBody struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(reqBody.Prompt) == "" {
		http.Error(w, `"prompt" field is required`, http.StatusBadRequest)
		return
	}

	log.Printf("search request from %s: %q", ip, reqBody.Prompt)

	// Return cached result if available.
	if resp, ok := h.cachedResult(reqBody.Prompt); ok {
		log.Printf("cache hit for %q", reqBody.Prompt)
		resp.Cached = true
		writeJSON(w, resp)
		return
	}

	intent, err := h.analyzePrompt(r.Context(), reqBody.Prompt)
	if err != nil {
		log.Printf("analyzePrompt error: %v", err)
		http.Error(w, "failed to analyse prompt", http.StatusInternalServerError)
		return
	}

	searchURL := buildSearchURL(intent)

	// Extract the assembled query string for Serper (includes operators).
	var serperResults []SerperResult
	if h.serperKey != "" {
		parsed, _ := url.Parse(searchURL)
		q := parsed.Query().Get("q")
		serperResults, err = h.fetchSerperResults(r.Context(), q)
		if err != nil {
			// Non-fatal: log and continue without results.
			log.Printf("serper error (non-fatal): %v", err)
		} else {
			log.Printf("serper returned %d results for %q", len(serperResults), q)
		}
	}

	resp := SearchResponse{
		SearchURL: searchURL,
		Intent:    intent,
		Results:   serperResults,
		Cached:    false,
	}
	h.storeResult(reqBody.Prompt, resp)
	writeJSON(w, resp)
}

// writeJSON encodes v as JSON and writes it to w with the correct Content-Type.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON error: %v", err)
	}
}

// requireEnv returns the value of the named environment variable or calls
// log.Fatal if it is not set.
func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("%s environment variable is required", key)
	}
	return v
}

// newProvider builds a llmbridge.Provider from LLM_PROVIDER and LLM_MODEL
// environment variables. Defaults to OpenAI with gpt-4o-mini.
func newProvider() llmbridge.Provider {
	name := os.Getenv("LLM_PROVIDER")
	if name == "" {
		name = "openai"
	}
	model := os.Getenv("LLM_MODEL")

	switch name {
	case "openai":
		if model == "" {
			model = "gpt-4o-mini"
		}
		return openai.New(model, requireEnv("OPENAI_API_KEY"))
	case "anthropic":
		if model == "" {
			model = "claude-haiku-4-5-20251001"
		}
		return anthropic.New(model, requireEnv("ANTHROPIC_API_KEY"))
	case "gemini":
		if model == "" {
			model = "gemini-2.0-flash"
		}
		return gemini.New(model, requireEnv("GEMINI_API_KEY"))
	case "groq":
		if model == "" {
			model = "llama-3.3-70b-versatile"
		}
		return compatible.NewGroq(model, requireEnv("GROQ_API_KEY"))
	default:
		log.Fatalf("unknown LLM_PROVIDER %q: valid values are openai, anthropic, gemini, groq", name)
		return nil
	}
}

func main() {
	p := newProvider()
	serperKey := os.Getenv("SERPER_API_KEY")
	if serperKey != "" {
		log.Printf("Serper.dev integration enabled")
	}

	handler := NewSearchHandler(p, serperKey)
	http.HandleFunc("/search", handler.handleSearch)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("smartsearch backend listening on :%s (provider: %s)", port, p.Name())
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
