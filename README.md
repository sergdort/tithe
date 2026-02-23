# Tithe

Local-first personal expense tracker built for a single user on a personal machine.

## What This Repo Contains

- `apps/api`: private Fastify API (`/v1/*`) for the PWA and automation.
- `apps/cli`: AI-friendly CLI with deterministic JSON envelopes.
- `apps/pwa`: mobile-first React + Material UI progressive web app.
- `packages/contracts`: shared schemas and envelope contract.
- `packages/db`: SQLite + Drizzle schema and migration tooling.
- `packages/domain`: business logic used by both API and CLI.
- `packages/analytics`: trend summary helpers.
- `packages/integrations-monzo`: Monzo API client and payload schemas.
- `tests`: Vitest + Supertest + Playwright test suites.

## Core Architecture

- Runtime: Node.js 22+
- Language: TypeScript end-to-end
- DB: SQLite (WAL, foreign keys on)
- ORM: Drizzle
- API: Fastify + JSON Schema + OpenAPI docs at `/docs`
  - OpenAPI JSON spec: `/docs/json`
  - Operation docs are generated from feature route `schema` definitions under `apps/api/src/features/*/routes.ts`
- CLI: `commander` + JSON-first contract
- PWA: React + Vite + MUI + TanStack Query + installable manifest
- Tooling: Biome (lint + format)

## Local Setup

### 1. Prerequisites

- Node.js 22 LTS (`22.x`, see `.nvmrc`)
- pnpm 10+
- Tailscale configured on host and mobile device (for private access)

### 2. Install

Recommended first-time bootstrap (installs deps, creates `.env` if missing, checks/repairs `better-sqlite3`):

```bash
pnpm setup:first-time
```

Manual steps (if you prefer to run them separately):

```bash
pnpm install
```

If `pnpm` prompts to approve dependency build scripts, approve `better-sqlite3` (native SQLite addon) and rerun install:

```bash
pnpm approve-builds
pnpm install
```

This repo also allowlists `better-sqlite3` in `package.json` (`pnpm.onlyBuiltDependencies`) so pnpm can run its native build script during install/rebuild without interactive approval.

Verify the native SQLite binding before starting dev servers:

```bash
pnpm check:sqlite
```

If the check fails due to a missing `better-sqlite3` binding, run the one-shot repair command:

```bash
pnpm repair:sqlite
```

### 3. Configure env

If you used `pnpm setup:first-time`, `.env` is created automatically when missing.
Otherwise:

```bash
cp .env.example .env
```

Important variables:

- `DB_PATH`: SQLite file path (default `~/.tithe/tithe.db`; `~` is expanded to your home directory)
- `PORT`, `HOST`: API bind values
- `LOG_LEVEL`: API logger level (`fatal|error|warn|info|debug|trace`, default `info`)
- `CORS_ALLOWED_ORIGINS`: comma-separated allow-list for CORS (default `*`)
- `VITE_API_BASE`: PWA API target (default local: `http://127.0.0.1:8787/v1`; set Tailnet URL for mobile access)
- `PWA_PORT`: PWA dev server port (default `5173`)
- `PWA_PREVIEW_PORT`: PWA preview server port (default `4173`)
- `MONZO_*`: Monzo OAuth settings for connect/sync (`MONZO_CLIENT_ID`, `MONZO_CLIENT_SECRET`, `MONZO_REDIRECT_URI`, optional `MONZO_SCOPE`)

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Start apps

```bash
pnpm dev:api
pnpm dev:pwa
pnpm dev:cli
```

Or run all workspace dev servers:

```bash
pnpm dev
```

`pnpm dev` defaults `VITE_API_BASE` to `http://127.0.0.1:8787/v1` for local development.
Root scripts that depend on SQLite (`pnpm dev`, `pnpm dev:api`, `pnpm start:api`, `pnpm db:migrate`) run `pnpm check:sqlite` first and fail fast if the native `better-sqlite3` binding is missing.
To test mobile/Tailnet against `pnpm dev`, override it explicitly, for example:

```bash
VITE_API_BASE=http://<your-tailnet-ip>:8787/v1 pnpm dev
```

Start built apps separately (after `pnpm build`):

```bash
pnpm start:api
pnpm start:pwa
pnpm start:cli
```

### 6. Build and link CLI globally

Build the CLI package and link it globally so `tithe` is available in your shell:

```bash
pnpm --filter @tithe/cli build
pnpm link --global ./apps/cli
exec zsh
tithe --help
```

If you do not want to restart the shell, run `hash -r` before `tithe --help`.
If `tithe` is still not found, run `pnpm setup`, restart zsh, and ensure `PNPM_HOME` is on your `PATH`.

