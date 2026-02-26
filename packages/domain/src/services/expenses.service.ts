import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import { SqliteCommitmentsRepository } from '../repositories/commitments.repository.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import { SqliteReimbursementsRepository } from '../repositories/reimbursements.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type {
  ActorContext,
  CreateExpenseInput,
  ListExpensesInput,
  ReimbursementStatus,
  UpdateExpenseInput,
} from '../types.js';
import {
  assertPositiveAmountMinor,
  deriveExpenseKind,
  deriveReimbursementStatus,
  enrichExpensesWithReimbursements,
  isTransferKind,
  normalizeCounterpartyType,
  normalizeExpenseKind,
  normalizeTransferDirection,
  resolveReimbursableDefaults,
  validateAndResolveMyShareMinor,
} from './expenses-logic.js';
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

export const createExpensesService = ({
  runtime,
  approvals,
  audit,
}: ExpenseServiceDeps): ExpensesService => {
  const categoriesRepo = (db: RepositoryDb = runtime.db) => new SqliteCategoriesRepository(db);
  const commitmentsRepo = (db: RepositoryDb = runtime.db) => new SqliteCommitmentsRepository(db);
  const expensesRepo = (db: RepositoryDb = runtime.db) => new SqliteExpensesRepository(db);
  const reimbursementsRepo = (db: RepositoryDb = runtime.db) =>
    new SqliteReimbursementsRepository(db);

  const enrich = (items: ExpenseDto[]): ExpenseDto[] => {
    const outIds = items
      .filter(
        (item) =>
          item.kind === 'expense' &&
          (item.reimbursementStatus !== 'none' || item.myShareMinor !== null),
      )
      .map((item) => item.id);
    const recoveredRows = reimbursementsRepo().sumRecoveredByExpenseOutIds({
      expenseOutIds: outIds,
    }).rows;
    const recoveredByOutId = new Map(
      recoveredRows.map((row) => [row.expenseOutId, row.totalMinor] as const),
    );
    return enrichExpensesWithReimbursements({ items, recoveredByOutId });
  };

  const enrichOne = (item: ExpenseDto): ExpenseDto => enrich([item])[0] as ExpenseDto;

  const syncStoredReimbursementStatus = (db: RepositoryDb, expenseId: string): ExpenseDto => {
    const repo = expensesRepo(db);
    const expense = repo.findById({ id: expenseId }).expense;
    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${expenseId} does not exist`, 404);
    }
    const recoveredMinor =
      reimbursementsRepo(db).sumRecoveredByExpenseOutIds({ expenseOutIds: [expenseId] }).rows[0]
        ?.totalMinor ?? 0;
    const nextStatus = deriveReimbursementStatus({ expense, recoveredMinor });
    const patched = repo.updateReimbursement({
      id: expenseId,
      reimbursementStatus: nextStatus,
      myShareMinor: expense.myShareMinor,
      closedOutstandingMinor: expense.closedOutstandingMinor,
      counterpartyType: expense.counterpartyType,
      reimbursementGroupId: expense.reimbursementGroupId,
      reimbursementClosedAt: expense.reimbursementClosedAt,
      reimbursementClosedReason: expense.reimbursementClosedReason,
      updatedAt: toIso(new Date()),
    }).expense;
    if (!patched) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${expenseId} does not exist`, 404);
    }
    return patched;
  };

  return {
    async list(input: ListExpensesInput = {}) {
      const from = input.from ? assertDate(input.from, 'from') : undefined;
      const to = input.to ? assertDate(input.to, 'to') : undefined;

      const rows = expensesRepo().list({
        from,
        to,
        categoryId: input.categoryId,
        limit: input.limit ?? 200,
      }).expenses;

      return enrich(rows);
    },

    async get(id: string) {
      const expense = expensesRepo().findById({ id }).expense;
      if (!expense) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }
      return enrichOne(expense);
    },

    async create(input: CreateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
      const now = toIso(new Date());
      const transferDirection = normalizeTransferDirection(input.transferDirection);
      const amountMinor = assertPositiveAmountMinor(input.amountMinor);

      const category = categoriesRepo().findById({ id: input.categoryId }).category;
      if (!category) {
        throw new AppError(
          'CATEGORY_NOT_FOUND',
          'Cannot create expense with unknown category',
          404,
          {
            categoryId: input.categoryId,
          },
        );
      }

      const kind = deriveExpenseKind({
        category,
        requestedKind: normalizeExpenseKind(input.kind),
        transferDirection,
      });

      const effectiveTransferDirection = isTransferKind(kind) ? transferDirection : null;
      if (isTransferKind(kind) && !effectiveTransferDirection) {
        throw new AppError(
          'VALIDATION_ERROR',
          'transferDirection is required for transfer kinds',
          400,
          {
            kind,
          },
        );
      }

      const reimbursable = resolveReimbursableDefaults({
        category,
        kind,
        requestedReimbursable: input.reimbursable,
      });
      const myShareMinor = validateAndResolveMyShareMinor({
        amountMinor,
        reimbursable,
        requestedMyShareMinor: input.myShareMinor,
      });
      const counterpartyType = reimbursable
        ? normalizeCounterpartyType(input.counterpartyType ?? category.defaultCounterpartyType)
        : null;
      const reimbursementGroupId = reimbursable ? (input.reimbursementGroupId ?? null) : null;
      const reimbursementStatus: ReimbursementStatus = reimbursable ? 'expected' : 'none';

      const payload = {
        id: crypto.randomUUID(),
        occurredAt: assertDate(input.occurredAt, 'occurredAt'),
        postedAt: input.postedAt ? assertDate(input.postedAt, 'postedAt') : null,
        amountMinor,
        currency: normalizeCurrency(input.currency),
        amountBaseMinor: input.amountBaseMinor,
        fxRate: input.fxRate,
        categoryId: input.categoryId,
        source: input.source ?? 'local',
        transferDirection: effectiveTransferDirection,
        kind,
        reimbursementStatus,
        myShareMinor,
        closedOutstandingMinor: null,
        counterpartyType,
        reimbursementGroupId,
        reimbursementClosedAt: null,
        reimbursementClosedReason: null,
        merchantName: input.merchantName ?? null,
        merchantLogoUrl: null,
        merchantEmoji: null,
        note: input.note ?? null,
        providerTransactionId: input.providerTransactionId ?? null,
        commitmentInstanceId: input.commitmentInstanceId ?? null,
        createdAt: now,
        updatedAt: now,
      };

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

          return syncStoredReimbursementStatus(tx, created.id);
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
      return enrichOne(createdExpense);
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

      const nextKind = deriveExpenseKind({
        category,
        requestedKind: normalizeExpenseKind(input.kind) ?? existing.kind,
        transferDirection: requestedTransferDirection,
      });
      const nextTransferDirection = isTransferKind(nextKind) ? requestedTransferDirection : null;

      const amountMinor = input.amountMinor ?? existing.money.amountMinor;
      assertPositiveAmountMinor(amountMinor);
      const currency = input.currency ? normalizeCurrency(input.currency) : existing.money.currency;

      const inboundAllocatedMinor =
        reimbursementsRepo().sumAllocatedByExpenseInIds({ expenseInIds: [id] }).rows[0]
          ?.totalMinor ?? 0;
      if (inboundAllocatedMinor > 0) {
        if (!(nextKind === 'income' || nextKind === 'transfer_external')) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Cannot change expense kind while it is linked as an inbound reimbursement',
            400,
            { id, inboundAllocatedMinor, kind: nextKind },
          );
        }
        if (currency !== existing.money.currency) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Cannot change currency while expense is linked as an inbound reimbursement',
            400,
            { id, inboundAllocatedMinor },
          );
        }
        if (amountMinor < inboundAllocatedMinor) {
          throw new AppError(
            'VALIDATION_ERROR',
            'amountMinor cannot be less than inbound reimbursement allocations',
            400,
            { id, amountMinor, inboundAllocatedMinor },
          );
        }
      }

      const reimbursable = resolveReimbursableDefaults({
        category,
        kind: nextKind,
        requestedReimbursable: input.reimbursable,
        existing,
      });

      const recoveredMinor =
        reimbursementsRepo().sumRecoveredByExpenseOutIds({ expenseOutIds: [id] }).rows[0]
          ?.totalMinor ?? 0;
      if (!reimbursable && recoveredMinor > 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Cannot disable reimbursement tracking while reimbursements are linked',
          400,
          { id, recoveredMinor },
        );
      }

      const myShareMinor = validateAndResolveMyShareMinor({
        amountMinor,
        reimbursable,
        requestedMyShareMinor: input.myShareMinor,
        existing,
      });
      if (reimbursable && amountMinor - (myShareMinor ?? 0) < recoveredMinor) {
        throw new AppError(
          'VALIDATION_ERROR',
          'myShareMinor is too high for existing reimbursement allocations',
          400,
          { id, myShareMinor, amountMinor, recoveredMinor },
        );
      }

      const nextCounterpartyType = reimbursable
        ? normalizeCounterpartyType(
            input.counterpartyType === undefined
              ? (existing.counterpartyType ?? category.defaultCounterpartyType)
              : input.counterpartyType,
          )
        : null;
      const nextReimbursementGroupId = reimbursable
        ? ((input.reimbursementGroupId === undefined
            ? existing.reimbursementGroupId
            : input.reimbursementGroupId) ?? null)
        : null;

      const clearClosedBecauseNotReimbursable = !reimbursable;
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
        amountMinor,
        currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.money.amountBaseMinor,
        fxRate: input.fxRate ?? existing.money.fxRate,
        categoryId: targetCategoryId,
        transferDirection: nextTransferDirection,
        kind: nextKind,
        reimbursementStatus: reimbursable ? existing.reimbursementStatus : 'none',
        myShareMinor,
        closedOutstandingMinor: clearClosedBecauseNotReimbursable
          ? null
          : existing.closedOutstandingMinor,
        counterpartyType: nextCounterpartyType,
        reimbursementGroupId: nextReimbursementGroupId,
        reimbursementClosedAt: clearClosedBecauseNotReimbursable
          ? null
          : existing.reimbursementClosedAt,
        reimbursementClosedReason: clearClosedBecauseNotReimbursable
          ? null
          : existing.reimbursementClosedReason,
        merchantName: input.merchantName ?? existing.merchantName,
        merchantLogoUrl: existing.merchantLogoUrl,
        merchantEmoji: existing.merchantEmoji,
        note: input.note ?? existing.note,
        updatedAt: toIso(new Date()),
      };

      const expense = withTransaction(runtime.db, (tx) => {
        const updated = expensesRepo(tx).update({ id, ...patch }).expense;
        if (!updated) {
          throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
        }
        return syncStoredReimbursementStatus(tx, id);
      });

      await audit.writeAudit('expense.update', { id, patch }, context);

      return enrichOne(expense);
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

        const impactedOutIds = reimbursementsRepo(tx)
          .listByExpenseInIds({ expenseInIds: [id] })
          .links.map((link) => link.expenseOutId);
        expensesRepo(tx).deleteById({ id });

        for (const outId of new Set(impactedOutIds)) {
          if (outId !== id) {
            syncStoredReimbursementStatus(tx, outId);
          }
        }
      });

      await audit.writeAudit('expense.delete', { id }, context);
    },
  };
};
