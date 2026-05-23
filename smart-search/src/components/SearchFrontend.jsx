import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Loader2, ExternalLink, X,
  Sun, Moon, ArrowLeft, ArrowRight, RotateCw, Globe,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

const EXAMPLES = [
  'find PDF papers on transformers from arxiv after 2022',
  'python tutorials on official docs excluding youtube',
  'site:github.com open source Go HTTP libraries',
];

// Persist dark/light preference and sync the <html> class.
function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ss-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('ss-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, useCallback(() => setDark(d => !d), [])];
}

// Build coloured operator chips from a parsed SearchIntent.
const CHIP_STYLES = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
  amber:  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  emerald:'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  rose:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
};

function buildChips(intent) {
  const chips = [];
  if (intent.site_filter)  chips.push({ label: `site:${intent.site_filter}`,   style: CHIP_STYLES.blue });
  if (intent.file_type)    chips.push({ label: `filetype:${intent.file_type}`, style: CHIP_STYLES.violet });
  if (intent.date_range)   chips.push({ label: `after:${intent.date_range}`,   style: CHIP_STYLES.amber });
  (intent.exact_phrases || []).forEach(p => p && chips.push({ label: `"${p}"`, style: CHIP_STYLES.emerald }));
  (intent.exclude_words  || []).forEach(w => w && chips.push({ label: `-${w}`, style: CHIP_STYLES.rose }));
  return chips;
}

