import { and, desc, eq, gte, lte } from 'drizzle-orm';

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
  source: 'manual' | 'monzo_import' | 'commitment';
  transferDirection: 'in' | 'out' | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  externalRef: string | null;
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
  source: row.source as 'manual' | 'monzo_import' | 'commitment',
  transferDirection:
    row.transferDirection === 'in' || row.transferDirection === 'out' ? row.transferDirection : null,
  merchantName: row.merchantName,
  merchantLogoUrl: row.merchantLogoUrl,
  merchantEmoji: row.merchantEmoji,
  note: row.note,
  externalRef: row.externalRef,
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

export interface CreateExpenseInput {
  id: string;
  occurredAt: string;
  postedAt: string | null;
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  categoryId: string;
  source: 'manual' | 'monzo_import' | 'commitment';
  transferDirection: 'in' | 'out' | null;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  externalRef: string | null;
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

export interface ExpensesRepository {
  list(input: ListExpensesInput): ListExpensesOutput;
  findById(input: FindExpenseByIdInput): FindExpenseByIdOutput;
  create(input: CreateExpenseInput): CreateExpenseOutput;
  update(input: UpdateExpenseInput): UpdateExpenseOutput;
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

  deleteById({ id }: DeleteExpenseInput): DeleteExpenseOutput {
    this.db.delete(expenses).where(eq(expenses.id, id)).run();
    return { deleted: true };
  }
}
