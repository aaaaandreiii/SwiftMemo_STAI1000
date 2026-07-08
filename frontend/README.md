# SwiftMemo Frontend

React/Vite UI for the SwiftMemo FastAPI backend.

```bash
npm install
npm run dev
npm run build
```

The app calls relative `/health` and `/api/*` paths. In Docker, `vite.config.ts` proxies those requests to `http://api:8000`.

For a public Vite dev server behind a domain:

```bash
VITE_ALLOWED_HOSTS=swiftmemo.balingit.me \
VITE_API_PROXY_TARGET=http://127.0.0.1:8000 \
npm run dev -- --host 0.0.0.0 --port 7860
```
