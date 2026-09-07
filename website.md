---
title: smartsearch
type: Web Application
projectURL: smartsearch
descriptionShort: Turns a natural language query into an optimized Google search URL, using an LLM to pick the right search operators.
descriptionLong: smartsearch takes a natural language query, such as "find PDF research papers about transformers from arxiv", and constructs an optimized Google search URL with the correct operators applied automatically, including site:, filetype:, exact phrases, exclusions, and date ranges. The Go backend runs the query through llmbridge, so the underlying LLM provider (OpenAI, Anthropic, Gemini, or Groq) is swappable at runtime via an environment variable rather than hardcoded. The frontend is React with Vite and Tailwind CSS.
viewCodeUrl: https://github.com/Vedanshu7/smartsearch
viewProjectUrl:
projectImg: /project-image/smartsearch.svg
technologies:
  - Go
  - React
  - Vite
  - Tailwind CSS
---
