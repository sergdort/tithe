import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export interface DbClientOptions {
  dbPath?: string;
}

export interface DbConnection {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  schema: typeof schema;
}

const expandHomeDir = (value: string): string => {
  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
};

export const resolveDbPath = (dbPath?: string): string => {
  const configured = dbPath ?? process.env.DB_PATH ?? '~/.tithe/tithe.db';
  const expanded = expandHomeDir(configured);
  return path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
};

export const createSqlite = (options: DbClientOptions = {}): Database.Database => {
  const resolved = resolveDbPath(options.dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const sqlite = new Database(resolved);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};

export const createDb = (options: DbClientOptions = {}): DbConnection => {
  const sqlite = createSqlite(options);
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    schema,
  };
};

export type DrizzleDb = DbConnection['db'];
