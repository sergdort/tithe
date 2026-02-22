ALTER TABLE monzo_connections ADD COLUMN access_token TEXT;
ALTER TABLE monzo_connections ADD COLUMN refresh_token TEXT;
ALTER TABLE monzo_connections ADD COLUMN token_expires_at TEXT;
ALTER TABLE monzo_connections ADD COLUMN scope TEXT;
ALTER TABLE monzo_connections ADD COLUMN oauth_state TEXT;
ALTER TABLE monzo_connections ADD COLUMN oauth_state_expires_at TEXT;
ALTER TABLE monzo_connections ADD COLUMN last_error_text TEXT;

CREATE TABLE IF NOT EXISTS monzo_category_mappings (
  monzo_category TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

