# AIOPH HTML Web Agent

Local-first chatbot for LM Studio with direct HTML output and optional internet retrieval.

## What is included

- Next.js application with a usable chat interface as the first screen.
- LM Studio OpenAI-compatible chat completions endpoint support.
- Streaming HTML responses from the local model.
- Client-side HTML sanitization before rendering.
- Internet search modes: `auto`, `on`, and `off`.
- DuckDuckGo HTML search fallback for local use without Docker.
- SearxNG support for later use when Docker is available.
- Conversation export to a standalone HTML file.
- Health and model endpoints for checking the local runtime.
- Future-ready Dockerfile, although local development is the primary path right now.

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Copy the environment template.

```bash
Copy-Item .env.example .env.local
```

3. Open LM Studio, load a model, and start the local server.

Use the OpenAI-compatible server in LM Studio. The default endpoint expected by this app is:

```text
http://127.0.0.1:1234/v1
```

4. If you want to pin a specific model, set it in `.env.local`.

```env
LM_STUDIO_MODEL=your-loaded-model-id
```

If the model field is empty, the app will ask LM Studio for `/models` and use the first loaded model.

5. Start the app.

```bash
npm run dev
```

6. Open the local app.

```text
http://localhost:3000
```

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | LM Studio OpenAI-compatible API base URL. |
| `LM_STUDIO_MODEL` | empty | Optional model id. If empty, the app uses the first loaded LM Studio model. |
| `LM_STUDIO_REQUEST_TIMEOUT_MS` | `120000` | Timeout for local model generation. |
| `SEARCH_PROVIDER` | `duckduckgo` | Use `duckduckgo` now or `searxng` later. |
| `SEARXNG_BASE_URL` | empty | Required only when `SEARCH_PROVIDER=searxng`. |
| `SEARCH_RESULTS_LIMIT` | `6` | Number of search result records passed to the app. |
| `SEARCH_PAGE_FETCH_LIMIT` | `3` | Number of result pages fetched and parsed for readable text. |
| `SEARCH_REQUEST_TIMEOUT_MS` | `12000` | Search and page retrieval timeout. |

## API endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Checks LM Studio and reports search configuration. |
| `/api/models` | `GET` | Reads loaded LM Studio models. |
| `/api/search` | `POST` | Runs web retrieval for a query. |
| `/api/chat` | `POST` | Streams HTML from LM Studio, optionally with web evidence. |

## HTML output rules

The system prompt tells the model to return HTML fragments only:

- No Markdown.
- No full HTML documents.
- No `script`, `iframe`, `object`, `embed`, or `style` tags.
- Use semantic HTML.
- Include source links when web evidence is used.

The frontend sanitizes the fragment with DOMPurify before rendering.

## Future Docker path

Docker is not required for the current local workflow. A production-oriented Dockerfile is included for later use when Docker is working again.
