import { type DbClientOptions, type DrizzleDb, createDb } from '@tithe/db';

export interface DomainServiceOptions extends DbClientOptions {}

export interface DomainDbRuntime {
  db: DrizzleDb;
  sqlite: ReturnType<typeof createDb>['sqlite'];
  close: () => void;
}

export const createDomainDbRuntime = (options: DomainServiceOptions = {}): DomainDbRuntime => {
  const { db, sqlite } = createDb(options);
  let closed = false;

  return {
    db,
    sqlite,
    close() {
      if (closed) {
        return;
      }

      closed = true;
      sqlite.close();
    },
  };
};
