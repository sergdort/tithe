import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import { withTransaction } from '../repositories/shared.js';
import type {
  ActorContext,
  CreateExpenseInput,
  ListExpensesInput,
  UpdateExpenseInput,
} from '../types.js';
import type { ApprovalService } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, normalizeCurrency, toIso } from './shared/common.js';
import type { DomainRuntimeDeps } from './shared/deps.js';
import type { ExpensesService } from './types.js';

interface ExpenseServiceDeps {
  runtime: DomainRuntimeDeps;
  approvals: ApprovalService;
  audit: AuditService;
}

export const createExpensesService = ({
  runtime,
  approvals,
  audit,
}: ExpenseServiceDeps): ExpensesService => ({
  async list(input: ListExpensesInput = {}) {
    return runtime.withDb(({ db }) => {
      const from = input.from ? assertDate(input.from, 'from') : undefined;
      const to = input.to ? assertDate(input.to, 'to') : undefined;

      return runtime.repositories.expenses(db).list({
        from,
        to,
        categoryId: input.categoryId,
        limit: input.limit ?? 200,
      }).expenses;
    });
  },

  async get(id: string) {
    return runtime.withDb(({ db }) => {
      const expense = runtime.repositories.expenses(db).findById({ id }).expense;
      if (!expense) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }
      return expense;
    });
  },

  async create(input: CreateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const payload = {
      id: crypto.randomUUID(),
      occurredAt: assertDate(input.occurredAt, 'occurredAt'),
      postedAt: input.postedAt ? assertDate(input.postedAt, 'postedAt') : null,
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      amountBaseMinor: input.amountBaseMinor,
      fxRate: input.fxRate,
      categoryId: input.categoryId,
      source: input.source ?? 'manual',
      merchantName: input.merchantName ?? null,
      note: input.note ?? null,
      externalRef: input.externalRef ?? null,
      commitmentInstanceId: input.commitmentInstanceId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const createdExpense = await runtime.withDb(({ db }) => {
      const category = runtime.repositories
        .categories(db)
        .findById({ id: payload.categoryId }).category;

      if (!category) {
        throw new AppError(
          'CATEGORY_NOT_FOUND',
          'Cannot create expense with unknown category',
          404,
          {
            categoryId: payload.categoryId,
          },
        );
      }

      try {
        return withTransaction(db, (tx) => {
          const created = runtime.repositories.expenses(tx).create(payload).expense;

          if (payload.commitmentInstanceId) {
            runtime.repositories.commitments(tx).markInstancePaid({
              instanceId: payload.commitmentInstanceId,
              expenseId: payload.id,
              resolvedAt: now,
            });
          }

          return created;
        });
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        throw new AppError('EXPENSE_CREATE_FAILED', 'Could not create expense', 409, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await audit.writeAudit('expense.create', payload, context);
    return createdExpense;
  },

  async update(id: string, input: UpdateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
    const { expense, patch } = await runtime.withDb(({ db }) => {
      const existing = runtime.repositories.expenses(db).findById({ id }).expense;
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      const nextPatch = {
        occurredAt: input.occurredAt
          ? assertDate(input.occurredAt, 'occurredAt')
          : existing.occurredAt,
        postedAt:
          input.postedAt === undefined
            ? existing.postedAt
            : input.postedAt === null
              ? null
              : assertDate(input.postedAt, 'postedAt'),
        amountMinor: input.amountMinor ?? existing.money.amountMinor,
        currency: input.currency ? normalizeCurrency(input.currency) : existing.money.currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.money.amountBaseMinor,
        fxRate: input.fxRate ?? existing.money.fxRate,
        categoryId: input.categoryId ?? existing.categoryId,
        merchantName: input.merchantName ?? existing.merchantName,
        note: input.note ?? existing.note,
        updatedAt: toIso(new Date()),
      };

      const updated = runtime.repositories.expenses(db).update({ id, ...nextPatch }).expense;

      if (!updated) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      return {
        expense: updated,
        patch: nextPatch,
      };
    });

    await audit.writeAudit('expense.update', { id, patch }, context);

    return expense;
  },

  async createDeleteApproval(id: string) {
    return approvals.createApproval('expense.delete', { id });
  },

  async delete(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
    await approvals.consumeApproval('expense.delete', approveOperationId, { id });

    await runtime.withDb(({ db }) => {
      const existing = runtime.repositories.expenses(db).findById({ id }).expense;
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      withTransaction(db, (tx) => {
        if (existing.commitmentInstanceId) {
          runtime.repositories.commitments(tx).resetInstanceToPending({
            instanceId: existing.commitmentInstanceId,
          });
        }

        runtime.repositories.expenses(tx).deleteById({ id });
      });
    });

    await audit.writeAudit('expense.delete', { id }, context);
  },
});
