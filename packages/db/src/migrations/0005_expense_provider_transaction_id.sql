-- v2 import identity for provider-backed expenses

DROP INDEX IF EXISTS expenses_source_external_ref_uq;

ALTER TABLE expenses ADD COLUMN provider_transaction_id TEXT;

UPDATE expenses
SET provider_transaction_id = external_ref
WHERE external_ref IS NOT NULL;

UPDATE expenses
SET source = 'local'
WHERE source = 'manual';

UPDATE expenses
SET source = 'monzo'
WHERE source = 'monzo_import';

CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_provider_transaction_id_uq
  ON expenses(source, provider_transaction_id);

ALTER TABLE expenses DROP COLUMN external_ref;
