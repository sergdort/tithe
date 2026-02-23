# AGENTS

Machine-oriented guidance for OpenClaw and other AI agents operating Tithe.

## Purpose

Tithe is a single-user, local-first expense tracker. Agents interact primarily through the CLI (`tithe`) and can use API endpoints for UI-aware workflows.

## Documentation Maintenance Rule

⚠️ **When adding new features or modifying existing CLI/PWA/API behavior, update ALL documentation files in the same change:**
1. `AGENTS.md` - Technical details and implementation notes
2. `README.md` - User-facing overview and quick start

This ensures all documentation stays in sync.

## Core Interaction Contract

- Preferred interface: CLI with `--json`.
- API is private and intended for PWA + controlled automation.
- Do not write directly to SQLite unless explicitly requested by a human operator.

## Safety Boundaries

- Destructive operations (`delete`) require explicit approval token flow.
- Never bypass approval checks.
- Never assume internet-exposed access; operate within Tailnet/private network assumptions.

## JSON Envelope

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Failure:

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

## Command Catalog

### Categories

- `tithe --json category list`
- `tithe --json category add --name "Groceries" --kind expense`
- `tithe --json category update --id <id> --name "Food"`
- `tithe --json category delete --id <id> --dry-run`
- `tithe --json category delete --id <id> --approve <operationId> [--reassign <id>]`

### Expenses

- `tithe --json expense list [--from <iso>] [--to <iso>] [--category-id <id>] [--limit <n>]`
- `tithe --json expense add --occurred-at <iso> --amount-minor <int> --currency GBP --category-id <id>`
- `tithe --json expense update --id <id> [fields...]`
- `tithe --json expense delete --id <id> --dry-run`
- `tithe --json expense delete --id <id> --approve <operationId>`

### Recurring commitments

- `tithe --json commitment list`
- `tithe --json commitment add --name "Mortgage" --rrule "FREQ=MONTHLY;INTERVAL=1" --start-date <iso> --default-amount-minor 150000 --currency GBP --category-id <id>`
- `tithe --json commitment update --id <id> [fields...]`
- `tithe --json commitment run-due [--up-to <iso>]`
- `tithe --json commitment instances [--status pending|paid|overdue|skipped]`
- `tithe --json commitment delete --id <id> --dry-run`
- `tithe --json commitment delete --id <id> --approve <operationId>`

### Reports and query

- `tithe --json report trends [--months <n>]`
- `tithe --json report category-breakdown [--from <iso>] [--to <iso>]`
- `tithe --json report commitment-forecast [--days <n>]`
- `tithe --json query --entity expenses --filter '{"field":"amount_minor","op":"gt","value":1000}'`

### Web runtime

- `tithe web [--mode dev|preview] [--api-port <port>] [--pwa-port <port>]`
- `tithe --json web [--mode dev|preview] [--api-port <port>] [--pwa-port <port>]`

### Monzo

- `tithe --json monzo connect`
- `tithe --json monzo sync`
- `tithe --json monzo status`
- PWA Home exposes Monzo controls (`Connect`, `Sync now`) and shows last sync/error state.
- PWA `Connect` opens Monzo OAuth in a separate browser window/tab (popup opened synchronously on click to reduce popup blocking).
- PWA Expenses list merchant avatar fallback is `logo -> emoji -> initials` for Monzo-imported expenses when display metadata is available.

### CLI invocation notes

