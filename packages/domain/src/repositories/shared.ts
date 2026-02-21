import { type DbClientOptions, type DrizzleDb, createDb } from '@tithe/db';

type DbTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

export type RepositoryDb = DrizzleDb | DbTransaction;

export interface SessionContext {
  db: DrizzleDb;
  sqlite: ReturnType<typeof createDb>['sqlite'];
}

export const withSession = async <T>(
  options: DbClientOptions | undefined,
  run: (ctx: SessionContext) => Promise<T> | T,
): Promise<T> => {
  const { db, sqlite } = createDb(options);

  try {
    return await run({ db, sqlite });
  } finally {
    sqlite.close();
  }
};

export const withTransaction = <T>(db: RepositoryDb, run: (tx: DbTransaction) => T): T =>
  db.transaction((tx) => run(tx));
