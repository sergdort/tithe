import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';

import { categories, commitmentInstances, expenses, recurringCommitments } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface MonthlyTrendDto {
  month: string;
  spendMinor: number;
  spendBaseMinor: number;
  txCount: number;
}

export interface CategoryBreakdownDto {
  categoryId: string;
  categoryName: string;
  totalMinor: number;
  txCount: number;
}

export interface CommitmentForecastDto {
  id: string;
  commitmentId: string;
  commitmentName: string;
  dueAt: string;
  expectedAmountMinor: number;
  currency: string;
  status: string;
}

export interface MonthlyLedgerCategoryRowDto {
  categoryId: string;
  categoryName: string;
  totalMinor: number;
  txCount: number;
}

export interface MonthlyLedgerTransferRowDto extends MonthlyLedgerCategoryRowDto {
  direction: 'in' | 'out';
}

export interface MonthlyLedgerDto {
  month: string;
  range: {
    from: string;
    to: string;
  };
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    transferInMinor: number;
    transferOutMinor: number;
    operatingSurplusMinor: number;
    netCashMovementMinor: number;
    txCount: number;
  };
  sections: {
    income: MonthlyLedgerCategoryRowDto[];
    expense: MonthlyLedgerCategoryRowDto[];
    transfer: MonthlyLedgerTransferRowDto[];
  };
}

export interface MonthlyTrendsInput {
  months: number;
}

export interface MonthlyTrendsOutput {
  rows: MonthlyTrendDto[];
}

export interface CategoryBreakdownInput {
  from?: string;
  to?: string;
}

export interface CategoryBreakdownOutput {
  rows: CategoryBreakdownDto[];
}

export interface CommitmentForecastInput {
  from: string;
  to: string;
}

export interface CommitmentForecastOutput {
  rows: CommitmentForecastDto[];
}

export interface MonthlyLedgerInput {
  from: string;
  to: string;
}

export interface MonthlyLedgerOutput {
  ledger: MonthlyLedgerDto;
}

export interface ReportsRepository {
  monthlyTrends(input: MonthlyTrendsInput): MonthlyTrendsOutput;
  categoryBreakdown(input: CategoryBreakdownInput): CategoryBreakdownOutput;
  commitmentForecast(input: CommitmentForecastInput): CommitmentForecastOutput;
  monthlyLedger(input: MonthlyLedgerInput): MonthlyLedgerOutput;
}

export class SqliteReportsRepository implements ReportsRepository {
  constructor(private readonly db: RepositoryDb) {}

