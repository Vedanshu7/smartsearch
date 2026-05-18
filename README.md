# smartsearch

> Type what you want to find. Get the perfect Google search URL.

`smartsearch` is a full-stack web application that takes a natural language query ("find PDF research papers about transformers from arxiv"), parses it with OpenAI GPT, and constructs an optimized Google search URL with the right operators (`site:`, `filetype:`, `"exact phrases"`, exclusions, date ranges).

## Demo

```
Query: "find python tutorials from official docs excluding youtube"
↓
https://www.google.com/search?q=python+tutorials+site:docs.python.org+-youtube
```

## Features

- Natural language → optimized Google search URL
- Supports: `site:`, `filetype:`, exact phrases, word exclusions, date ranges
- Go backend with OpenAI integration
- React + TailwindCSS frontend

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TailwindCSS 3 |
| Backend | Go |
| AI | OpenAI GPT-3.5-turbo |

## Setup

### 1. Backend

```bash
cd backend
export OPENAI_API_KEY=sk-proj-your-key-here
go run main.go
# Starts on http://localhost:8080
```

### 2. Frontend

```bash
cd smart-search
npm install
npm start
# Opens http://localhost:3000
```

### Environment variables

```bash
cp .env.example .env
# Fill in OPENAI_API_KEY
```

## Project Structure

```
smartsearch/
├── backend/
│   └── main.go          # Go HTTP server + OpenAI integration
├── smart-search/
│   └── src/
│       └── components/SearchFrontend.js  # React UI
├── .env.example
└── README.md
```

## License

[MIT](LICENSE)
