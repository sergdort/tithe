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

### Monzo (scaffold)

- `tithe --json monzo connect`
- `tithe --json monzo sync`
- `tithe --json monzo status`

### CLI invocation notes

- Invoking `tithe` without a subcommand should print help and exit successfully.
- DB migrations are expected to run lazily on command execution, not on help-only invocations.

### API dev runtime notes

- `@tithe/api` dev script runs via `node --import tsx src/index.ts` (no file watch) to avoid tsx IPC socket failures in restricted environments.

### Workspace run scripts

- Root dev scripts: `pnpm dev:api`, `pnpm dev:pwa`, `pnpm dev:cli`.
- Root start scripts (for built artifacts): `pnpm start:api`, `pnpm start:pwa`, `pnpm start:cli`.
- PWA ports are configurable through root env vars: `PWA_PORT` (dev) and `PWA_PREVIEW_PORT` (preview/start).

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
