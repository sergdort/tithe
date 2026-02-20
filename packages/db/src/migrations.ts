import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSqlite } from './client.js';

const migrationTableSQL = `
CREATE TABLE IF NOT EXISTS __migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const migrationDirFromMeta = (): string => {
  const filePath = fileURLToPath(import.meta.url);
  const moduleDir = path.dirname(filePath);

  const candidates = [
    path.resolve(moduleDir, 'migrations'),
    path.resolve(moduleDir, '../src/migrations'),
    path.resolve(process.cwd(), 'packages/db/src/migrations'),
    path.resolve(process.cwd(), 'packages/db/dist/migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate migrations directory. Checked: ${candidates.map((item) => `'${item}'`).join(', ')}`,
  );
};

const applyMigration = (
  sqlite: ReturnType<typeof createSqlite>,
  migrationsDir: string,
  file: string,
): void => {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  const existing = sqlite.prepare('SELECT id, checksum FROM __migrations WHERE id = ?').get(file) as
    | { id: string; checksum: string }
    | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error(`Migration checksum mismatch for ${file}`);
    }
    return;
  }

  const tx = sqlite.transaction(() => {
    sqlite.exec(sql);
    sqlite.prepare('INSERT INTO __migrations (id, checksum) VALUES (?, ?)').run(file, checksum);
  });

  tx();
};

export const runMigrations = (dbPath?: string): string[] => {
  const sqlite = createSqlite({ dbPath });
  const applied: string[] = [];
  const migrationsDir = migrationDirFromMeta();

  try {
    sqlite.exec(migrationTableSQL);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const before = sqlite.prepare('SELECT id FROM __migrations WHERE id = ?').get(file) as
        | { id: string }
        | undefined;
      applyMigration(sqlite, migrationsDir, file);
      if (!before) {
        applied.push(file);
      }
    }
  } finally {
    sqlite.close();
  }

  return applied;
};
