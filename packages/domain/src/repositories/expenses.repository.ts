import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { expenses } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface ExpenseDto {
  id: string;
  occurredAt: string;
  postedAt: string | null;
  money: {
    amountMinor: number;
    currency: string;
    amountBaseMinor?: number;
    fxRate?: number;
  };
  categoryId: string;
  source: 'local' | 'monzo' | 'commitment';
  transferDirection: 'in' | 'out' | null;
  kind: 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
  reimbursementStatus: 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
  myShareMinor: number | null;
  closedOutstandingMinor: number | null;
  counterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  reimbursementGroupId: string | null;
  reimbursementClosedAt: string | null;
  reimbursementClosedReason: string | null;
  recoverableMinor?: number;
  recoveredMinor?: number;
  outstandingMinor?: number;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  providerTransactionId: string | null;
  commitmentInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapExpense = (row: typeof expenses.$inferSelect): ExpenseDto => ({
  id: row.id,
  occurredAt: row.occurredAt,
  postedAt: row.postedAt,
  money: {
    amountMinor: row.amountMinor,
    currency: row.currency,
    ...(row.amountBaseMinor !== null && row.amountBaseMinor !== undefined
      ? { amountBaseMinor: row.amountBaseMinor }
      : {}),
    ...(row.fxRate !== null && row.fxRate !== undefined ? { fxRate: row.fxRate } : {}),
  },
  categoryId: row.categoryId,
  source: row.source as 'local' | 'monzo' | 'commitment',
  transferDirection:
    row.transferDirection === 'in' || row.transferDirection === 'out'
      ? row.transferDirection
      : null,
  kind:
    row.kind === 'income' || row.kind === 'transfer_internal' || row.kind === 'transfer_external'
      ? row.kind
      : 'expense',
  reimbursementStatus:
    row.reimbursementStatus === 'expected' ||
    row.reimbursementStatus === 'partial' ||
    row.reimbursementStatus === 'settled' ||
    row.reimbursementStatus === 'written_off'
      ? row.reimbursementStatus
      : 'none',
  myShareMinor: row.myShareMinor ?? null,
  closedOutstandingMinor: row.closedOutstandingMinor ?? null,
  counterpartyType:
    row.counterpartyType === 'self' ||
    row.counterpartyType === 'partner' ||
    row.counterpartyType === 'team' ||
    row.counterpartyType === 'other'
      ? row.counterpartyType
      : null,
  reimbursementGroupId: row.reimbursementGroupId ?? null,
  reimbursementClosedAt: row.reimbursementClosedAt ?? null,
  reimbursementClosedReason: row.reimbursementClosedReason ?? null,
  merchantName: row.merchantName,
  merchantLogoUrl: row.merchantLogoUrl,
  merchantEmoji: row.merchantEmoji,
  note: row.note,
  providerTransactionId: row.providerTransactionId,
  commitmentInstanceId: row.commitmentInstanceId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface ListExpensesInput {
  from?: string;
  to?: string;
  categoryId?: string;
  limit: number;
}

export interface ListExpensesOutput {
  expenses: ExpenseDto[];
}

export interface FindExpenseByIdInput {
  id: string;
}

export interface FindExpenseByIdOutput {
  expense: ExpenseDto | null;
}

export interface FindExpensesByIdsInput {
  ids: string[];
}

export interface FindExpensesByIdsOutput {
  expenses: ExpenseDto[];
}

export interface FindExpenseBySourceProviderTransactionIdInput {
  source: 'local' | 'monzo' | 'commitment';
  providerTransactionId: string;
}

export interface FindExpenseBySourceProviderTransactionIdOutput {
  expense: ExpenseDto | null;
}

export interface CreateExpenseInput {
  id: string;
  occurredAt: string;
  postedAt: string | null;
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  categoryId: string;
  source: 'local' | 'monzo' | 'commitment';
  transferDirection: 'in' | 'out' | null;
  kind: 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
  reimbursementStatus: 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
  myShareMinor: number | null;
  closedOutstandingMinor: number | null;
  counterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  reimbursementGroupId: string | null;
  reimbursementClosedAt: string | null;
  reimbursementClosedReason: string | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  providerTransactionId: string | null;
  commitmentInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseOutput {
  expense: ExpenseDto;
}

export interface UpdateExpenseInput {
  id: string;
  occurredAt: string;
  postedAt: string | null;
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  categoryId: string;
  transferDirection: 'in' | 'out' | null;
  kind: 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
  reimbursementStatus: 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
  myShareMinor: number | null;
  closedOutstandingMinor: number | null;
  counterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  reimbursementGroupId: string | null;
  reimbursementClosedAt: string | null;
  reimbursementClosedReason: string | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  updatedAt: string;
}

export interface UpdateExpenseOutput {
  expense: ExpenseDto | null;
}

export interface DeleteExpenseInput {
  id: string;
}

export interface DeleteExpenseOutput {
  deleted: boolean;
}

export interface UpdateExpenseReimbursementInput {
  id: string;
  reimbursementStatus: 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
  myShareMinor: number | null;
  closedOutstandingMinor: number | null;
  counterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  reimbursementGroupId: string | null;
  reimbursementClosedAt: string | null;
  reimbursementClosedReason: string | null;
  updatedAt: string;
}

export interface UpdateExpenseReimbursementOutput {
  expense: ExpenseDto | null;
}

export interface ExpensesRepository {
  list(input: ListExpensesInput): ListExpensesOutput;
  findById(input: FindExpenseByIdInput): FindExpenseByIdOutput;
  findByIds(input: FindExpensesByIdsInput): FindExpensesByIdsOutput;
  findBySourceProviderTransactionId: (
    input: FindExpenseBySourceProviderTransactionIdInput,
  ) => FindExpenseBySourceProviderTransactionIdOutput;
  create(input: CreateExpenseInput): CreateExpenseOutput;
  update(input: UpdateExpenseInput): UpdateExpenseOutput;
  updateReimbursement(input: UpdateExpenseReimbursementInput): UpdateExpenseReimbursementOutput;
  deleteById(input: DeleteExpenseInput): DeleteExpenseOutput;
}

export class SqliteExpensesRepository implements ExpensesRepository {
  constructor(private readonly db: RepositoryDb) {}

  list({ from, to, categoryId, limit }: ListExpensesInput): ListExpensesOutput {
    const filters = [];
    if (from) {
      filters.push(gte(expenses.occurredAt, from));
    }
    if (to) {
      filters.push(lte(expenses.occurredAt, to));
    }
    if (categoryId) {
      filters.push(eq(expenses.categoryId, categoryId));
    }

    const whereExpr = filters.length > 0 ? and(...filters) : undefined;

    const query = this.db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(limit);

    const rows = whereExpr ? query.where(whereExpr).all() : query.all();

    return { expenses: rows.map(mapExpense) };
  }

  findById({ id }: FindExpenseByIdInput): FindExpenseByIdOutput {
    const row = this.db.select().from(expenses).where(eq(expenses.id, id)).get();
    return { expense: row ? mapExpense(row) : null };
  }

  findByIds({ ids }: FindExpensesByIdsInput): FindExpensesByIdsOutput {
    if (ids.length === 0) {
      return { expenses: [] };
    }

    const rows = this.db.select().from(expenses).where(inArray(expenses.id, ids)).all();
    return { expenses: rows.map(mapExpense) };
  }

  findBySourceProviderTransactionId({
    source,
    providerTransactionId,
  }: FindExpenseBySourceProviderTransactionIdInput): FindExpenseBySourceProviderTransactionIdOutput {
    const row = this.db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.source, source), eq(expenses.providerTransactionId, providerTransactionId)),
      )
      .get();

    return { expense: row ? mapExpense(row) : null };
  }

  create(input: CreateExpenseInput): CreateExpenseOutput {
    this.db.insert(expenses).values(input).run();

    const created = this.db.select().from(expenses).where(eq(expenses.id, input.id)).get();
    if (!created) {
      throw new Error(`Failed to fetch created expense ${input.id}`);
    }
    return {
      expense: mapExpense(created),
    };
  }

  update({ id, ...patch }: UpdateExpenseInput): UpdateExpenseOutput {
    this.db.update(expenses).set(patch).where(eq(expenses.id, id)).run();

    const updated = this.db.select().from(expenses).where(eq(expenses.id, id)).get();
    return {
      expense: updated ? mapExpense(updated) : null,
    };
  }

  updateReimbursement({
    id,
    ...patch
  }: UpdateExpenseReimbursementInput): UpdateExpenseReimbursementOutput {
    this.db.update(expenses).set(patch).where(eq(expenses.id, id)).run();

    const updated = this.db.select().from(expenses).where(eq(expenses.id, id)).get();
    return {
      expense: updated ? mapExpense(updated) : null,
    };
  }

  deleteById({ id }: DeleteExpenseInput): DeleteExpenseOutput {
    this.db.delete(expenses).where(eq(expenses.id, id)).run();
    return { deleted: true };
  }
}
