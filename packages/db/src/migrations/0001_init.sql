CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL DEFAULT 'GBP',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'receipt_long',
  color TEXT NOT NULL DEFAULT '#2E7D32',
  is_system INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_kind_uq ON categories(name, kind);

CREATE TABLE IF NOT EXISTS recurring_commitments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rrule TEXT NOT NULL,
  start_date TEXT NOT NULL,
  default_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount_base_minor INTEGER,
  fx_rate REAL,
  category_id TEXT NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  next_due_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS commitments_category_idx ON recurring_commitments(category_id);

CREATE TABLE IF NOT EXISTS commitment_instances (
  id TEXT PRIMARY KEY,
  commitment_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  expected_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount_base_minor INTEGER,
  fx_rate REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  expense_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(commitment_id) REFERENCES recurring_commitments(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS commitment_instances_due_uq ON commitment_instances(commitment_id, due_at);
CREATE INDEX IF NOT EXISTS commitment_instances_status_idx ON commitment_instances(status);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  posted_at TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount_base_minor INTEGER,
  fx_rate REAL,
  category_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  merchant_name TEXT,
  note TEXT,
  external_ref TEXT,
  commitment_instance_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY(commitment_instance_id) REFERENCES commitment_instances(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses(category_id);
CREATE INDEX IF NOT EXISTS expenses_occurred_idx ON expenses(occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_external_ref_uq ON expenses(source, external_ref);

CREATE TABLE IF NOT EXISTS monzo_connections (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_sync_at TEXT,
  last_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monzo_transactions_raw (
  transaction_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS monzo_tx_created_idx ON monzo_transactions_raw(created_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log(action);

CREATE TABLE IF NOT EXISTS operation_approvals (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS operation_action_idx ON operation_approvals(action);
