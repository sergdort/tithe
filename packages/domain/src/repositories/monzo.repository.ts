import { desc, eq, sql } from 'drizzle-orm';

import { monzoCategoryMappings, monzoConnections, monzoTransactionsRaw, syncRuns } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface MonzoConnectionDto {
  id: string;
  accountId: string;
  status: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scope: string | null;
  oauthState: string | null;
  oauthStateExpiresAt: string | null;
  lastErrorText: string | null;
  lastSyncAt: string | null;
  lastCursor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonzoCategoryMappingDto {
  monzoCategory: string;
  flow: 'in' | 'out';
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

const mapConnection = (row: typeof monzoConnections.$inferSelect): MonzoConnectionDto => ({
  id: row.id,
  accountId: row.accountId,
  status: row.status,
  accessToken: row.accessToken,
  refreshToken: row.refreshToken,
  tokenExpiresAt: row.tokenExpiresAt,
  scope: row.scope,
  oauthState: row.oauthState,
  oauthStateExpiresAt: row.oauthStateExpiresAt,
  lastErrorText: row.lastErrorText,
  lastSyncAt: row.lastSyncAt,
  lastCursor: row.lastCursor,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapCategoryMapping = (
  row: typeof monzoCategoryMappings.$inferSelect,
): MonzoCategoryMappingDto => ({
  monzoCategory: row.monzoCategory,
  flow: row.flow === 'in' ? 'in' : 'out',
  categoryId: row.categoryId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface FindMonzoConnectionOutput {
  connection: MonzoConnectionDto | null;
}

export interface UpsertMonzoConnectionInput {
  id: string;
  accountId: string;
  status: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scope: string | null;
  oauthState: string | null;
  oauthStateExpiresAt: string | null;
  lastErrorText: string | null;
  lastSyncAt: string | null;
  lastCursor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMonzoConnectionOutput {
  connection: MonzoConnectionDto;
}

export interface FindMonzoCategoryMappingInput {
  monzoCategory: string;
  flow: 'in' | 'out';
}

export interface FindMonzoCategoryMappingOutput {
  mapping: MonzoCategoryMappingDto | null;
}

export interface UpsertMonzoCategoryMappingInput {
  monzoCategory: string;
  flow: 'in' | 'out';
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMonzoCategoryMappingOutput {
  mapping: MonzoCategoryMappingDto;
}

export interface CountMonzoCategoryMappingsOutput {
  count: number;
}

export interface UpsertMonzoRawTransactionInput {
  transactionId: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMonzoRawTransactionOutput {
  saved: true;
}

export interface CreateSyncRunInput {
  id: string;
  provider: string;
  startedAt: string;
  status: string;
  importedCount: number;
  errorText: string | null;
}

export interface CreateSyncRunOutput {
  created: true;
}

export interface FinishSyncRunInput {
  id: string;
  endedAt: string;
  status: string;
  importedCount: number;
  errorText: string | null;
}

export interface FinishSyncRunOutput {
  updated: boolean;
}

export interface MonzoRepository {
  findLatestConnection: () => FindMonzoConnectionOutput;
  upsertConnection: (input: UpsertMonzoConnectionInput) => UpsertMonzoConnectionOutput;
  findCategoryMapping: (input: FindMonzoCategoryMappingInput) => FindMonzoCategoryMappingOutput;
  upsertCategoryMapping: (
    input: UpsertMonzoCategoryMappingInput,
  ) => UpsertMonzoCategoryMappingOutput;
  countCategoryMappings: () => CountMonzoCategoryMappingsOutput;
  upsertRawTransaction: (input: UpsertMonzoRawTransactionInput) => UpsertMonzoRawTransactionOutput;
  createSyncRun: (input: CreateSyncRunInput) => CreateSyncRunOutput;
  finishSyncRun: (input: FinishSyncRunInput) => FinishSyncRunOutput;
}

export class SqliteMonzoRepository implements MonzoRepository {
  constructor(private readonly db: RepositoryDb) {}

  findLatestConnection(): FindMonzoConnectionOutput {
    const row = this.db
      .select()
      .from(monzoConnections)
      .orderBy(desc(monzoConnections.createdAt))
      .limit(1)
      .all()[0];

    return {
      connection: row ? mapConnection(row) : null,
    };
  }

  upsertConnection(input: UpsertMonzoConnectionInput): UpsertMonzoConnectionOutput {
    this.db
      .insert(monzoConnections)
      .values(input)
      .onConflictDoUpdate({
        target: monzoConnections.id,
        set: {
          accountId: input.accountId,
          status: input.status,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          tokenExpiresAt: input.tokenExpiresAt,
          scope: input.scope,
          oauthState: input.oauthState,
          oauthStateExpiresAt: input.oauthStateExpiresAt,
          lastErrorText: input.lastErrorText,
          lastSyncAt: input.lastSyncAt,
          lastCursor: input.lastCursor,
          updatedAt: input.updatedAt,
        },
      })
      .run();

    const row = this.db
      .select()
      .from(monzoConnections)
      .where(eq(monzoConnections.id, input.id))
      .get();
    if (!row) {
      throw new Error(`Failed to fetch saved monzo connection ${input.id}`);
    }

    return {
      connection: mapConnection(row),
    };
  }

  findCategoryMapping({
    monzoCategory,
    flow,
  }: FindMonzoCategoryMappingInput): FindMonzoCategoryMappingOutput {
    const row = this.db
      .select()
      .from(monzoCategoryMappings)
      .where(
        sql`${monzoCategoryMappings.monzoCategory} = ${monzoCategory} AND ${monzoCategoryMappings.flow} = ${flow}`,
      )
      .get();

    return {
      mapping: row ? mapCategoryMapping(row) : null,
    };
  }

  upsertCategoryMapping({
    monzoCategory,
    flow,
    categoryId,
    createdAt,
    updatedAt,
  }: UpsertMonzoCategoryMappingInput): UpsertMonzoCategoryMappingOutput {
    this.db
      .insert(monzoCategoryMappings)
      .values({
        monzoCategory,
        flow,
        categoryId,
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [monzoCategoryMappings.monzoCategory, monzoCategoryMappings.flow],
        set: {
          categoryId,
          updatedAt,
        },
      })
      .run();

    const row = this.db
      .select()
      .from(monzoCategoryMappings)
      .where(
        sql`${monzoCategoryMappings.monzoCategory} = ${monzoCategory} AND ${monzoCategoryMappings.flow} = ${flow}`,
      )
      .get();

    if (!row) {
      throw new Error(`Failed to fetch saved monzo category mapping ${monzoCategory}:${flow}`);
    }

    return {
      mapping: mapCategoryMapping(row),
    };
  }

  countCategoryMappings(): CountMonzoCategoryMappingsOutput {
    const row = this.db.select({ count: sql<number>`COUNT(*)` }).from(monzoCategoryMappings).get();

    return {
      count: row?.count ?? 0,
    };
  }

  upsertRawTransaction({
    transactionId,
    payloadJson,
    createdAt,
    updatedAt,
  }: UpsertMonzoRawTransactionInput): UpsertMonzoRawTransactionOutput {
    this.db
      .insert(monzoTransactionsRaw)
      .values({
        transactionId,
        payloadJson,
        createdAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: monzoTransactionsRaw.transactionId,
        set: {
          payloadJson,
          updatedAt,
        },
      })
      .run();

    return { saved: true };
  }

  createSyncRun({
    id,
    provider,
    startedAt,
    status,
    importedCount,
    errorText,
  }: CreateSyncRunInput): CreateSyncRunOutput {
    this.db
      .insert(syncRuns)
      .values({
        id,
        provider,
        startedAt,
        status,
        importedCount,
        errorText,
        endedAt: null,
      })
      .run();

    return { created: true };
  }

  finishSyncRun({
    id,
    endedAt,
    status,
    importedCount,
    errorText,
  }: FinishSyncRunInput): FinishSyncRunOutput {
    const result = this.db
      .update(syncRuns)
      .set({
        endedAt,
        status,
        importedCount,
        errorText,
      })
      .where(eq(syncRuns.id, id))
      .run();

    return {
      updated: result.changes > 0,
    };
  }
}
