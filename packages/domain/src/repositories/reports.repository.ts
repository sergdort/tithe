import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';

import {
  categories,
  commitmentInstances,
  expenses,
  reimbursementLinks,
  recurringCommitments,
} from '@tithe/db';

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
  cashFlow: {
    cashInMinor: number;
    cashOutMinor: number;
    internalTransferInMinor: number;
    internalTransferOutMinor: number;
    externalTransferInMinor: number;
    externalTransferOutMinor: number;
    netFlowMinor: number;
  };
  spending: {
    grossSpendMinor: number;
    recoveredMinor: number;
    writtenOffMinor: number;
    netPersonalSpendMinor: number;
  };
  reimbursements: {
    recoverableMinor: number;
    recoveredMinor: number;
    outstandingMinor: number;
    partialCount: number;
    settledCount: number;
  };
  sections: {
    income: MonthlyLedgerCategoryRowDto[];
    expense: MonthlyLedgerCategoryRowDto[];
    transfer: MonthlyLedgerTransferRowDto[];
    transferInternal: MonthlyLedgerTransferRowDto[];
    transferExternal: MonthlyLedgerTransferRowDto[];
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
      .where(eq(expenses.kind, 'expense'))
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

    const rows =
      filters.length > 0
        ? query.where(and(eq(expenses.kind, 'expense'), ...filters)).all()
        : query.where(eq(expenses.kind, 'expense')).all();

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
    const rows = this.db
      .select({
        id: expenses.id,
        kind: expenses.kind,
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        transferDirection: expenses.transferDirection,
        amountMinor: expenses.amountMinor,
        reimbursementStatus: expenses.reimbursementStatus,
        myShareMinor: expenses.myShareMinor,
        closedOutstandingMinor: expenses.closedOutstandingMinor,
      })
      .from(expenses)
      .innerJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(gte(expenses.occurredAt, from), lt(expenses.occurredAt, to)))
      .all();

    const expenseIds = rows.map((row) => row.id);
    const recoveredByOutId = new Map(
      (expenseIds.length === 0
        ? []
        : this.db
            .select({
              expenseOutId: reimbursementLinks.expenseOutId,
              totalMinor: sql<number>`SUM(${reimbursementLinks.amountMinor})`,
            })
            .from(reimbursementLinks)
            .where(inArray(reimbursementLinks.expenseOutId, expenseIds))
            .groupBy(reimbursementLinks.expenseOutId)
            .all()
      ).map((row) => [row.expenseOutId, Number(row.totalMinor ?? 0)] as const),
    );

    const incomeMap = new Map<string, MonthlyLedgerCategoryRowDto>();
    const expenseMap = new Map<string, MonthlyLedgerCategoryRowDto>();
    const transferMap = new Map<string, MonthlyLedgerTransferRowDto>();
    const transferInternalMap = new Map<string, MonthlyLedgerTransferRowDto>();
    const transferExternalMap = new Map<string, MonthlyLedgerTransferRowDto>();

    let incomeMinor = 0;
    let expenseMinor = 0;
    let transferInMinor = 0;
    let transferOutMinor = 0;
    let internalTransferInMinor = 0;
    let internalTransferOutMinor = 0;
    let externalTransferInMinor = 0;
    let externalTransferOutMinor = 0;
    let recoverableMinorTotal = 0;
    let recoveredMinorTotal = 0;
    let outstandingMinorTotal = 0;
    let writtenOffMinorTotal = 0;
    let partialCount = 0;
    let settledCount = 0;

    const pushCategory = (
      map: Map<string, MonthlyLedgerCategoryRowDto>,
      categoryId: string,
      categoryName: string,
      amountMinor: number,
    ) => {
      const key = categoryId;
      const existing = map.get(key);
      if (existing) {
        existing.totalMinor += amountMinor;
        existing.txCount += 1;
        return;
      }
      map.set(key, {
        categoryId,
        categoryName,
        totalMinor: amountMinor,
        txCount: 1,
      });
    };

    const pushTransfer = (
      map: Map<string, MonthlyLedgerTransferRowDto>,
      categoryId: string,
      categoryName: string,
      direction: 'in' | 'out',
      amountMinor: number,
    ) => {
      const key = `${categoryId}:${direction}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalMinor += amountMinor;
        existing.txCount += 1;
        return;
      }
      map.set(key, {
        categoryId,
        categoryName,
        direction,
        totalMinor: amountMinor,
        txCount: 1,
      });
    };

    for (const row of rows) {
      const amountMinor = Number(row.amountMinor ?? 0);
      const semanticKind =
        row.kind === 'income' ||
        row.kind === 'transfer_internal' ||
        row.kind === 'transfer_external'
          ? row.kind
          : 'expense';

      if (semanticKind === 'income') {
        pushCategory(incomeMap, row.categoryId, row.categoryName, amountMinor);
        incomeMinor += amountMinor;
        continue;
      }

      if (semanticKind === 'expense') {
        pushCategory(expenseMap, row.categoryId, row.categoryName, amountMinor);
        expenseMinor += amountMinor;

        const isReimbursable =
          row.reimbursementStatus !== 'none' || row.myShareMinor !== null;
        if (isReimbursable) {
          const myShareMinor = Math.max(Number(row.myShareMinor ?? 0), 0);
          const recoverableMinor = Math.max(amountMinor - myShareMinor, 0);
          const recoveredMinor = recoveredByOutId.get(row.id) ?? 0;
          const writtenOffMinor = Math.max(Number(row.closedOutstandingMinor ?? 0), 0);
          const outstandingMinor = Math.max(recoverableMinor - recoveredMinor - writtenOffMinor, 0);

          recoverableMinorTotal += recoverableMinor;
          recoveredMinorTotal += recoveredMinor;
          outstandingMinorTotal += outstandingMinor;
          writtenOffMinorTotal += writtenOffMinor;

          if (writtenOffMinor > 0) {
            // written_off is tracked separately from settled count
          } else if (outstandingMinor === 0) {
            settledCount += 1;
          } else if (recoveredMinor > 0) {
            partialCount += 1;
          }
        }

        continue;
      }

      const direction = row.transferDirection === 'in' ? 'in' : 'out';
      pushTransfer(transferMap, row.categoryId, row.categoryName, direction, amountMinor);

      if (direction === 'in') {
        transferInMinor += amountMinor;
      } else {
        transferOutMinor += amountMinor;
      }

      if (semanticKind === 'transfer_internal') {
        pushTransfer(transferInternalMap, row.categoryId, row.categoryName, direction, amountMinor);
        if (direction === 'in') {
          internalTransferInMinor += amountMinor;
        } else {
          internalTransferOutMinor += amountMinor;
        }
      } else {
        pushTransfer(transferExternalMap, row.categoryId, row.categoryName, direction, amountMinor);
        if (direction === 'in') {
          externalTransferInMinor += amountMinor;
        } else {
          externalTransferOutMinor += amountMinor;
        }
      }
    }

    const byTotalDesc = <T extends { totalMinor: number; categoryName: string }>(a: T, b: T): number =>
      b.totalMinor - a.totalMinor || a.categoryName.localeCompare(b.categoryName);

    const sortTransfer = (a: MonthlyLedgerTransferRowDto, b: MonthlyLedgerTransferRowDto): number =>
      (a.direction === b.direction ? 0 : a.direction === 'out' ? -1 : 1) ||
      b.totalMinor - a.totalMinor ||
      a.categoryName.localeCompare(b.categoryName);

    const income = [...incomeMap.values()].sort(byTotalDesc);
    const expense = [...expenseMap.values()].sort(byTotalDesc);
    const transfer = [...transferMap.values()].sort(sortTransfer);
    const transferInternal = [...transferInternalMap.values()].sort(sortTransfer);
    const transferExternal = [...transferExternalMap.values()].sort(sortTransfer);

    const operatingSurplusMinor = incomeMinor - expenseMinor;
    const netCashMovementMinor = operatingSurplusMinor + transferInMinor - transferOutMinor;
    const cashInMinor = incomeMinor + externalTransferInMinor;
    const cashOutMinor = expenseMinor + externalTransferOutMinor;
    const netFlowMinor = cashInMinor - cashOutMinor;
    const grossSpendMinor = expenseMinor;
    const netPersonalSpendMinor = grossSpendMinor - recoveredMinorTotal + writtenOffMinorTotal;

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
          txCount: rows.length,
        },
        cashFlow: {
          cashInMinor,
          cashOutMinor,
          internalTransferInMinor,
          internalTransferOutMinor,
          externalTransferInMinor,
          externalTransferOutMinor,
          netFlowMinor,
        },
        spending: {
          grossSpendMinor,
          recoveredMinor: recoveredMinorTotal,
          writtenOffMinor: writtenOffMinorTotal,
          netPersonalSpendMinor,
        },
        reimbursements: {
          recoverableMinor: recoverableMinorTotal,
          recoveredMinor: recoveredMinorTotal,
          outstandingMinor: outstandingMinorTotal,
          partialCount,
          settledCount,
        },
        sections: {
          income,
          expense,
          transfer,
          transferInternal,
          transferExternal,
        },
      },
    };
  }
}