- Invoking `tithe` without a subcommand should print help and exit successfully.
- DB migrations are expected to run lazily on command execution, not on help-only invocations.
- API and CLI entrypoints auto-load workspace-root `.env` via `dotenv` if present (existing exported env vars still take precedence).
- Default `DB_PATH` is `~/.tithe/tithe.db`; leading `~` is expanded to the current user's home directory.
- `tithe web` launches API + PWA in foreground mode (`--mode dev` by default).
- `tithe web --mode preview` builds `@tithe/api` and `@tithe/pwa` before launch.
- `--api-port` overrides API `PORT`; for `tithe web`, PWA `VITE_API_BASE` is preserved by default and has its port rewritten when `--api-port` is provided (fallback: `http://<api-host>:<api-port>/v1`).
- `--pwa-port` sets `PWA_PORT` in `dev` mode or `PWA_PREVIEW_PORT` in `preview` mode.
- `tithe --json web` emits one startup envelope first, then streams prefixed service logs.
- PWA API requests use a 10-second timeout and transition to error state if backend is unreachable.
- `tithe --json monzo connect` stores short-lived OAuth `state` and returns `authUrl`.
- `GET /v1/integrations/monzo/connect/callback` requires query `code+state` or `error`.
- Monzo OAuth callback stores/refreshes tokens only and does not auto-run sync; first import happens on manual `monzo sync` / PWA `Sync now`.
- `tithe --json monzo sync` imports settled debit Monzo transactions only (`amount < 0`, pending skipped).
- Monzo import dedupe key is `source='monzo_import' + externalRef=transaction.id`.
- Expense API responses include optional Monzo merchant display metadata (`merchantLogoUrl`, `merchantEmoji`) for UI avatar rendering.
- Monzo sync best-effort resolves pot-transfer descriptions that contain a Monzo pot ID (`pot_...`) to a display label `Pot: <Pot Name>` for new imports; if pot lookup fails or no pot matches, the raw description is kept.
- Monzo merchant logo/emoji metadata is persisted for new imports only; historical imports are not backfilled automatically.
- Initial Monzo sync backfills 90 days; subsequent syncs use a 3-day overlap from `lastCursor`.
- Monzo category mappings auto-create categories named `Monzo: <Category>` when missing.
- Optional `MONZO_SCOPE` can be set when building Monzo auth URL; if unset, no explicit scope is requested.

### API dev runtime notes

- `@tithe/api` dev script runs via `node --import tsx src/index.ts` (no file watch) to avoid tsx IPC socket failures in restricted environments.
- Swagger/OpenAPI operations at `/docs` are generated from Fastify route `schema` definitions in `apps/api/src/features/*/routes.ts`; when adding or changing endpoints, update route schemas in the same change.
- API route composition is centralized in `apps/api/src/http/register-feature-routes.ts`; keep feature registration order stable to preserve Swagger tag grouping order.
- Use prefix-based feature route registration and define collection roots with an empty route path (`''`) to keep canonical OpenAPI paths without trailing slashes.
- API runtime config is validated once at startup in `apps/api/src/config.ts` (`HOST`, `PORT`, `LOG_LEVEL`, `CORS_ALLOWED_ORIGINS`).
- In API feature routes, Fastify JSON Schema is the request validation source of truth; avoid per-handler `zod.parse(request.body|query|params)` duplication.
- API must return envelope-form errors for Fastify validation failures (`VALIDATION_ERROR`), unknown routes (`NOT_FOUND`), domain errors, and unexpected internal errors.

### Domain architecture notes

- Domain business logic is feature-split and created via `createDomainServices()` in `packages/domain/src/services/create-domain-services.ts`.
- Service registry shape is `DomainServices`:
  - `categories`, `expenses`, `commitments`, `reports`, `query`, `monzo`.
- `createDomainServices()` returns a closable service registry (`DomainServices` + `close()`), backed by a single long-lived SQLite connection for that runtime instance.
- Shared infrastructure lives under `packages/domain/src/services/shared`:
  - `domain-db.ts`: long-lived DB runtime (`db`, `sqlite`, `close`) + `DomainServiceOptions`.
  - `approval-service.ts`: approval token creation/consumption.
  - `audit-service.ts`: audit log writes.
  - `common.ts`: date/currency/hash helpers + default actor.
- Feature services instantiate repository classes directly against the runtime DB/transaction handle; `RepositoryFactories` and `DomainRuntimeDeps` are no longer used.
- Keep feature boundaries pragmatic: cross-feature flows are allowed inside feature services when transactional consistency is required.
  - Example: expense create/delete may update commitment instance status.
  - Example: category delete may reassign both expense and commitment references.
