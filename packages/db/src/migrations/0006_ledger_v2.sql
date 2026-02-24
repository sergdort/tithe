ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'
  CHECK (kind IN ('expense', 'income', 'transfer_internal', 'transfer_external'));

ALTER TABLE expenses ADD COLUMN reimbursement_status TEXT NOT NULL DEFAULT 'none'
  CHECK (reimbursement_status IN ('none', 'expected', 'partial', 'settled', 'written_off'));

ALTER TABLE expenses ADD COLUMN my_share_minor INTEGER
  CHECK (my_share_minor IS NULL OR my_share_minor >= 0);

ALTER TABLE expenses ADD COLUMN closed_outstanding_minor INTEGER
  CHECK (closed_outstanding_minor IS NULL OR closed_outstanding_minor >= 0);

ALTER TABLE expenses ADD COLUMN counterparty_type TEXT;
ALTER TABLE expenses ADD COLUMN reimbursement_group_id TEXT;
ALTER TABLE expenses ADD COLUMN reimbursement_closed_at TEXT;
ALTER TABLE expenses ADD COLUMN reimbursement_closed_reason TEXT;

ALTER TABLE categories ADD COLUMN reimbursement_mode TEXT NOT NULL DEFAULT 'none'
  CHECK (reimbursement_mode IN ('none', 'optional', 'always'));
ALTER TABLE categories ADD COLUMN default_counterparty_type TEXT;
ALTER TABLE categories ADD COLUMN default_recovery_window_days INTEGER;
ALTER TABLE categories ADD COLUMN default_my_share_mode TEXT;
ALTER TABLE categories ADD COLUMN default_my_share_value INTEGER;

CREATE TABLE IF NOT EXISTS reimbursement_links (
  id TEXT PRIMARY KEY,
  expense_out_id TEXT NOT NULL,
  expense_in_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(expense_out_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY(expense_in_id) REFERENCES expenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reimbursement_links_out_idx
  ON reimbursement_links(expense_out_id);
CREATE INDEX IF NOT EXISTS reimbursement_links_in_idx
  ON reimbursement_links(expense_in_id);
CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_links_idempotency_key_uq
  ON reimbursement_links(idempotency_key);

DROP TABLE IF EXISTS monzo_category_mappings;

CREATE TABLE IF NOT EXISTS monzo_category_mappings (
  monzo_category TEXT NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('in', 'out')),
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (monzo_category, flow),
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT
);
