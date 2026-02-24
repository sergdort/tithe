CREATE TABLE IF NOT EXISTS reimbursement_category_rules (
  id TEXT PRIMARY KEY,
  expense_category_id TEXT NOT NULL,
  inbound_category_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(expense_category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY(inbound_category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reimbursement_category_rules_expense_idx
  ON reimbursement_category_rules(expense_category_id);

CREATE INDEX IF NOT EXISTS reimbursement_category_rules_inbound_idx
  ON reimbursement_category_rules(inbound_category_id);

CREATE UNIQUE INDEX IF NOT EXISTS reimbursement_category_rules_pair_uq
  ON reimbursement_category_rules(expense_category_id, inbound_category_id);
