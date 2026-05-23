import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, ExternalLink, X } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

const EXAMPLES = [
  'find PDF papers on transformers from arxiv after 2022',
  'python tutorials on official docs excluding youtube',
  'site:github.com open source Go HTTP libraries',
];

// Build operator chips from a parsed SearchIntent.
function buildChips(intent) {
  const chips = [];
  if (intent.site_filter) chips.push({ label: `site: ${intent.site_filter}`, color: 'blue' });
  if (intent.file_type)   chips.push({ label: `filetype: ${intent.file_type}`, color: 'purple' });
  if (intent.date_range)  chips.push({ label: `after: ${intent.date_range}`, color: 'orange' });
  (intent.exact_phrases || []).forEach(p => p && chips.push({ label: `"${p}"`, color: 'green' }));
  (intent.exclude_words  || []).forEach(w => w && chips.push({ label: `-${w}`, color: 'red' }));
  return chips;
}

const CHIP_COLORS = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  red:    'bg-red-50 text-red-700 border-red-200',
};

export default function SearchFrontend() {
  const [view, setView]         = useState('home');
  const [prompt, setPrompt]     = useState('');
  const [result, setResult]     = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState('');

  const inputRef = useRef(null);

  // Focus the input whenever the view changes.
  useEffect(() => {
    inputRef.current?.focus();
  }, [view]);

  async function handleSearch(e) {
    e?.preventDefault();
    const q = prompt.trim();
    if (!q) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${BACKEND_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Search failed');
      }

      const data = await res.json();
      setResult(data);
      setView('results');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setView('home');
    setPrompt('');
    setResult(null);
    setError('');
  }

  function handleOpen() {
    if (result?.search_url) window.open(result.search_url, '_blank')?.focus();
  }

  // Shared search bar used in both views.
  function SearchBar({ compact = false }) {
    return (
      <form onSubmit={handleSearch} className={`relative flex items-center ${compact ? 'w-full max-w-xl' : 'w-full max-w-2xl'}`}>
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder={compact ? 'Refine your search...' : 'Describe what you want to find...'}
            className={`w-full pl-12 pr-12 ${compact ? 'py-2.5 text-sm' : 'py-4 text-base'} rounded-full border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:opacity-60`}
          />
          {prompt && (
            <button
              type="button"
              onClick={() => setPrompt('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className={`ml-3 flex-shrink-0 flex items-center gap-2 ${compact ? 'px-4 py-2.5 text-sm' : 'px-6 py-4 text-base'} rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {!compact && <span>Search</span>}
        </button>
      </form>
    );
  }

  // Home view: centred logo + search bar + example chips.
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold tracking-tight">
              <span className="text-blue-600">Smart</span>
              <span className="text-gray-800">Search</span>
            </h1>
            <p className="mt-3 text-gray-500 text-base">
              Describe what you want to find. AI builds the perfect Google search.
            </p>
          </div>

          <SearchBar />

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                type="button"
                onClick={() => { setPrompt(ex); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Results view: header bar + result card.
  const chips = result ? buildChips(result.intent) : [];
  const displayURL = result?.search_url.replace(/^https?:\/\//, '').slice(0, 80);
  const mainQuery = result?.intent?.main_query || prompt;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-6">
          <button
            onClick={handleReset}
            className="flex-shrink-0 text-xl font-bold"
          >
            <span className="text-blue-600">Smart</span>
            <span className="text-gray-800">Search</span>
          </button>
          <SearchBar compact />
        </div>
      </header>

      {/* Results content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        {result && (
          <>
            {/* "About N results" line */}
            <p className="text-sm text-gray-500 mb-4">
              1 result
              {result.cached && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs">cached</span>
              )}
            </p>

            {/* Result card */}
            <div className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
              {/* URL breadcrumb line */}
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Search className="w-3 h-3 text-gray-500" />
                </div>
                <span className="text-sm text-green-700 truncate">{displayURL}</span>
              </div>

              {/* Title */}
              <h2
                className="text-blue-700 text-xl font-medium hover:underline cursor-pointer mb-3 leading-snug"
                onClick={handleOpen}
              >
                {mainQuery}
              </h2>

              {/* Operator chips */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {chips.map((chip, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${CHIP_COLORS[chip.color]}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Open button */}
              <button
                onClick={handleOpen}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Open in Google
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>

            {/* New search link */}
            <button
              onClick={handleReset}
              className="mt-6 text-sm text-blue-600 hover:underline"
            >
              ← New search
            </button>
          </>
        )}
      </main>
    </div>
  );
}
