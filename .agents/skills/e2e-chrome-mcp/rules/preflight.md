---
name: preflight
description: Server startup, port management, and health checks before E2E testing
---

## Pre-flight checklist

Run these steps before any E2E test session.

### 1. Kill existing processes

```bash
lsof -ti:8787 2>/dev/null | xargs kill 2>/dev/null   # API
lsof -ti:5174 2>/dev/null | xargs kill 2>/dev/null   # PWA
```

### 2. Build all packages

```bash
pnpm build
```

This ensures all TypeScript is compiled, including workspace dependencies (`@tithe/domain`, `@tithe/db`) that the API reads from `dist/`.

### 3. Start dev servers

```bash
pnpm dev  # run in background
```

Wait for both to be ready:
- API: listening on `http://127.0.0.1:8787`
- PWA: listening on `http://localhost:5174`

### 4. Verify with Chrome MCP

```
navigate_page → http://localhost:5174
```

If the page loads, servers are healthy.

### 5. Dismiss stale dialogs

After `navigate_page`, if the response mentions an open dialog (e.g., `confirm: Delete this transaction?`):

```
handle_dialog action=dismiss
```

Then reload:
```
navigate_page type=reload
```

### After backend code changes

The API dev script uses `node --watch --watch-path=src --watch-path=../../packages/domain/dist --watch-path=../../packages/db/dist`. This means:

- **API source changes** (`apps/api/src/`) — auto-restart
- **Domain/DB source changes** — `tsc -w` recompiles `dist/`, which triggers API restart via `--watch-path`
- **Route schema changes** need the server to restart — `--watch` should handle this, but if it doesn't, kill and restart manually

### Known issues
- [2026-03-25] `pnpm dev` runs all packages in parallel via turbo. If API port is already in use, it crashes but PWA may still start on a different port. Always kill both ports first.
- [2026-03-25] The PWA dev server (Vite) auto-increments ports if occupied (5174 → 5175 → 5176). Always use port 5174 to avoid confusion.
