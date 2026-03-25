CREATE TABLE IF NOT EXISTS funding_links (
  id TEXT PRIMARY KEY,
  income_expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  transfer_expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS funding_links_income_idx
  ON funding_links(income_expense_id);

CREATE INDEX IF NOT EXISTS funding_links_transfer_idx
  ON funding_links(transfer_expense_id);

CREATE UNIQUE INDEX IF NOT EXISTS funding_links_idempotency_key_uq
  ON funding_links(idempotency_key);
