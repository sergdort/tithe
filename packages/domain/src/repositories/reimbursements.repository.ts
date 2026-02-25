import { eq, inArray, sql } from 'drizzle-orm';

import { reimbursementLinks } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface ReimbursementLinkDto {
  id: string;
  expenseOutId: string;
  expenseInId: string;
  amountMinor: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapLink = (row: typeof reimbursementLinks.$inferSelect): ReimbursementLinkDto => ({
  id: row.id,
  expenseOutId: row.expenseOutId,
  expenseInId: row.expenseInId,
  amountMinor: row.amountMinor,
  idempotencyKey: row.idempotencyKey ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface FindReimbursementLinkByIdInput {
  id: string;
}

export interface FindReimbursementLinkByIdOutput {
  link: ReimbursementLinkDto | null;
}

export interface FindReimbursementLinkByIdempotencyKeyInput {
  idempotencyKey: string;
}

export interface FindReimbursementLinkByIdempotencyKeyOutput {
  link: ReimbursementLinkDto | null;
}

export interface CreateReimbursementLinkInput {
  id: string;
  expenseOutId: string;
  expenseInId: string;
  amountMinor: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReimbursementLinkOutput {
  link: ReimbursementLinkDto;
}

export interface DeleteReimbursementLinkInput {
  id: string;
}

export interface DeleteReimbursementLinkOutput {
  deleted: boolean;
}

export interface ListReimbursementLinksByExpenseOutIdsInput {
  expenseOutIds: string[];
}

export interface ListReimbursementLinksByExpenseOutIdsOutput {
  links: ReimbursementLinkDto[];
}

export interface ListReimbursementLinksByExpenseInIdsInput {
  expenseInIds: string[];
}

export interface ListReimbursementLinksByExpenseInIdsOutput {
  links: ReimbursementLinkDto[];
}

export interface SumRecoveredByExpenseOutIdsInput {
  expenseOutIds: string[];
}

export interface SumRecoveredByExpenseOutIdsOutput {
  rows: Array<{ expenseOutId: string; totalMinor: number }>;
}

export interface SumAllocatedByExpenseInIdsInput {
  expenseInIds: string[];
}

export interface SumAllocatedByExpenseInIdsOutput {
  rows: Array<{ expenseInId: string; totalMinor: number }>;
}

export interface ReimbursementsRepository {
  findById: (input: FindReimbursementLinkByIdInput) => FindReimbursementLinkByIdOutput;
  findByIdempotencyKey: (
    input: FindReimbursementLinkByIdempotencyKeyInput,
  ) => FindReimbursementLinkByIdempotencyKeyOutput;
  create: (input: CreateReimbursementLinkInput) => CreateReimbursementLinkOutput;
  deleteById: (input: DeleteReimbursementLinkInput) => DeleteReimbursementLinkOutput;
  listByExpenseOutIds: (
    input: ListReimbursementLinksByExpenseOutIdsInput,
  ) => ListReimbursementLinksByExpenseOutIdsOutput;
  listByExpenseInIds: (
    input: ListReimbursementLinksByExpenseInIdsInput,
  ) => ListReimbursementLinksByExpenseInIdsOutput;
  sumRecoveredByExpenseOutIds: (
    input: SumRecoveredByExpenseOutIdsInput,
  ) => SumRecoveredByExpenseOutIdsOutput;
  sumAllocatedByExpenseInIds: (
    input: SumAllocatedByExpenseInIdsInput,
  ) => SumAllocatedByExpenseInIdsOutput;
}

export class SqliteReimbursementsRepository implements ReimbursementsRepository {
  constructor(private readonly db: RepositoryDb) {}

  findById({ id }: FindReimbursementLinkByIdInput): FindReimbursementLinkByIdOutput {
    const row = this.db
      .select()
      .from(reimbursementLinks)
      .where(eq(reimbursementLinks.id, id))
      .get();
    return { link: row ? mapLink(row) : null };
  }

  findByIdempotencyKey({
    idempotencyKey,
  }: FindReimbursementLinkByIdempotencyKeyInput): FindReimbursementLinkByIdempotencyKeyOutput {
    const row = this.db
      .select()
      .from(reimbursementLinks)
      .where(eq(reimbursementLinks.idempotencyKey, idempotencyKey))
      .get();
    return { link: row ? mapLink(row) : null };
  }

  create(input: CreateReimbursementLinkInput): CreateReimbursementLinkOutput {
    this.db.insert(reimbursementLinks).values(input).run();
    const created = this.db
      .select()
      .from(reimbursementLinks)
      .where(eq(reimbursementLinks.id, input.id))
      .get();
    if (!created) {
      throw new Error(`Failed to fetch created reimbursement link ${input.id}`);
    }
    return { link: mapLink(created) };
  }

  deleteById({ id }: DeleteReimbursementLinkInput): DeleteReimbursementLinkOutput {
    this.db.delete(reimbursementLinks).where(eq(reimbursementLinks.id, id)).run();
    return { deleted: true };
  }

  listByExpenseOutIds({
    expenseOutIds,
  }: ListReimbursementLinksByExpenseOutIdsInput): ListReimbursementLinksByExpenseOutIdsOutput {
    if (expenseOutIds.length === 0) {
      return { links: [] };
    }

    const rows = this.db
      .select()
      .from(reimbursementLinks)
      .where(inArray(reimbursementLinks.expenseOutId, expenseOutIds))
      .all();
    return { links: rows.map(mapLink) };
  }

  listByExpenseInIds({
    expenseInIds,
  }: ListReimbursementLinksByExpenseInIdsInput): ListReimbursementLinksByExpenseInIdsOutput {
    if (expenseInIds.length === 0) {
      return { links: [] };
    }

    const rows = this.db
      .select()
      .from(reimbursementLinks)
      .where(inArray(reimbursementLinks.expenseInId, expenseInIds))
      .all();
    return { links: rows.map(mapLink) };
  }

  sumRecoveredByExpenseOutIds({
    expenseOutIds,
  }: SumRecoveredByExpenseOutIdsInput): SumRecoveredByExpenseOutIdsOutput {
    if (expenseOutIds.length === 0) {
      return { rows: [] };
    }

    const rows = this.db
      .select({
        expenseOutId: reimbursementLinks.expenseOutId,
        totalMinor: sql<number>`SUM(${reimbursementLinks.amountMinor})`,
      })
      .from(reimbursementLinks)
      .where(inArray(reimbursementLinks.expenseOutId, expenseOutIds))
      .groupBy(reimbursementLinks.expenseOutId)
      .all();

    return {
      rows: rows.map((row) => ({
        expenseOutId: row.expenseOutId,
        totalMinor: Number(row.totalMinor ?? 0),
      })),
    };
  }

  sumAllocatedByExpenseInIds({
    expenseInIds,
  }: SumAllocatedByExpenseInIdsInput): SumAllocatedByExpenseInIdsOutput {
    if (expenseInIds.length === 0) {
      return { rows: [] };
    }

    const rows = this.db
      .select({
        expenseInId: reimbursementLinks.expenseInId,
        totalMinor: sql<number>`SUM(${reimbursementLinks.amountMinor})`,
      })
      .from(reimbursementLinks)
      .where(inArray(reimbursementLinks.expenseInId, expenseInIds))
      .groupBy(reimbursementLinks.expenseInId)
      .all();

    return {
      rows: rows.map((row) => ({
        expenseInId: row.expenseInId,
        totalMinor: Number(row.totalMinor ?? 0),
      })),
    };
  }
}
