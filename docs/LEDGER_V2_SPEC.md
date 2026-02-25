# Ledger v2 Spec

## 1) Problem

Current ledger mixes different money movements into a single “expense-like” view, which hides true spending and makes cash-flow analysis noisy.

Examples from real workflow:
- Internal moves (Monzo current -> Monthly pot) should not count as spend.
- Fronted team payments (Sunday league) are partly reimbursable.
- Partner transfers offset shared commitments and should reduce net personal burden.

## 2) Goals

1. Separate **cash movement** from **true spending**.
2. Support **reimbursement workflows** (including partial and manual settlement).
3. Keep sync deterministic for imported providers (Monzo currently).
4. Stay practical: ship in small phases without overcomplication.

## 3) Non-goals (v2)

- Full accounting double-entry engine.
- AI-based categorization/matching.
- Multi-user permissioning.

## 4) Core Concepts

### 4.1 Transaction semantic kind

Add a semantic classification independent of `source`:

- `expense`
- `income`
- `transfer_internal`
- `transfer_external` (optional in UI initially)

`source` remains origin (`local | monzo | commitment`).
`kind` defines financial meaning.

### 4.2 Reimbursement model

For expense rows in reimbursement-enabled categories:

- `my_share_minor` (portion that belongs to user and is not expected back)
- `recoverable_minor` = `amount_minor - my_share_minor`
- `recovered_minor` = sum(linked inbound reimbursements)
- `outstanding_minor` = `max(recoverable_minor - recovered_minor, 0)`

Status:
- `none` (not reimbursable)
- `expected`
- `partial`
- `settled`
- `written_off` (manual close with remainder)

### 4.3 Reimbursement linking

Use explicit links for auditability and deterministic recalculation.

A repayment link connects:
- one outgoing reimbursable expense (`expense_out_id`)
- one incoming expense/transaction (`expense_in_id`)
- `amount_minor` allocated

Partial allocations allowed in both directions.

## 5) Data Model Changes

## 5.1 `expenses` table additions

- `kind` TEXT NOT NULL DEFAULT 'expense'
- `reimbursement_status` TEXT NOT NULL DEFAULT 'none'
- `my_share_minor` INTEGER NULL
- `closed_outstanding_minor` INTEGER NULL  -- for manual close/write-off
- `counterparty_type` TEXT NULL            -- self|partner|team|other
- `reimbursement_group_id` TEXT NULL       -- optional grouping key

Notes:
- For non-reimbursable expenses, `my_share_minor` is null.
- For reimbursable expenses, app enforces `0 <= my_share_minor <= amount_minor`.

### 5.2 `categories` table additions

- `reimbursement_mode` TEXT NOT NULL DEFAULT 'none'  -- none|optional|always
- `default_counterparty_type` TEXT NULL
- `default_recovery_window_days` INTEGER NULL
- `default_my_share_mode` TEXT NULL  -- fixed|percent (optional, v2.1)
- `default_my_share_value` INTEGER NULL

### 5.3 New table: `reimbursement_links`

- `id` TEXT PK
- `expense_out_id` TEXT NOT NULL FK -> expenses(id)
- `expense_in_id` TEXT NOT NULL FK -> expenses(id)
- `amount_minor` INTEGER NOT NULL CHECK(amount_minor > 0)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Indexes:
- `reimbursement_links_out_idx(expense_out_id)`
- `reimbursement_links_in_idx(expense_in_id)`
- unique (`expense_out_id`, `expense_in_id`, `amount_minor`, `created_at`) optional.

## 6) Classification & Sync Rules

## 6.1 Monzo -> `kind` mapping (initial deterministic rules)

- Pot/account transfer detected => `transfer_internal`
- amount < 0 and non-transfer => `expense`
- amount > 0 and non-transfer => `income`

(Exact transfer detection reuses/extends existing Monzo pot/description heuristics.)

## 6.2 Category-based reimbursement automation

