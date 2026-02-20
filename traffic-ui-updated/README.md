# Traffic UI

A simple React (Vite + TypeScript) UI to generate light traffic against your backend.

## Run

```bash
npm install
npm run dev
```

Open the UI at http://localhost:5173

## Configure backend (no proxy)

This UI is intended to call your backend **directly** (no Vite proxy). You can set the default backend origin via an env var:

```bash
cp .env.example .env.local
# edit .env.local
```

Example:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

## Notes
- If your backend is on http://localhost:8080, leave Base URL as-is.
- If you see CORS errors in the browser console, enable CORS on the backend for http://localhost:5173.

## Buttons
The UI includes buttons that call:
- /api
- /redis
- /kafka
- /sql

The traffic loop hits:
- /, /api, /mysql, /redis, /kafka/produce

All requests include headers:
- traceparent
- X-Internal-Span
- X-Scenario