import { eq, inArray, sql } from 'drizzle-orm';

import { fundingLinks } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface FundingLinkDto {
  id: string;
  incomeExpenseId: string;
  transferExpenseId: string;
  amountMinor: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapLink = (row: typeof fundingLinks.$inferSelect): FundingLinkDto => ({
  id: row.id,
  incomeExpenseId: row.incomeExpenseId,
  transferExpenseId: row.transferExpenseId,
  amountMinor: row.amountMinor,
  idempotencyKey: row.idempotencyKey ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface FindFundingLinkByIdInput {
  id: string;
}

export interface FindFundingLinkByIdOutput {
  link: FundingLinkDto | null;
}

export interface FindFundingLinkByIdempotencyKeyInput {
  idempotencyKey: string;
}

export interface FindFundingLinkByIdempotencyKeyOutput {
  link: FundingLinkDto | null;
}

export interface CreateFundingLinkInput {
  id: string;
  incomeExpenseId: string;
  transferExpenseId: string;
  amountMinor: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundingLinkOutput {
  link: FundingLinkDto;
}

export interface DeleteFundingLinkInput {
  id: string;
}

export interface DeleteFundingLinkOutput {
  deleted: boolean;
}

export interface ListFundingLinksByIncomeExpenseIdsInput {
  incomeExpenseIds: string[];
}

export interface ListFundingLinksByIncomeExpenseIdsOutput {
  links: FundingLinkDto[];
}

export interface ListFundingLinksByTransferExpenseIdsInput {
  transferExpenseIds: string[];
}

export interface ListFundingLinksByTransferExpenseIdsOutput {
  links: FundingLinkDto[];
}

export interface SumAllocatedByIncomeExpenseIdsInput {
  incomeExpenseIds: string[];
}

export interface SumAllocatedByIncomeExpenseIdsOutput {
  rows: Array<{ incomeExpenseId: string; totalMinor: number }>;
}

export interface SumFundedByTransferExpenseIdsInput {
  transferExpenseIds: string[];
}

export interface SumFundedByTransferExpenseIdsOutput {
  rows: Array<{ transferExpenseId: string; totalMinor: number }>;
}

export interface FundingLinksRepository {
  findById: (input: FindFundingLinkByIdInput) => FindFundingLinkByIdOutput;
  findByIdempotencyKey: (
    input: FindFundingLinkByIdempotencyKeyInput,
  ) => FindFundingLinkByIdempotencyKeyOutput;
  create: (input: CreateFundingLinkInput) => CreateFundingLinkOutput;
  deleteById: (input: DeleteFundingLinkInput) => DeleteFundingLinkOutput;
  listByIncomeExpenseIds: (
    input: ListFundingLinksByIncomeExpenseIdsInput,
  ) => ListFundingLinksByIncomeExpenseIdsOutput;
  listByTransferExpenseIds: (
    input: ListFundingLinksByTransferExpenseIdsInput,
  ) => ListFundingLinksByTransferExpenseIdsOutput;
  sumAllocatedByIncomeExpenseIds: (
    input: SumAllocatedByIncomeExpenseIdsInput,
  ) => SumAllocatedByIncomeExpenseIdsOutput;
  sumFundedByTransferExpenseIds: (
    input: SumFundedByTransferExpenseIdsInput,
  ) => SumFundedByTransferExpenseIdsOutput;
}

export class SqliteFundingLinksRepository implements FundingLinksRepository {
  constructor(private readonly db: RepositoryDb) {}

  findById({ id }: FindFundingLinkByIdInput): FindFundingLinkByIdOutput {
    const row = this.db.select().from(fundingLinks).where(eq(fundingLinks.id, id)).get();
    return { link: row ? mapLink(row) : null };
  }

  findByIdempotencyKey({
    idempotencyKey,
  }: FindFundingLinkByIdempotencyKeyInput): FindFundingLinkByIdempotencyKeyOutput {
    const row = this.db
      .select()
      .from(fundingLinks)
      .where(eq(fundingLinks.idempotencyKey, idempotencyKey))
      .get();
    return { link: row ? mapLink(row) : null };
  }

  create(input: CreateFundingLinkInput): CreateFundingLinkOutput {
    this.db.insert(fundingLinks).values(input).run();
    const created = this.db.select().from(fundingLinks).where(eq(fundingLinks.id, input.id)).get();
    if (!created) {
      throw new Error(`Failed to fetch created funding link ${input.id}`);
    }
    return { link: mapLink(created) };
  }

  deleteById({ id }: DeleteFundingLinkInput): DeleteFundingLinkOutput {
    this.db.delete(fundingLinks).where(eq(fundingLinks.id, id)).run();
    return { deleted: true };
  }

  listByIncomeExpenseIds({
    incomeExpenseIds,
  }: ListFundingLinksByIncomeExpenseIdsInput): ListFundingLinksByIncomeExpenseIdsOutput {
    if (incomeExpenseIds.length === 0) {
      return { links: [] };
    }

    const rows = this.db
      .select()
      .from(fundingLinks)
      .where(inArray(fundingLinks.incomeExpenseId, incomeExpenseIds))
      .all();
    return { links: rows.map(mapLink) };
  }

  listByTransferExpenseIds({
    transferExpenseIds,
  }: ListFundingLinksByTransferExpenseIdsInput): ListFundingLinksByTransferExpenseIdsOutput {
    if (transferExpenseIds.length === 0) {
      return { links: [] };
    }

    const rows = this.db
      .select()
      .from(fundingLinks)
      .where(inArray(fundingLinks.transferExpenseId, transferExpenseIds))
      .all();
    return { links: rows.map(mapLink) };
  }

  sumAllocatedByIncomeExpenseIds({
    incomeExpenseIds,
  }: SumAllocatedByIncomeExpenseIdsInput): SumAllocatedByIncomeExpenseIdsOutput {
    if (incomeExpenseIds.length === 0) {
      return { rows: [] };
    }

    const rows = this.db
      .select({
        incomeExpenseId: fundingLinks.incomeExpenseId,
        totalMinor: sql<number>`SUM(${fundingLinks.amountMinor})`,
      })
      .from(fundingLinks)
      .where(inArray(fundingLinks.incomeExpenseId, incomeExpenseIds))
      .groupBy(fundingLinks.incomeExpenseId)
      .all();

    return {
      rows: rows.map((row) => ({
        incomeExpenseId: row.incomeExpenseId,
        totalMinor: Number(row.totalMinor ?? 0),
      })),
    };
  }

  sumFundedByTransferExpenseIds({
    transferExpenseIds,
  }: SumFundedByTransferExpenseIdsInput): SumFundedByTransferExpenseIdsOutput {
    if (transferExpenseIds.length === 0) {
      return { rows: [] };
    }

    const rows = this.db
      .select({
        transferExpenseId: fundingLinks.transferExpenseId,
        totalMinor: sql<number>`SUM(${fundingLinks.amountMinor})`,
      })
      .from(fundingLinks)
      .where(inArray(fundingLinks.transferExpenseId, transferExpenseIds))
      .groupBy(fundingLinks.transferExpenseId)
      .all();

    return {
      rows: rows.map((row) => ({
        transferExpenseId: row.transferExpenseId,
        totalMinor: Number(row.totalMinor ?? 0),
      })),
    };
  }
}
