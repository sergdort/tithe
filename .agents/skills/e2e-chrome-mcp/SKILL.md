---
name: e2e-chrome-mcp
description: End-to-end test features in the browser using Chrome DevTools MCP tools alongside the real API and database
metadata:
  tags: testing, e2e, chrome, mcp, browser, integration
---

## When to use

**Proactive use (agent should initiate without being asked):**
- After completing a UI feature that touches user-facing interactions (buttons, dialogs, forms, navigation)
- After fixing a bug that was reported via the browser — verify the fix visually
- After changing API response shapes that the PWA consumes — verify the UI still renders correctly
- After modifying ledger calculations or summary displays — verify the numbers update in the UI

**Reactive use (user explicitly asks):**
- "Test this in the browser", "verify end to end", "check if it works", "use chrome to test"
- "Does the delete button work?", "Can you try the dialog?"
- Debugging a frontend issue by inspecting network requests, console errors, or DOM state

Do NOT use for:
- Unit tests (use vitest skill instead)
- API-only testing (use `app.inject()` in vitest)
- Playwright mobile tests (those have their own setup in `tests/pwa/`)
- Backend-only changes with no UI impact

## How to use

Follow the test flow in this order:

1. **Pre-flight** (`rules/preflight.md`) — ensure servers are running and healthy
2. **Seed data** — create test data via UI interactions or direct API calls
3. **Test** (`rules/patterns.md`) — navigate, interact, and verify using MCP tools
4. **Check for issues** (`rules/gotchas.md`) — known pitfalls to watch for
5. **Report** — after testing, propose improvements to this skill

Use `rules/template.md` as a step-by-step checklist for each test run.

## Core principles

- **Prefer `take_snapshot` over `take_screenshot`** — text snapshots are searchable, faster, and don't require image analysis
- **Always verify after action** — take a snapshot after every click, form submission, or navigation
- **Check network + console** — don't just check the UI; verify API calls succeeded and no errors logged
- **Dismiss stale dialogs** — browser dialogs from previous tests persist; always dismiss before proceeding
- **Use `evaluate_script` as escape hatch** — when MCP tools can't reach an element, run JS directly

## Session learnings

After each E2E testing session, append a dated entry here with discoveries, issues encountered, and improvements made.

### 2026-03-25 — Initial session (funding links, delete, link-as-funded)
- `click` times out on elements below the fold — use `evaluate_script` with `scrollIntoView().click()` as fallback
- Stale `window.confirm` dialogs persist across `navigate_page` calls — always call `handle_dialog action=dismiss` after navigation if a dialog appears
- `node --watch` does not watch pnpm workspace dependency `dist/` directories — use `--watch-path` to explicitly include them
- Fastify `additionalProperties: false` in response schemas silently strips new fields — always update route schemas when adding fields to domain DTOs
- `handle_dialog` requires `action` param (not `accept` boolean) — use `action=accept` or `action=dismiss`
- React Query retries failed requests with exponential backoff — a 404 from a missing API endpoint causes perceived slowness (multiple retry attempts)
- Port 8787 (API) and 5174 (PWA) may be occupied from previous sessions — kill before starting