If a transaction category has reimbursement mode:
- outgoing `expense` rows in that category become reimbursable (`expected`) by default
- incoming rows in same category can auto-link to open reimbursable outflows

Guardrails for auto-link:
- same category
- same currency
- inbound `kind=income` (or transfer_external if enabled)
- within configurable window (default 14 days)
- FIFO allocation (oldest outstanding first)

If ambiguous beyond rules, leave unmatched and mark “needs review”.

## 7) Ledger Calculations

## 7.1 Cash Flow

- Inflow: sum(`kind in [income, transfer_external]` with positive direction)
- Outflow: sum(`kind in [expense, transfer_external]` with negative direction)
- Internal transfer shown separately (`transfer_internal`), excluded from spend KPIs.

## 7.2 Spending

- Gross spend: sum(expense outflows)
- Net personal spend:
  - gross spend
  - minus recovered reimbursements
  - plus written-off remainder if closed manually (or surface separately)

## 7.3 Reimbursement dashboard metrics

- Recoverable total
- Recovered total
- Outstanding total
- Settled count / Partial count

## 8) API Changes

## 8.1 Contracts

Extend expense schema with:
- `kind`
- `reimbursementStatus`
- `myShareMinor`
- derived fields in responses:
  - `recoverableMinor`
  - `recoveredMinor`
  - `outstandingMinor`

## 8.2 New endpoints

- `POST /v1/reimbursements/link`
  - input: `{ expenseOutId, expenseInId, amountMinor }`
- `DELETE /v1/reimbursements/link/:id`
- `POST /v1/reimbursements/:expenseOutId/close`
  - input: `{ reason?: string, closeOutstandingMinor?: number }`
- `POST /v1/reimbursements/:expenseOutId/reopen`

Optional helper:
- `POST /v1/reimbursements/auto-match?from=&to=`

## 9) UI Changes

## 9.1 Category settings

Add reimbursement policy controls:
- Reimbursement mode: None / Optional / Always
- Default counterparty type
- Default recovery window
- (Optional) default my share

## 9.2 Expense row UX

For reimbursable outflow rows:
- show chips: `Reimbursable`, `Partial`, `Settled`
- show values: Recoverable / Recovered / Outstanding
- actions:
  - Link repayment
  - Mark settled (close outstanding)
  - Reopen

## 9.3 Ledger page

Top cards:
- Cash In
- Cash Out
- Net Flow
- True Spend
- Reimbursement Outstanding

Filters:
- All / Spending / Cash Flow / Reimbursements
- Exclude internal transfers toggle
- Gross vs Net toggle

## 10) Migration Plan

Phase A (schema + backend foundations)
1. Add new columns/tables.
2. Backfill `kind` heuristically for existing rows.
3. Keep old behavior compatible where needed.

Phase B (sync + service logic)
1. Monzo kind mapping in sync.
2. Category reimbursement defaults.
3. Auto-link algorithm (safe mode, FIFO, guardrails).

Phase C (UI + reports)
1. Category reimbursement settings.
2. Ledger cards/filters.
3. Reimbursement detail + settle/close actions.

## 11) Acceptance Criteria

1. Pot transfers never inflate spending totals.
2. A football fronted payment with user share tracks as:
   - recoverable = total - my share
   - settled when recoverable is fully matched or manually closed.
3. Partner/shared reimbursements can be linked and reduce net personal spend.
4. Ledger can show both gross cash movement and net personal spend without contradiction.

## 12) Open Decisions

1. Keep `transfer_external` in v2 or defer to v2.1?
2. Should manual close produce a dedicated adjustment row, or store close amount on source expense only?
3. Where to expose unmatched repayment suggestions (home card vs ledger tab)?

## 13) Suggested First Implementation Slice (smallest useful)

1. Add `kind` + reimbursement columns + `reimbursement_links`.
2. Implement category reimbursement mode + my-share on expense edit.
3. Implement link/unlink + derived reimbursement totals.
4. Update monthly ledger report to separate internal transfers and expose net spend.

This slice already solves the core football + pot-transfer pain without needing advanced automation first.
