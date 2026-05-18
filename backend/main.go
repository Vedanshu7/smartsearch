// smartsearch backend — parses natural language search queries with OpenAI
// and returns an optimised Google search URL.
//
// Environment variables:
//
//	OPENAI_API_KEY  (required) Your OpenAI API key
//	PORT            (optional) HTTP listen port, default 8080
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const openAIURL = "https://api.openai.com/v1/chat/completions"

// SearchIntent is the structured representation OpenAI extracts from a
// natural language query.
type SearchIntent struct {
	MainQuery    string   `json:"main_query"`
	ExactPhrases []string `json:"exact_phrases,omitempty"`
	SiteFilter   string   `json:"site_filter,omitempty"`
	FileType     string   `json:"file_type,omitempty"`
	ExcludeWords []string `json:"exclude_words,omitempty"`
	DateRange    string   `json:"date_range,omitempty"`
}

// openAIMessage is a single chat turn sent to the completions endpoint.
type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIRequest is the JSON body for a chat completions call.
type openAIRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Temperature float64         `json:"temperature"`
}

// openAIResponse is the subset of the completions response we consume.
type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// cacheEntry holds a cached search result with an expiry timestamp.
type cacheEntry struct {
	url       string
	intent    *SearchIntent
	expiresAt time.Time
}

// SearchHandler handles /search requests. It holds the OpenAI key, an HTTP
// client, a per-IP rate limiter map, and a short-lived response cache.
type SearchHandler struct {
	openAIKey string
	client    *http.Client

	// limiterMu guards the per-IP limiter map.
	limiterMu sync.Mutex
	limiters  map[string]*rate.Limiter

	// cacheMu guards the prompt → result cache.
	cacheMu sync.RWMutex
	cache   map[string]cacheEntry
}

// NewSearchHandler creates a SearchHandler with the given OpenAI API key.
func NewSearchHandler(openAIKey string) *SearchHandler {
	return &SearchHandler{
		openAIKey: openAIKey,
		client:    &http.Client{Timeout: 15 * time.Second},
		limiters:  make(map[string]*rate.Limiter),
		cache:     make(map[string]cacheEntry),
	}
}

// getLimiter returns a token-bucket rate limiter for the given IP address,
// creating one on first access (10 requests per second, burst of 5).
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

// cachedResult returns a previously cached result for the prompt, if one
// exists and has not expired.
func (h *SearchHandler) cachedResult(prompt string) (string, *SearchIntent, bool) {
	h.cacheMu.RLock()
	defer h.cacheMu.RUnlock()
	e, ok := h.cache[prompt]
	if !ok || time.Now().After(e.expiresAt) {
		return "", nil, false
	}
	return e.url, e.intent, true
}

// storeResult caches the result for a prompt for 5 minutes.
func (h *SearchHandler) storeResult(prompt, searchURL string, intent *SearchIntent) {
	h.cacheMu.Lock()
	defer h.cacheMu.Unlock()
	h.cache[prompt] = cacheEntry{
		url:       searchURL,
		intent:    intent,
		expiresAt: time.Now().Add(5 * time.Minute),
	}
}

// analyzePrompt sends the user's query to OpenAI and returns a structured
// SearchIntent describing the parsed search parameters.
func (h *SearchHandler) analyzePrompt(ctx context.Context, prompt string) (*SearchIntent, error) {
	messages := []openAIMessage{
		{
			Role: "system",
			Content: `You are a search query analyzer. Extract search parameters and return ONLY a JSON object:
{
    "main_query": "the main search terms",
    "exact_phrases": ["exact phrase 1"],
    "site_filter": "example.com",
    "file_type": "pdf",
    "exclude_words": ["word1"],
    "date_range": "2023"
}
Use empty arrays [] for missing lists and empty strings "" for missing fields.`,
		},
		{Role: "user", Content: prompt},
	}

	body, err := json.Marshal(openAIRequest{
		Model:       "gpt-3.5-turbo",
		Messages:    messages,
		Temperature: 0.2, // low temperature for deterministic structured output
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIURL, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+h.openAIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call OpenAI: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var aiResp openAIResponse
	if err := json.Unmarshal(raw, &aiResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if aiResp.Error != nil {
		return nil, fmt.Errorf("OpenAI error: %s", aiResp.Error.Message)
	}
	if len(aiResp.Choices) == 0 {
		return nil, fmt.Errorf("OpenAI returned no choices")
	}

	var intent SearchIntent
	content := strings.TrimSpace(aiResp.Choices[0].Message.Content)
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
// prompts, calls OpenAI for new queries, and returns the assembled Google
// search URL along with the parsed intent.
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

	// Rate limiting — keyed by client IP.
	ip := r.RemoteAddr
	if !h.getLimiter(ip).Allow() {
		http.Error(w, "rate limit exceeded — please slow down", http.StatusTooManyRequests)
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
	if searchURL, intent, ok := h.cachedResult(reqBody.Prompt); ok {
		log.Printf("cache hit for %q", reqBody.Prompt)
		writeJSON(w, map[string]any{"search_url": searchURL, "intent": intent, "cached": true})
		return
	}

	intent, err := h.analyzePrompt(r.Context(), reqBody.Prompt)
	if err != nil {
		log.Printf("analyzePrompt error: %v", err)
		http.Error(w, "failed to analyse prompt", http.StatusInternalServerError)
		return
	}

	searchURL := buildSearchURL(intent)
	h.storeResult(reqBody.Prompt, searchURL, intent)

	writeJSON(w, map[string]any{"search_url": searchURL, "intent": intent, "cached": false})
}

// writeJSON encodes v as JSON and writes it to w with the correct Content-Type.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON error: %v", err)
	}
}

func main() {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		log.Fatal("OPENAI_API_KEY environment variable is required")
	}

	handler := NewSearchHandler(apiKey)
	http.HandleFunc("/search", handler.handleSearch)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("smartsearch backend listening on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