- `ExpenseTrackerService` is removed; do not reintroduce a monolithic domain service facade.
- Public domain exports are registry-based (`createDomainServices`, `DomainServices`, feature service types).

### API route-handler architecture notes

- Fastify app context is decorator-based:
  - `apps/api/src/http/tithe-plugin.ts` decorates `FastifyInstance` with `app.tithe` (`services`, docs helpers, actor parsing helpers).
  - `BuildServerOptions` accepts `services?: DomainServices` for external injection/stubs.
  - The plugin owns lifecycle cleanup only for internally created services (`createDomainServices()`), and calls `close()` during `app.close()`.
- Each feature route module owns only its feature service reference:
  - `categories/routes.ts` -> `services.categories`
  - `expenses/routes.ts` -> `services.expenses`
  - `commitments/routes.ts` -> `services.commitments`
  - `reports/routes.ts` -> `services.reports`
  - `query/routes.ts` -> `services.query`
  - `monzo/routes.ts` -> `services.monzo`
- Feature route registrars read dependencies from `app.tithe` (no explicit `ctx` parameter plumbing).
- Handler style:
  - Parse/validate with Fastify schemas.
  - Delegate to one feature service call.
  - Wrap success with `ok(...)`.
  - Let `AppError` and validation failures flow to central Fastify error handler.
- For destructive endpoints, keep approval flow in route handlers:
  - `dryRun` returns approval token metadata.
  - non-`dryRun` requires approval token and executes delete.

### Workspace run scripts

- Root dev scripts: `pnpm dev:api`, `pnpm dev:pwa`, `pnpm dev:cli`.
- Root start scripts (for built artifacts): `pnpm start:api`, `pnpm start:pwa`, `pnpm start:cli`.
- Root native SQLite smoke check: `pnpm check:sqlite` (runs `@tithe/db` `better-sqlite3` `:memory:` open/close).
- Root native SQLite repair: `pnpm repair:sqlite` (runs `better-sqlite3` package install script, then `pnpm check:sqlite`).
- Root first-time bootstrap: `pnpm setup:first-time` (runs install, creates `.env` from `.env.example` if missing, checks sqlite binding, and attempts repair on failure).
- Root SQLite-dependent scripts (`pnpm dev`, `pnpm dev:api`, `pnpm start:api`, `pnpm db:migrate`) run `pnpm check:sqlite` first and fail fast when the native binding is missing.
- Root `package.json` allowlists `better-sqlite3` in `pnpm.onlyBuiltDependencies` so pnpm can run its native build script during install/rebuild.
- Root `pnpm dev` defaults `VITE_API_BASE` to `http://127.0.0.1:8787/v1`; override it explicitly for Tailnet/mobile runs.
- PWA ports are configurable through root env vars: `PWA_PORT` (dev) and `PWA_PREVIEW_PORT` (preview/start).
- Global CLI link workflow: `pnpm --filter @tithe/cli build`, then `pnpm link --global ./apps/cli`.
- After linking globally in zsh, refresh the shell command cache (`exec zsh` or `hash -r`) before invoking `tithe`.
- After CLI code changes, rebuild with `pnpm --filter @tithe/cli build` (relink is not required for an existing global link).
- Force-refresh global link if needed: `pnpm remove --global tithe`, `pnpm link --global ./apps/cli`, then `hash -r`/`exec zsh`.
- If `tithe` is not found after linking, run `pnpm setup`, restart zsh, and verify `PNPM_HOME` is on `PATH`.
- Remove global CLI link with `pnpm remove --global tithe`.
- Team runtime pin for native SQLite stability: use Node `22.x` (`.nvmrc`).
- If `better-sqlite3` fails with "Could not locate the bindings file", the native addon was not built for the active Node ABI. First check `pnpm check:sqlite`; if broken, run `pnpm repair:sqlite` under Node `22.x`.
- Fallback manual repair remains `pnpm rebuild better-sqlite3` (or `pnpm rebuild --pending better-sqlite3`) plus `pnpm check:sqlite`.
- If reinstalling still does not fix native bindings, inspect `pnpm ignored-builds`; pnpm may have auto-ignored `better-sqlite3` script execution.

