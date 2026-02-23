# Monzo Import Model v2 (Draft)

Status: proposed
Scope: development environment (DB reset acceptable)

## Decision

Use **provider-prefixed canonical IDs** for imported expenses.

- Monzo imported expense ID format: `monzo:tx_<monzoTransactionId>`
- Upserts during sync should target this ID directly (`onConflictDoUpdate`)

This removes UUID/externalRef indirection for Monzo rows and makes resync deterministic.

---

## Goals

1. Deterministic idempotent imports
2. Simple overwrite-on-resync for Monzo-managed fields
3. Support retrospective edits in Monzo (category, merchant metadata, etc.)
4. Keep room for multi-provider future (`provider:external_id` ID namespace)

---

## ID Strategy

### Canonical expense ID

- `expenses.id` becomes:
  - manual: `local:<uuid>` (or keep current UUID if preferred)
  - monzo import: `monzo:tx_<id>`
  - future providers: `provider:<provider-id>`

### Source identity fields

Keep explicit fields even with canonical ID:

- `source` (`manual` | `monzo_import` | `commitment`)
- `provider` (`monzo` | null)
- `providerTransactionId` (Monzo tx id | null)

Recommended unique index:

- `UNIQUE(provider, providerTransactionId)` where providerTransactionId is not null

---

## Expenses fields ownership

### Monzo-managed fields (overwrite on each sync)

- `occurredAt`
- `postedAt`
- `amountMinor`
- `currency`
- `categoryId` (based on current mapping)
- `merchantName`
- `merchantLogoUrl`
- `merchantEmoji`
- `note` (if mapped from provider description)
- `transferDirection` (if derived)

### Local-managed fields (preserve)

- optional local annotations (if/when introduced), e.g. `localNote`, `isFlagged`

Rule:
- If field is provider-derived, sync is source of truth.
- If field is user-local, sync must not clobber.

---

## Raw + Projection model

Keep both layers:

1. `monzo_transactions_raw` (raw payload source of truth)
2. `expenses` (normalized projection consumed by app)

Resync pipeline:

1. upsert raw by `transaction_id`
2. project to `expenses` via canonical `id = monzo:tx_<id>`
3. `onConflictDoUpdate` projection fields

---

## Sync semantics

### Initial sync

- backfill window (existing logic)
- create/update projected expenses with canonical IDs

### Incremental sync

- pull window from cursor overlap
- upsert raw
- upsert projection

### Re-sync month override

- same mechanism, scoped window
- update existing projected rows in place via canonical ID

---

## API/CLI contract impact

No user-facing behavior change required, but internals become more stable.

Optional additions:

- expose `provider` and `providerTransactionId` in expense response for debugging
- add `managedByProvider: boolean`

---

## Implementation plan (drop-db friendly)

Because project data is disposable in dev:

1. Update DB schema
   - add `provider`, `providerTransactionId`
   - add unique index `(provider, providerTransactionId)`
2. Update domain models/contracts
3. Update Monzo sync projection
   - set `id = monzo:tx_<id>`
   - set provider fields
   - use upsert-on-id
4. Drop/recreate DB and run migrations
5. Sync from Monzo again
6. Validate:
   - re-sync updates existing rows, does not duplicate
   - category remaps apply correctly on re-sync

---

## Validation checklist

- [ ] first sync imports expected count
- [ ] second sync same window imports 0 new, updates existing
- [ ] changing category in Monzo then re-sync updates local category
- [ ] merchant metadata updates are reflected after re-sync
- [ ] no duplicates by provider transaction ID

---

## Open choices

1. Manual expense ID format
   - keep UUID (minimal change), or
   - prefix with `local:` for consistency

2. Keep `externalRef`
   - keep temporarily for compatibility, or
   - remove after provider fields fully adopted

3. Provider enum location
   - strict enum in contracts, or free string with allowlist validation