  monthlyTrends({ months }: MonthlyTrendsInput): MonthlyTrendsOutput {
    const rows = this.db
      .select({
        month: sql<string>`substr(${expenses.occurredAt}, 1, 7)`,
        spendMinor: sql<number>`SUM(${expenses.amountMinor})`,
        spendBaseMinor: sql<number>`SUM(COALESCE(${expenses.amountBaseMinor}, ${expenses.amountMinor}))`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .groupBy(sql`substr(${expenses.occurredAt}, 1, 7)`)
      .orderBy(sql`substr(${expenses.occurredAt}, 1, 7) DESC`)
      .limit(months)
      .all();

    return {
      rows: rows.map((row) => ({
        month: row.month,
        spendMinor: Number(row.spendMinor ?? 0),
        spendBaseMinor: Number(row.spendBaseMinor ?? 0),
        txCount: Number(row.txCount ?? 0),
      })),
    };
  }

  categoryBreakdown({ from, to }: CategoryBreakdownInput): CategoryBreakdownOutput {
    const filters = [];
    if (from) {
      filters.push(gte(expenses.occurredAt, from));
    }
    if (to) {
      filters.push(lte(expenses.occurredAt, to));
    }

    const query = this.db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        totalMinor: sql<number>`SUM(${expenses.amountMinor})`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .innerJoin(categories, eq(expenses.categoryId, categories.id))
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(sql`SUM(${expenses.amountMinor}) DESC`);

    const rows = filters.length > 0 ? query.where(and(...filters)).all() : query.all();

    return {
      rows: rows.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        totalMinor: Number(row.totalMinor ?? 0),
        txCount: Number(row.txCount ?? 0),
      })),
    };
  }

  commitmentForecast({ from, to }: CommitmentForecastInput): CommitmentForecastOutput {
    const rows = this.db
      .select({
        id: commitmentInstances.id,
        commitmentId: commitmentInstances.commitmentId,
        commitmentName: recurringCommitments.name,
        dueAt: commitmentInstances.dueAt,
        expectedAmountMinor: commitmentInstances.expectedAmountMinor,
        currency: commitmentInstances.currency,
        status: commitmentInstances.status,
      })
      .from(commitmentInstances)
      .innerJoin(
        recurringCommitments,
        eq(commitmentInstances.commitmentId, recurringCommitments.id),
      )
      .where(
        and(
          gte(commitmentInstances.dueAt, from),
          lte(commitmentInstances.dueAt, to),
          inArray(commitmentInstances.status, ['pending', 'overdue']),
        ),
      )
      .orderBy(commitmentInstances.dueAt)
      .all();

    return { rows };
  }

  monthlyLedger({ from, to }: MonthlyLedgerInput): MonthlyLedgerOutput {
    const groupedRows = this.db
      .select({
        kind: categories.kind,
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        transferDirection: expenses.transferDirection,
        totalMinor: sql<number>`SUM(${expenses.amountMinor})`,
        txCount: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .innerJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(gte(expenses.occurredAt, from), lt(expenses.occurredAt, to)))
      .groupBy(categories.kind, expenses.categoryId, categories.name, expenses.transferDirection)
      .all();

    const income: MonthlyLedgerCategoryRowDto[] = [];
    const expense: MonthlyLedgerCategoryRowDto[] = [];
    const transfer: MonthlyLedgerTransferRowDto[] = [];

    let incomeMinor = 0;
    let expenseMinor = 0;
    let transferInMinor = 0;
    let transferOutMinor = 0;
    let totalTxCount = 0;

    for (const row of groupedRows) {
      const totalMinor = Number(row.totalMinor ?? 0);
      const txCount = Number(row.txCount ?? 0);
      totalTxCount += txCount;

      if (row.kind === 'income') {
        income.push({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          totalMinor,
          txCount,
        });
        incomeMinor += totalMinor;
        continue;
      }

      if (row.kind === 'expense') {
        expense.push({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          totalMinor,
          txCount,
        });
        expenseMinor += totalMinor;
        continue;
      }

      const direction = row.transferDirection === 'in' ? 'in' : 'out';
      transfer.push({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        direction,
        totalMinor,
        txCount,
      });
      if (direction === 'in') {
        transferInMinor += totalMinor;
      } else {
        transferOutMinor += totalMinor;
      }
    }

    const byTotalDesc = <T extends { totalMinor: number; categoryName: string }>(a: T, b: T): number =>
      b.totalMinor - a.totalMinor || a.categoryName.localeCompare(b.categoryName);

    income.sort(byTotalDesc);
    expense.sort(byTotalDesc);
    transfer.sort(
      (a, b) =>
        (a.direction === b.direction ? 0 : a.direction === 'out' ? -1 : 1) ||
        b.totalMinor - a.totalMinor ||
        a.categoryName.localeCompare(b.categoryName),
    );

    const operatingSurplusMinor = incomeMinor - expenseMinor;
    const netCashMovementMinor = operatingSurplusMinor + transferInMinor - transferOutMinor;

    return {
      ledger: {
        month: from.slice(0, 7),
        range: { from, to },
        totals: {
          incomeMinor,
          expenseMinor,
          transferInMinor,
          transferOutMinor,
          operatingSurplusMinor,
          netCashMovementMinor,
          txCount: totalTxCount,
        },
        sections: {
          income,
          expense,
          transfer,
        },
      },
    };
  }
}
