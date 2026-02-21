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
- `packages/integrations-monzo`: Monzo integration contracts/stubs.
- `tests`: Vitest + Supertest + Playwright test suites.

## Core Architecture

- Runtime: Node.js 22+
- Language: TypeScript end-to-end
- DB: SQLite (WAL, foreign keys on)
- ORM: Drizzle
- API: Fastify + Zod + OpenAPI docs at `/docs`
- CLI: `commander` + JSON-first contract
- PWA: React + Vite + MUI + TanStack Query + installable manifest
- Tooling: Biome (lint + format)

## Local Setup

### 1. Prerequisites

- Node.js 22+
- pnpm 10+
- Tailscale configured on host and mobile device (for private access)

### 2. Install

```bash
pnpm install
```

### 3. Configure env

```bash
cp .env.example .env
```

Important variables:

- `DB_PATH`: SQLite file path (default `./tithe/tithe.sqlite`)
- `PORT`, `HOST`: API bind values
- `VITE_API_BASE`: PWA API target (default local: `http://127.0.0.1:8787/v1`; set Tailnet URL for mobile access)
- `PWA_PORT`: PWA dev server port (default `5173`)
- `PWA_PREVIEW_PORT`: PWA preview server port (default `4173`)
- `MONZO_*`: Monzo OAuth settings (needed in Milestone 3+)

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
- Set `PWA_PORT` (for example `5174`) when another PWA already uses `5173`.

## API Overview

Base path: `/v1`

### Resources

- `GET/POST/PATCH/DELETE /categories`
- `GET/POST/PATCH/DELETE /expenses`
- `GET/POST/PATCH/DELETE /commitments`
- `POST /commitments/run-due`
- `GET /commitment-instances`
- `GET /reports/trends`
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

## CLI Overview

Use `--json` for deterministic AI parsing.

```bash
tithe --json category list
tithe --json expense list --limit 50
tithe --json commitment run-due
tithe web
```

CLI behavior note:

- Running `tithe` without a subcommand prints help and exits successfully.
- Database migrations run lazily when a command executes, so help-only invocations do not touch SQLite.

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

- Endpoints and contracts are scaffolded.
- Full OAuth token management and incremental import engine are pending Milestone 3.

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
- Milestone 3: full Monzo OAuth + import + scheduled sync.
- Milestone 4: analytics expansion, encrypted backups, hardening.