// Shared pill search input + submit button.
function SearchBar({ prompt, setPrompt, onSubmit, isLoading, compact = false, inputRef }) {
  return (
    <form onSubmit={onSubmit} className={`flex items-center gap-3 ${compact ? 'w-full' : 'w-full max-w-2xl'}`}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={isLoading}
          placeholder="Describe what you want to find..."
          className={`w-full pl-11 pr-10 ${compact ? 'py-2.5 text-sm' : 'py-4 text-base'} rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:opacity-60`}
        />
        {prompt && (
          <button
            type="button"
            onClick={() => setPrompt('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear input"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !prompt.trim()}
        className={`flex-shrink-0 flex items-center justify-center gap-2 ${compact ? 'w-10 h-10' : 'px-7 py-4'} rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200`}
      >
        {isLoading
          ? <Loader2 className="h-5 w-5 animate-spin" />
          : <Search className="h-5 w-5" />}
        {!compact && <span>Search</span>}
      </button>
    </form>
  );
}

// Theme toggle button.
function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="p-2.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-yellow-400 transition-all duration-200"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export default function SearchFrontend() {
  const [dark, toggleTheme] = useTheme();
  const [view, setView]         = useState('home');
  const [prompt, setPrompt]     = useState('');
  const [result, setResult]     = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState('');
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const inputRef  = useRef(null);
  const iframeRef = useRef(null);

  // Focus the search input whenever the view changes.
  useEffect(() => {
    if (view === 'home') inputRef.current?.focus();
  }, [view]);

  async function handleSearch(e) {
    e?.preventDefault();
    const q = prompt.trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setError('');
    setIframeBlocked(false);

    try {
      const res = await fetch(`${BACKEND_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Search failed');
      const data = await res.json();
      setResult(data);
      setView('results');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  // Detect X-Frame-Options block: cross-origin access throws, empty body means blocked.
  function handleIframeLoad() {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc || doc.body?.innerHTML?.trim() === '') {
        setIframeBlocked(true);
      }
    } catch {
      setIframeBlocked(true);
    }
  }

  function handleReset() {
    setView('home');
    setPrompt('');
    setResult(null);
    setError('');
  }

  // Home view.
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-300">
        {/* Theme toggle — top right */}
        <div className="absolute top-4 right-4">
          <ThemeToggle dark={dark} onToggle={toggleTheme} />
        </div>

        {/* Centred content */}
        <div className="flex flex-col items-center justify-center min-h-screen px-4 gap-10">
          {/* Logo + tagline */}
          <div className="text-center select-none">
            <h1 className="text-6xl font-bold tracking-tight">
              <span className="text-blue-500">Smart</span>
              <span className="text-gray-900 dark:text-white">Search</span>
            </h1>
            <p className="mt-3 text-gray-500 dark:text-gray-400 text-base">
              Describe what you want to find. AI builds the perfect Google search.
            </p>
          </div>

          {/* Search bar */}
          <SearchBar
            prompt={prompt}
            setPrompt={setPrompt}
            onSubmit={handleSearch}
            isLoading={isLoading}
            inputRef={inputRef}
          />

          {error && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center -mt-6">{error}</p>
          )}

          {/* Example chips */}
          <div className="flex flex-wrap justify-center gap-2 max-w-xl">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                type="button"
                onClick={() => { setPrompt(ex); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-all duration-150"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Results view.
  const chips      = result ? buildChips(result.intent) : [];
  const mainQuery  = result?.intent?.main_query || prompt;
  const shortURL   = result?.search_url.replace(/^https?:\/\//, '').slice(0, 72) || '';

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 transition-colors duration-300 overflow-hidden">

      {/* 1. Header bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md z-10">
        <button
          onClick={handleReset}
          className="text-xl font-bold select-none tracking-tight"
        >
          <span className="text-blue-500">Smart</span>
          <span className="text-gray-900 dark:text-white">Search</span>
        </button>
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </header>

      {/* 2. Main area: iframe attempt → faux-browser fallback */}
      <main className="flex-1 overflow-hidden relative">

        {/* Thin loading bar — shows until iframe resolves */}
        {!iframeBlocked && result && (
          <div className="absolute top-0 left-0 right-0 h-0.5 z-20">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }} />
          </div>
        )}

        {/* iframe attempt (hidden once blocked) */}
        {result && (
          <iframe
            ref={iframeRef}
            src={result.search_url}
            title="Google Search Results"
            onLoad={handleIframeLoad}
            onError={() => setIframeBlocked(true)}
            className={`w-full h-full border-0 transition-opacity duration-300 ${iframeBlocked ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'}`}
          />
        )}

        {/* Faux-browser fallback card */}
        {iframeBlocked && result && (
          <div className="h-full flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-2xl rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl dark:shadow-black/60">

              {/* Faux browser chrome bar */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {/* Traffic lights */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-3 h-3 rounded-full bg-red-400 dark:bg-red-500" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400 dark:bg-yellow-500" />
                  <span className="w-3 h-3 rounded-full bg-green-400 dark:bg-green-500" />
                </div>
                {/* Nav icons */}
                <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 flex-shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                  <ArrowRight className="h-4 w-4" />
                  <RotateCw className="h-3.5 w-3.5" />
                </div>
                {/* URL bar */}
                <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-700 rounded-full px-3 py-1 min-w-0">
                  <Globe className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{shortURL}</span>
                </div>
                {/* Open button */}
                <button
                  onClick={() => window.open(result.search_url, '_blank')?.focus()}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </button>
              </div>

              {/* Result card content */}
              <div className="bg-white dark:bg-gray-900 p-8 space-y-5">
                {/* Source line */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-none">google.com</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">google.com › search</p>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h2
                    onClick={() => window.open(result.search_url, '_blank')?.focus()}
                    className="text-blue-600 dark:text-blue-400 text-2xl font-medium leading-snug cursor-pointer hover:underline"
                  >
                    {mainQuery}
                  </h2>
                </div>

                {/* Operator chips */}
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${chip.style}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  AI-optimized search with {chips.length} operator{chips.length !== 1 ? 's' : ''} applied.
                  Click below to open the full Google search.
                  {result.cached && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs">cached</span>
                  )}
                </p>

                {/* CTA */}
                <button
                  onClick={() => window.open(result.search_url, '_blank')?.focus()}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium shadow-lg shadow-blue-600/25 transition-all duration-200"
                >
                  Open in Google
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. Floating bottom search bar */}
      <footer className="flex-shrink-0 px-4 py-4 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-2xl mx-auto space-y-2">
          <SearchBar
            prompt={prompt}
            setPrompt={setPrompt}
            onSubmit={handleSearch}
            isLoading={isLoading}
            compact
            inputRef={inputRef}
          />
          {error && (
            <p className="text-red-500 dark:text-red-400 text-xs text-center">{error}</p>
          )}
        </div>
      </footer>
    </div>
  );
}
