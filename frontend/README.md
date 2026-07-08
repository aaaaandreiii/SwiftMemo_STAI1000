# SwiftMemo Frontend

React/Vite UI for the SwiftMemo FastAPI backend.

```bash
npm install
npm run dev
npm run build
```

The app calls relative `/health` and `/api/*` paths. In Docker, `vite.config.ts` proxies those requests to `http://api:8000`.