## Approval Token Workflow

For destructive actions:

1. Run command with `--dry-run`.
2. Read `operationId` from response.
3. Re-run command with `--approve <operationId>`.
4. Handle failures:
- `APPROVAL_EXPIRED`: obtain a fresh token.
- `APPROVAL_PAYLOAD_MISMATCH`: retry with unchanged payload.
- `APPROVAL_ALREADY_USED`: tokens are single-use.

## Idempotency and Dedupe Rules

- Prefer `externalRef` on imported expenses.
- Treat source + externalRef uniqueness as immutable dedupe key.
- For recurring, uniqueness is `(commitment_id, due_at)`.

## Time and Money Conventions

- Store timestamps in UTC ISO-8601.
- Render local times in UI if needed.
- Store amounts in integer minor units.
- Preserve original currency and optional normalized base amount.

## Error Codes You Must Handle

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CATEGORY_NOT_FOUND`
- `CATEGORY_IN_USE`
- `EXPENSE_NOT_FOUND`
- `COMMITMENT_NOT_FOUND`
- `INVALID_RRULE`
- `APPROVAL_REQUIRED`
- `APPROVAL_NOT_FOUND`
- `APPROVAL_EXPIRED`
- `APPROVAL_PAYLOAD_MISMATCH`
- `APPROVAL_ALREADY_USED`
- `MONZO_NOT_CONFIGURED`
- `MONZO_CONNECTION_REQUIRED`
- `MONZO_REAUTH_REQUIRED`
- `MONZO_OAUTH_DENIED`
- `MONZO_OAUTH_STATE_MISSING`
- `MONZO_OAUTH_STATE_INVALID`
- `MONZO_OAUTH_STATE_EXPIRED`
- `MONZO_ACCOUNT_NOT_FOUND`
- `MONZO_API_ERROR`
- `MONZO_RESPONSE_INVALID`
- `MONZO_CATEGORY_CREATE_FAILED`
- `INTERNAL_ERROR`

## Recommended Agent Playbooks

### Monthly trend brief

1. `report trends`
2. `report category-breakdown`
3. Summarize top category shifts and potential commitment pressure.

### Commitment reconciliation

1. `commitment run-due`
2. `commitment instances --status overdue`
3. For any paid item missing linkage, prompt for expense creation or auto-create if policy permits.

### Data hygiene

1. `query` for uncategorized/low-quality entries.
2. Suggest category merges/reassignments.
3. Use delete approval workflow only when human-approved.

## Recovery Runbooks

### Sync failures (Monzo)

- Capture endpoint error envelope.
- Check env/token setup.
- For `MONZO_REAUTH_REQUIRED` with Monzo `forbidden.insufficient_permissions`, verify the Monzo developer client has account/transaction read permissions, then reconnect.
- Retry with exponential backoff.
- Do not create synthetic transactions when sync fails.

### Token refresh issues (Monzo)

- Mark integration degraded.
- Surface remediation task for human re-auth.
- Avoid partial writebacks.

### Backup restore checks

- Stop API/CLI writers.
- Restore SQLite file.
- Run smoke queries (`category list`, `expense list`).
- Validate row counts and recent timestamps.

## Agent Behavior Rules

- Prefer read operations before writes.
- For writes, explain intent in logs/summary.
- Never perform destructive operation without explicit approval token.
- Preserve deterministic JSON output in all automated pipelines.

## Agent notes

- Every time you learn something new, or how to do something in the codebase, if you make a mistake that the user corrects, if you find yourself running commands that are often wrong and have to tweak them: write all of this down in `.agents/notes.md`. This is a file just for you that your user won't read.
- If you're about to write to it, first check if what you're writing (the idea, not 1:1) is already present. If so, increment the counter in the prefix (eg from `[0]` to `[1]`). If it's completely new, prefix it with `[0]`. Once a comment hits the count of `3`, codify it into this AGENTS.md file in the `## Misc` section.
