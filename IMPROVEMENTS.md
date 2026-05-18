# smartsearch — Improvement Roadmap

## Near-term

- **Multi-engine support** — Bing, DuckDuckGo, and Brave Search in addition to Google
- **Search history** — save recent queries in localStorage or a backend DB
- **Copy-to-clipboard** — one-click copy of the generated search URL
- **Claude as alternative** — add `--model claude` flag for Anthropic backend

## Backend

- **Rate limiting** — prevent abuse with `golang.org/x/time/rate`
- **Caching** — cache identical prompts for 5 minutes to reduce API costs
- **Authentication** — optional API key header for self-hosted deployments
- **Deploy to Railway/Fly.io** — one-command cloud deployment

## Frontend

- **Search intent preview** — show parsed filters (site:, filetype:, etc.) before opening Google
- **Dark mode** — TailwindCSS dark class support
- **Mobile responsive** — improve layout on small screens

## DevOps

- **Docker Compose** — `docker compose up` starts both backend and frontend
- **GitHub Actions** — lint + test on every PR
- **Vercel deployment** — frontend auto-deploy on push to main
