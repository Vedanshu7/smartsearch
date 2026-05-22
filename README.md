# smartsearch

> Type what you want to find. Get the perfect Google search URL.

`smartsearch` is a full-stack web application that takes a natural language query ("find PDF research papers about transformers from arxiv"), parses it with an LLM, and constructs an optimized Google search URL with the right operators (`site:`, `filetype:`, `"exact phrases"`, exclusions, date ranges).

## Demo

```
Query: "find python tutorials from official docs excluding youtube"
Result: https://www.google.com/search?q=python+tutorials+site:docs.python.org+-youtube
```

## Features

- Natural language to optimized Google search URL
- Supports: `site:`, `filetype:`, exact phrases, word exclusions, date ranges
- Go backend with [llmbridge](https://github.com/Vedanshu7/llmbridge): swap LLM provider at runtime via env var
- React + TailwindCSS frontend

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TailwindCSS 3 |
| Backend | Go |
| AI | llmbridge (OpenAI, Anthropic, Gemini, Groq) |

## Setup

### 1. Backend

```bash
cd backend
cp ../.env.example .env  # fill in your key for the chosen provider
export LLM_PROVIDER=openai
export OPENAI_API_KEY=sk-proj-your-key-here
go run main.go
# Starts on http://localhost:8080
```

Swap providers without changing any code:

```bash
export LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=your-key
go run main.go

export LLM_PROVIDER=gemini
export GEMINI_API_KEY=your-key
go run main.go

export LLM_PROVIDER=groq
export GROQ_API_KEY=your-key
go run main.go
```

Override the default model for a provider:

```bash
export LLM_MODEL=gpt-4o
```

### 2. Frontend

```bash
cd smart-search
npm install
npm start
# Opens http://localhost:3000
```

To point the frontend at a non-default backend:

```bash
echo "REACT_APP_BACKEND_URL=http://localhost:8080" > .env.local
```

## Environment Variables

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | No | `openai` | Provider: `openai`, `anthropic`, `gemini`, `groq` |
| `LLM_MODEL` | No | provider default | Override model name |
| `OPENAI_API_KEY` | If `LLM_PROVIDER=openai` | | OpenAI API key |
| `ANTHROPIC_API_KEY` | If `LLM_PROVIDER=anthropic` | | Anthropic API key |
| `GEMINI_API_KEY` | If `LLM_PROVIDER=gemini` | | Google Gemini API key |
| `GROQ_API_KEY` | If `LLM_PROVIDER=groq` | | Groq API key |
| `PORT` | No | `8080` | HTTP listen port |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REACT_APP_BACKEND_URL` | No | `http://localhost:8080` | Backend base URL |

## Project Structure

```
smartsearch/
├── backend/
│   ├── main.go          # Go HTTP server with llmbridge integration
│   ├── go.mod
│   └── go.sum
├── smart-search/
│   ├── public/
│   └── src/
│       └── components/SearchFrontend.js  # React UI
├── .env.example
└── README.md
```

## License

[MIT](LICENSE)