To remove the global link later:

```bash
pnpm remove --global tithe
```

When you change CLI code and want the globally linked command to pick up the new build:

```bash
pnpm --filter @tithe/cli build
hash -r
tithe --help
```

If you want to force-refresh the global link:

```bash
pnpm remove --global tithe
pnpm link --global ./apps/cli
hash -r
```

Development note:

- `dev:api` runs the API directly (`node --import tsx src/index.ts`) without automatic reload.
- API and CLI entrypoints auto-load workspace `.env` via `dotenv` if present (without overriding already exported env vars).
- Set `PWA_PORT` (for example `5174`) when another PWA already uses `5173`.
- If you see `better-sqlite3` "Could not locate the bindings file", the native addon was not built for your current Node runtime. Use Node `22.x`, then run `pnpm repair:sqlite` and rerun your original command.
- Fallback repair (if you want the lower-level steps): `pnpm rebuild better-sqlite3` or `pnpm rebuild --pending better-sqlite3`, then `pnpm check:sqlite`.
- If reinstalling does not help, check `pnpm ignored-builds`; pnpm may have auto-ignored `better-sqlite3` build scripts.

## API Overview

Base path: `/v1`

### Resources

- `GET/POST/PATCH/DELETE /categories`
- `GET/POST/PATCH/DELETE /expenses`
- `GET/POST/PATCH/DELETE /commitments`
- `POST /commitments/run-due`
- `GET /commitment-instances`
- `GET /reports/trends`
- `GET /reports/monthly-ledger`
- `GET /reports/category-breakdown`
- `GET /reports/commitment-forecast`
- `POST /query/run`
- `POST /integrations/monzo/connect/start`
- `GET /integrations/monzo/connect/callback`
- `POST /integrations/monzo/sync`
- `GET /integrations/monzo/status`

### Envelope Contract

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable",
    "details": {}
  }
}
```

API error behavior:

- Fastify request validation failures return `400` with envelope code `VALIDATION_ERROR`.
- Unknown routes return `404` with envelope code `NOT_FOUND`.
- Domain `AppError` failures preserve their status code and error code in the envelope.

## CLI Overview

Use `--json` for deterministic AI parsing.

```bash
tithe --json category list
tithe --json expense list --limit 50
tithe --json report monthly-ledger --month 2026-02
tithe --json commitment run-due
tithe web
```

CLI behavior note:

- Running `tithe` without a subcommand prints help and exits successfully.
- Database migrations run lazily when a command executes, so help-only invocations do not touch SQLite.
- `tithe --json report monthly-ledger` defaults to the current local calendar month if no `--month` or `--from/--to` range is provided.
- `tithe --json expense add/update` accept `--transfer-direction in|out` for `transfer` categories.

### Run web stack from CLI

Use `tithe web` to launch API + PWA together in the foreground:

```bash
tithe web
tithe web --mode preview
tithe web --api-port 9797 --pwa-port 5174
tithe --json web --mode dev
```

Runtime notes:

- `--mode dev` is the default.
- `--mode preview` automatically runs `@tithe/api` and `@tithe/pwa` builds before starting preview services.
- `tithe web` preserves configured `VITE_API_BASE` by default.
- If `--api-port` is set, `tithe web` rewrites the port in `VITE_API_BASE` when possible and falls back to `http://<api-host>:<api-port>/v1`.
- `--api-port` overrides API `PORT` for this command.
- `--pwa-port` maps to `PWA_PORT` in dev mode and `PWA_PREVIEW_PORT` in preview mode.
- `--json` emits one startup envelope before live prefixed logs are streamed.
- PWA API requests time out after 10 seconds and surface an error state instead of loading indefinitely.

### Safety gate for destructive operations

1. Request approval token:

```bash
tithe --json expense delete --id <expenseId> --dry-run
```

2. Execute with token:

```bash
tithe --json expense delete --id <expenseId> --approve <operationId>
```

Same pattern applies to category and commitment delete.

## PWA and Tailscale

- Intended for mobile, installed from browser as home-screen app.
- Configure `VITE_API_BASE` to your machine Tailnet API URL.
- API should stay private to Tailnet (no public exposure).

## Monzo Sync Status

Current status in this implementation:

- OAuth connect flow is implemented (`tithe --json monzo connect` returns `authUrl`).
- OAuth callback endpoint is implemented at `GET /v1/integrations/monzo/connect/callback`.
- OAuth callback stores tokens/connection state only (no automatic sync).
- Manual sync is implemented (`tithe --json monzo sync`, with optional `--month` / `--from --to` windowing and `--override`).
- Status endpoint is implemented (`tithe --json monzo status` and `GET /v1/integrations/monzo/status`).
- PWA Home screen includes a Monzo card with `Connect` plus status/last-sync details (month sync lives on the Monthly Ledger widget).
- PWA Home screen embeds a monthly cashflow ledger with month navigation, category breakdown lists, and both `Operating Surplus` and `Net Cash Movement` totals.
- PWA Home Monthly Ledger widget includes `Sync month`, which syncs the selected month window and overwrites existing imported Monzo expenses for that month.
- Monthly Ledger sync feedback is month-scoped and clears when you navigate to another month.
- PWA Home includes a single `Add Transaction` flow for manual `income`, `expense`, and `transfer` entries (transfer entries require direction: `Money in` / `Money out`).
- PWA Home pending commitments support `Mark paid`, which creates a linked actual transaction (`source=commitment`) and updates the monthly ledger.
- Home dashboard cards load independently: a ledger/Monzo/commitments fetch error is shown in that card without blocking the entire Home screen.
- `Connect` opens the Monzo OAuth flow in a separate window/tab (opened immediately on click to avoid popup blocking after async API calls).
- Initial import window is last 90 days; subsequent sync uses cursor overlap.
- Import policy is expenses-only (`amount < 0`) and settled-only (pending skipped).
- Imported expenses use `source=monzo_import` and `externalRef=<transaction_id>` for dedupe.
- `tithe --json monzo sync --override` (or PWA Monthly Ledger `Sync month`) overwrites existing `monzo_import` rows in place using latest Monzo-derived category/amount/date/merchant fields while preserving local notes.
- Expense API responses include optional Monzo merchant display metadata (`merchantLogoUrl`, `merchantEmoji`) used by the PWA expenses list avatar.
- Expense API responses also include `transferDirection` (`in|out|null`); transfer-category rows require it, income/expense rows return `null`.
- PWA expenses list merchant avatars use `logo -> emoji -> initials` fallback for imported Monzo merchants.
- Monzo sync best-effort resolves pot-transfer descriptions that are raw Monzo pot IDs (`pot_...`) into display labels like `Pot: Savings` for new imports; if pot lookup fails or the pot is missing, the raw description is kept.
- Merchant logo/emoji metadata is stored for new Monzo imports only (no historical backfill for older imported rows).
- Monzo category mappings auto-create `expense` categories named `Monzo: <Category>`.
- If Monzo denies permissions during sync/account access (`forbidden.insufficient_permissions`), Tithe surfaces a sync error and preserves the message in Monzo status `lastError` until a later successful sync clears it.

Typical local flow:

```bash
tithe --json monzo connect
# Open returned data.authUrl in browser and approve access
# Monzo redirects back to /v1/integrations/monzo/connect/callback (stores tokens only; no auto-sync)
tithe --json monzo status
tithe --json monzo sync
tithe --json monzo sync --month 2026-02 --override
tithe --json monzo sync --from 2026-02-01T00:00:00Z --to 2026-03-01T00:00:00Z --override
```

Cashflow ledger and transfer examples:

```bash
tithe --json report monthly-ledger --month 2026-02
tithe --json expense add --occurred-at 2026-02-10T09:00:00Z --amount-minor 100000 --currency GBP --category-id <transfer-category-id> --transfer-direction out
```

PWA flow:

- Open Home page in the PWA.
- Use `Connect` to start OAuth (opens Monzo auth URL in a new window/tab).
- After OAuth callback completes (and any in-app permission approval is done), return to PWA Home and use `Sync month` in the Monthly Ledger widget for the month you want to import/refresh.

## Database Backup / Restore

Current baseline:

- SQLite file is stored at `DB_PATH`.
- Use file-level copy when API/CLI are stopped.
- Encryption workflow and automated backup jobs are planned for Milestone 4.

## Testing

Run lint/type/test:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Additional mobile E2E suite:

```bash
pnpm --filter @tithe/tests test:pwa
```

## Troubleshooting

- `CATEGORY_IN_USE`: pass reassign category or move linked expenses/commitments first.
- `APPROVAL_REQUIRED`: destructive action was attempted without dry-run approval token.
- `INVALID_RRULE`: commitment recurrence rule format is invalid.
- `APPROVAL_EXPIRED`: run dry-run again and use the new token.
- `Could not locate the bindings file` (better-sqlite3): run `pnpm rebuild better-sqlite3`.

## Roadmap Alignment

- Milestone 1: monorepo, DB migrations, API/CLI/PWA shell, Biome, docs.
- Milestone 2: category/expense/commitment features + safety gates + mobile flows.
- Milestone 3: Monzo OAuth + import + sync lifecycle hardening.
- Milestone 4: analytics expansion, encrypted backups, hardening.
