---
name: gotchas
description: Common pitfalls and workarounds discovered during E2E testing
---

## Fastify response schema stripping

**Problem:** Fastify's `additionalProperties: false` on response schemas silently strips any field not listed in the schema. You add a new field to the domain DTO, the service returns it, but the API response doesn't include it.

**Fix:** Always update the route's response schema (`apps/api/src/features/*/routes.ts`) when adding new fields to domain DTOs. Add the field to both `required` and `properties` in the JSON Schema object.

**How to detect:** Use `evaluate_script` with `fetch()` to check the API response directly. If a field is missing, check the route schema.

## oneOf vs anyOf for query parameters

**Problem:** Fastify query string schemas with `oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false'] }]` fail validation because Fastify's coercion makes `"true"` match both schemas. `oneOf` requires exactly one match.

**Fix:** Use `anyOf` instead of `oneOf` for boolean/string union query parameters (like `dryRun`).

**How to detect:** The error response will contain `"must match exactly one schema in oneOf"`.

## Workspace dependency hot reload

**Problem:** The API dev script (`node --watch`) only watches files it directly imports. Workspace dependencies (`@tithe/domain`, `@tithe/db`) resolve to their `dist/` directories via package `exports`. Changes to domain source files are compiled by `tsc -w` to `dist/`, but `node --watch` may not detect changes in symlinked workspace `dist/` paths.

**Fix:** Use `--watch-path` to explicitly include dependency dist directories:
```
node --watch --watch-path=src --watch-path=../../packages/domain/dist --watch-path=../../packages/db/dist --import tsx src/index.ts
```

**How to detect:** You change backend code, reload the page, but the old behavior persists. Check if the server logged a restart message.

## React Query retry on 404

**Problem:** When an API endpoint doesn't exist yet (404), React Query retries with exponential backoff (3 retries by default). This makes the UI feel slow — the loading spinner stays for ~10-15 seconds.

**How to detect:** `list_network_requests` shows multiple identical requests to the same URL, all returning 404.

**Fix:** Ensure the API endpoint exists and the server has been restarted with the latest code.

## Stale browser dialogs

**Problem:** `window.confirm()` and `window.prompt()` dialogs from previous interactions survive page navigations. When you `navigate_page`, the stale dialog appears and blocks all MCP interaction.

**Fix:** After every `navigate_page`, check if the response mentions "Open dialog". If so:
```
handle_dialog action=dismiss
navigate_page type=reload
```

## Port conflicts

**Problem:** Dev servers from previous sessions may still be running on ports 8787 (API) and 5174 (PWA). Starting `pnpm dev` fails with `EADDRINUSE`.

**Fix:** Always kill existing processes before starting:
```bash
lsof -ti:8787 2>/dev/null | xargs kill 2>/dev/null
lsof -ti:5174 2>/dev/null | xargs kill 2>/dev/null
```

## Vite port auto-increment

**Problem:** Vite's dev server auto-increments the port if occupied (5174 → 5175 → 5176). If you don't kill the old PWA process, the new one starts on a different port, and Chrome MCP navigates to the wrong URL.

**Fix:** Always kill port 5174 before starting. Always use `http://localhost:5174` as the base URL.

### Known issues
- [2026-03-25] All items above discovered during funding links + delete transaction testing session.
