import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import { SqliteCommitmentsRepository } from '../repositories/commitments.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type {
  ActorContext,
  CreateExpenseInput,
  ListExpensesInput,
  UpdateExpenseInput,
} from '../types.js';
import type { ApprovalToken } from './shared/approval-service.js';
import type { ApprovalService } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, normalizeCurrency, toIso } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

export interface ExpensesService {
  list: (input?: ListExpensesInput) => Promise<ExpenseDto[]>;
  get: (id: string) => Promise<ExpenseDto>;
  create: (input: CreateExpenseInput, context?: ActorContext) => Promise<ExpenseDto>;
  update: (id: string, input: UpdateExpenseInput, context?: ActorContext) => Promise<ExpenseDto>;
  createDeleteApproval: (id: string) => Promise<ApprovalToken>;
  delete: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
}

interface ExpenseServiceDeps {
  runtime: DomainDbRuntime;
  approvals: ApprovalService;
  audit: AuditService;
}

const normalizeTransferDirection = (
  value: 'in' | 'out' | null | undefined,
): 'in' | 'out' | null => {
  if (value === 'in' || value === 'out') {
    return value;
  }
  return null;
};

export const createExpensesService = ({
  runtime,
  approvals,
  audit,
}: ExpenseServiceDeps): ExpensesService => {
  const categoriesRepo = (db: RepositoryDb = runtime.db) => new SqliteCategoriesRepository(db);
  const commitmentsRepo = (db: RepositoryDb = runtime.db) => new SqliteCommitmentsRepository(db);
  const expensesRepo = (db: RepositoryDb = runtime.db) => new SqliteExpensesRepository(db);

  return {
  async list(input: ListExpensesInput = {}) {
    const from = input.from ? assertDate(input.from, 'from') : undefined;
    const to = input.to ? assertDate(input.to, 'to') : undefined;

    return expensesRepo().list({
      from,
      to,
      categoryId: input.categoryId,
      limit: input.limit ?? 200,
    }).expenses;
  },

  async get(id: string) {
    const expense = expensesRepo().findById({ id }).expense;
    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }
    return expense;
  },

  async create(input: CreateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const transferDirection = normalizeTransferDirection(input.transferDirection);
    const payload = {
      id: crypto.randomUUID(),
      occurredAt: assertDate(input.occurredAt, 'occurredAt'),
      postedAt: input.postedAt ? assertDate(input.postedAt, 'postedAt') : null,
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      amountBaseMinor: input.amountBaseMinor,
      fxRate: input.fxRate,
      categoryId: input.categoryId,
      source: input.source ?? 'local',
      transferDirection,
      merchantName: input.merchantName ?? null,
      merchantLogoUrl: null,
      merchantEmoji: null,
      note: input.note ?? null,
      providerTransactionId: input.providerTransactionId ?? null,
      commitmentInstanceId: input.commitmentInstanceId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const category = categoriesRepo().findById({ id: payload.categoryId }).category;

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

    if (category.kind === 'transfer' && !transferDirection) {
      throw new AppError(
        'VALIDATION_ERROR',
        'transferDirection is required when category kind is transfer',
        400,
        {
          categoryId: payload.categoryId,
        },
      );
    }

    if (category.kind !== 'transfer') {
      payload.transferDirection = null;
    }

    let createdExpense: ExpenseDto;
    try {
      createdExpense = withTransaction(runtime.db, (tx) => {
        const txExpensesRepo = expensesRepo(tx);

        const created = txExpensesRepo.create(payload).expense;

        if (payload.commitmentInstanceId) {
          commitmentsRepo(tx).markInstancePaid({
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

    await audit.writeAudit('expense.create', payload, context);
    return createdExpense;
  },

  async update(id: string, input: UpdateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
    const existing = expensesRepo().findById({ id }).expense;
    if (!existing) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }

    const targetCategoryId = input.categoryId ?? existing.categoryId;
    const category = categoriesRepo().findById({ id: targetCategoryId }).category;
    if (!category) {
      throw new AppError(
        'CATEGORY_NOT_FOUND',
        'Cannot update expense with unknown category',
        404,
        {
          categoryId: targetCategoryId,
        },
      );
    }

    const requestedTransferDirection =
      input.transferDirection === undefined
        ? existing.transferDirection
        : normalizeTransferDirection(input.transferDirection);

    if (category.kind === 'transfer' && !requestedTransferDirection) {
      throw new AppError(
        'VALIDATION_ERROR',
        'transferDirection is required when category kind is transfer',
        400,
        {
          categoryId: targetCategoryId,
        },
      );
    }

    const patch = {
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
      categoryId: targetCategoryId,
      transferDirection: category.kind === 'transfer' ? requestedTransferDirection : null,
      merchantName: input.merchantName ?? existing.merchantName,
      merchantLogoUrl: existing.merchantLogoUrl,
      merchantEmoji: existing.merchantEmoji,
      note: input.note ?? existing.note,
      updatedAt: toIso(new Date()),
    };

    const expense = expensesRepo().update({ id, ...patch }).expense;

    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }

    await audit.writeAudit('expense.update', { id, patch }, context);

    return expense;
  },

  async createDeleteApproval(id: string) {
    return approvals.createApproval('expense.delete', { id });
  },

  async delete(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
    await approvals.consumeApproval('expense.delete', approveOperationId, { id });

    const existing = expensesRepo().findById({ id }).expense;
    if (!existing) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }

    withTransaction(runtime.db, (tx) => {
      if (existing.commitmentInstanceId) {
        commitmentsRepo(tx).resetInstanceToPending({
          instanceId: existing.commitmentInstanceId,
        });
      }

      expensesRepo(tx).deleteById({ id });
    });

    await audit.writeAudit('expense.delete', { id }, context);
  },
};
};
