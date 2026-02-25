import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import type { CategoryDto } from '../repositories/categories.repository.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import { SqliteCommitmentsRepository } from '../repositories/commitments.repository.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import { SqliteReimbursementsRepository } from '../repositories/reimbursements.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type {
  ActorContext,
  CreateExpenseInput,
  ExpenseKind,
  ListExpensesInput,
  ReimbursementStatus,
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

type TransferDirection = 'in' | 'out' | null;

const normalizeTransferDirection = (value: 'in' | 'out' | null | undefined): TransferDirection => {
  if (value === 'in' || value === 'out') {
    return value;
  }
  return null;
};

const normalizeExpenseKind = (value: ExpenseKind | null | undefined): ExpenseKind | null => {
  if (
    value === 'expense' ||
    value === 'income' ||
    value === 'transfer_internal' ||
    value === 'transfer_external'
  ) {
    return value;
  }
  return null;
};

const isTransferKind = (kind: ExpenseKind): boolean =>
  kind === 'transfer_internal' || kind === 'transfer_external';

const assertPositiveAmountMinor = (value: number, field = 'amountMinor'): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer`, 400, {
      field,
      value,
    });
  }
  return value;
};

const deriveExpenseKind = ({
  category,
  requestedKind,
  transferDirection,
}: {
  category: CategoryDto;
  requestedKind: ExpenseKind | null;
  transferDirection: TransferDirection;
}): ExpenseKind => {
  if (category.kind === 'transfer') {
    if (!transferDirection) {
      throw new AppError(
        'VALIDATION_ERROR',
        'transferDirection is required when category kind is transfer',
        400,
        { categoryId: category.id },
      );
    }

    if (!requestedKind) {
      return 'transfer_external';
    }

    if (!isTransferKind(requestedKind)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'kind must be transfer_internal or transfer_external for transfer categories',
        400,
        { categoryId: category.id, kind: requestedKind },
      );
    }

    return requestedKind;
  }

  if (requestedKind && isTransferKind(requestedKind)) {
    throw new AppError('VALIDATION_ERROR', 'transfer kinds require a transfer category', 400, {
      categoryId: category.id,
      kind: requestedKind,
    });
  }

  const expectedKind: ExpenseKind = category.kind === 'income' ? 'income' : 'expense';

  if (requestedKind && requestedKind !== expectedKind) {
    throw new AppError('VALIDATION_ERROR', 'kind does not match category kind', 400, {
      categoryId: category.id,
      kind: requestedKind,
      categoryKind: category.kind,
    });
  }

  return expectedKind;
};

const normalizeCounterpartyType = (
  value: 'self' | 'partner' | 'team' | 'other' | null | undefined,
): 'self' | 'partner' | 'team' | 'other' | null => {
  if (value === 'self' || value === 'partner' || value === 'team' || value === 'other') {
    return value;
  }
  return null;
};

const computeRecoverableMinor = (
  expense: Pick<ExpenseDto, 'kind' | 'reimbursementStatus' | 'money' | 'myShareMinor'>,
): number => {
  if (expense.kind !== 'expense' || expense.reimbursementStatus === 'none') {
    return 0;
  }

  const myShareMinor = expense.myShareMinor ?? 0;
  return Math.max(expense.money.amountMinor - myShareMinor, 0);
};

const deriveReimbursementStatus = ({
  expense,
  recoveredMinor,
}: {
  expense: ExpenseDto;
  recoveredMinor: number;
}): ReimbursementStatus => {
  if (expense.kind !== 'expense') {
    return 'none';
  }

  const isReimbursable = expense.reimbursementStatus !== 'none' || expense.myShareMinor !== null;
  if (!isReimbursable) {
    return 'none';
  }

  const recoverableMinor = computeRecoverableMinor(expense);
  const writtenOffMinor = Math.max(expense.closedOutstandingMinor ?? 0, 0);
  const outstandingMinor = Math.max(recoverableMinor - recoveredMinor - writtenOffMinor, 0);

  if (writtenOffMinor > 0) {
    return 'written_off';
  }
  if (recoverableMinor === 0 || outstandingMinor === 0) {
    return 'settled';
  }
  if (recoveredMinor > 0) {
    return 'partial';
  }
  return 'expected';
};

const enrichExpensesWithReimbursements = ({
  items,
  recoveredByOutId,
}: {
  items: ExpenseDto[];
  recoveredByOutId: ReadonlyMap<string, number>;
}): ExpenseDto[] =>
  items.map((item) => {
    const recoveredMinor = recoveredByOutId.get(item.id) ?? 0;
    const recoverableMinor = computeRecoverableMinor(item);
    const outstandingMinor = Math.max(
      recoverableMinor - recoveredMinor - Math.max(item.closedOutstandingMinor ?? 0, 0),
      0,
    );
    const reimbursementStatus = deriveReimbursementStatus({ expense: item, recoveredMinor });

    return {
      ...item,
      reimbursementStatus,
      recoverableMinor,
      recoveredMinor,
      outstandingMinor,
    };
  });

const resolveReimbursableDefaults = ({
  category,
  kind,
  requestedReimbursable,
  existing,
}: {
  category: CategoryDto;
  kind: ExpenseKind;
  requestedReimbursable: boolean | undefined;
  existing?: ExpenseDto;
}): boolean => {
  if (kind !== 'expense' || category.kind !== 'expense') {
    if (requestedReimbursable === true) {
      throw new AppError('VALIDATION_ERROR', 'Only expense rows can be reimbursable', 400, {
        categoryId: category.id,
        kind,
      });
    }
    return false;
  }

  if (category.reimbursementMode === 'none') {
    if (requestedReimbursable === true) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Category does not allow reimbursement tracking',
        400,
        {
          categoryId: category.id,
        },
      );
    }
    return false;
  }

  if (category.reimbursementMode === 'always') {
    if (requestedReimbursable === false) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Category reimbursement mode is always and cannot be disabled per-row',
        400,
        { categoryId: category.id },
      );
    }
    return true;
  }

  if (requestedReimbursable !== undefined) {
    return requestedReimbursable;
  }

  if (existing) {
    return existing.reimbursementStatus !== 'none' || existing.myShareMinor !== null;
  }

  return true;
};

const validateAndResolveMyShareMinor = ({
  amountMinor,
  reimbursable,
  requestedMyShareMinor,
  existing,
}: {
  amountMinor: number;
  reimbursable: boolean;
  requestedMyShareMinor: number | null | undefined;
  existing?: ExpenseDto;
}): number | null => {
  if (!reimbursable) {
    if (requestedMyShareMinor !== undefined && requestedMyShareMinor !== null) {
      throw new AppError(
        'VALIDATION_ERROR',
        'myShareMinor is only valid for reimbursable expenses',
        400,
      );
    }
    return null;
  }

  const resolved =
    requestedMyShareMinor === undefined ? (existing?.myShareMinor ?? 0) : requestedMyShareMinor;

  if (resolved === null) {
    return 0;
  }

  if (!Number.isInteger(resolved) || resolved < 0 || resolved > amountMinor) {
    throw new AppError(
      'VALIDATION_ERROR',
      'myShareMinor must be an integer between 0 and amountMinor',
      400,
      {
        myShareMinor: resolved,
        amountMinor,
      },
    );
  }

  return resolved;
};

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
