import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import type { CategoryDto } from '../repositories/categories.repository.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import type { ReimbursementCategoryRuleDto } from '../repositories/reimbursement-category-rules.repository.js';
import { SqliteReimbursementCategoryRulesRepository } from '../repositories/reimbursement-category-rules.repository.js';
import type { ReimbursementLinkDto } from '../repositories/reimbursements.repository.js';
import { SqliteReimbursementsRepository } from '../repositories/reimbursements.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type { ActorContext, ReimbursementStatus } from '../types.js';
import type { ApprovalService, ApprovalToken } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, toIso } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

interface ReimbursementsServiceDeps {
  runtime: DomainDbRuntime;
  approvals: ApprovalService;
  audit: AuditService;
}

export interface CreateReimbursementLinkInput {
  expenseOutId: string;
  expenseInId: string;
  amountMinor: number;
  idempotencyKey?: string | null;
}

export interface CloseReimbursementInput {
  closeOutstandingMinor?: number;
  reason?: string;
}

export interface AutoMatchReimbursementsInput {
  from?: string;
  to?: string;
}

export interface AutoMatchReimbursementsSummary {
  matched: number;
  linksCreated: number;
  scannedOutflows: number;
  scannedInflows: number;
  from: string | null;
  to: string | null;
}

export interface CreateReimbursementCategoryRuleInput {
  expenseCategoryId: string;
  inboundCategoryId: string;
  enabled?: boolean;
}

export interface ReimbursementsService {
  link: (input: CreateReimbursementLinkInput, context?: ActorContext) => Promise<ReimbursementLinkDto>;
  createUnlinkApproval: (id: string) => Promise<ApprovalToken>;
  unlink: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
  listCategoryRules: () => Promise<ReimbursementCategoryRuleDto[]>;
  createCategoryRule: (
    input: CreateReimbursementCategoryRuleInput,
    context?: ActorContext,
  ) => Promise<ReimbursementCategoryRuleDto>;
  createDeleteCategoryRuleApproval: (id: string) => Promise<ApprovalToken>;
  deleteCategoryRule: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
  close: (expenseOutId: string, input: CloseReimbursementInput, context?: ActorContext) => Promise<ExpenseDto>;
  reopen: (expenseOutId: string, context?: ActorContext) => Promise<ExpenseDto>;
  autoMatch: (
    input?: AutoMatchReimbursementsInput,
    context?: ActorContext,
  ) => Promise<AutoMatchReimbursementsSummary>;
}

const assertPositiveMinor = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer`, 400, { field, value });
  }
  return value;
};

const computeRecoverableMinor = (expense: ExpenseDto): number => {
  if (expense.kind !== 'expense' || expense.reimbursementStatus === 'none') {
    return 0;
  }
  return Math.max(expense.money.amountMinor - (expense.myShareMinor ?? 0), 0);
};

const deriveReimbursementStatus = (expense: ExpenseDto, recoveredMinor: number): ReimbursementStatus => {
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

  if (writtenOffMinor > 0) return 'written_off';
  if (recoverableMinor === 0 || outstandingMinor === 0) return 'settled';
  if (recoveredMinor > 0) return 'partial';
  return 'expected';
};

export const createReimbursementsService = ({
  runtime,
  approvals,
  audit,
}: ReimbursementsServiceDeps): ReimbursementsService => {
  const categoriesRepo = (db: RepositoryDb = runtime.db) => new SqliteCategoriesRepository(db);
  const expensesRepo = (db: RepositoryDb = runtime.db) => new SqliteExpensesRepository(db);
  const categoryRulesRepo = (db: RepositoryDb = runtime.db) => new SqliteReimbursementCategoryRulesRepository(db);
  const reimbursementsRepo = (db: RepositoryDb = runtime.db) => new SqliteReimbursementsRepository(db);

  const getExpenseOrThrow = (db: RepositoryDb, id: string): ExpenseDto => {
    const expense = expensesRepo(db).findById({ id }).expense;
    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }
    return expense;
  };

  const getCategoryOrThrow = (db: RepositoryDb, id: string): CategoryDto => {
    const category = categoriesRepo(db).findById({ id }).category;
    if (!category) {
      throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
    }
    return category;
  };

  const assertCategoryRuleKinds = (db: RepositoryDb, expenseCategoryId: string, inboundCategoryId: string): void => {
    const expenseCategory = getCategoryOrThrow(db, expenseCategoryId);
    const inboundCategory = getCategoryOrThrow(db, inboundCategoryId);

    if (expenseCategory.kind !== 'expense') {
      throw new AppError(
        'REIMBURSEMENT_CATEGORY_RULE_INVALID_EXPENSE_CATEGORY',
        'Expense category rule source must be an expense category',
        400,
        { expenseCategoryId, kind: expenseCategory.kind },
      );
    }

    if (!(inboundCategory.kind === 'income' || inboundCategory.kind === 'transfer')) {
      throw new AppError(
        'REIMBURSEMENT_CATEGORY_RULE_INVALID_INBOUND_CATEGORY',
        'Inbound category rule target must be an income or transfer category',
        400,
        { inboundCategoryId, kind: inboundCategory.kind },
      );
    }
  };

  const enrichExpense = (db: RepositoryDb, expense: ExpenseDto): ExpenseDto => {
    const recoveredMinor =
      reimbursementsRepo(db).sumRecoveredByExpenseOutIds({ expenseOutIds: [expense.id] }).rows[0]?.totalMinor ?? 0;
    const recoverableMinor = computeRecoverableMinor(expense);
    const outstandingMinor = Math.max(
      recoverableMinor - recoveredMinor - Math.max(expense.closedOutstandingMinor ?? 0, 0),
      0,
    );
    return {
      ...expense,
      reimbursementStatus: deriveReimbursementStatus(expense, recoveredMinor),
      recoverableMinor,
      recoveredMinor,
      outstandingMinor,
    };
  };

  const syncStoredReimbursementStatus = (db: RepositoryDb, expenseOutId: string): ExpenseDto => {
    const expense = getExpenseOrThrow(db, expenseOutId);
    const recoveredMinor =
      reimbursementsRepo(db).sumRecoveredByExpenseOutIds({ expenseOutIds: [expenseOutId] }).rows[0]?.totalMinor ?? 0;
    const nextStatus = deriveReimbursementStatus(expense, recoveredMinor);
    const updated = expensesRepo(db).updateReimbursement({
      id: expenseOutId,
      reimbursementStatus: nextStatus,
      myShareMinor: expense.myShareMinor,
      closedOutstandingMinor: expense.closedOutstandingMinor,
      counterpartyType: expense.counterpartyType,
      reimbursementGroupId: expense.reimbursementGroupId,
      reimbursementClosedAt: expense.reimbursementClosedAt,
      reimbursementClosedReason: expense.reimbursementClosedReason,
      updatedAt: toIso(new Date()),
    }).expense;

    if (!updated) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${expenseOutId} does not exist`, 404);
    }
    return updated;
  };

  const assertOutboundReimbursable = (expense: ExpenseDto): void => {
    if (expense.kind !== 'expense') {
      throw new AppError(
        'REIMBURSEMENT_INVALID_LINK_TARGET',
        'Outgoing reimbursement source must be an expense row',
        400,
        { expenseOutId: expense.id, kind: expense.kind },
      );
    }

    if (expense.reimbursementStatus === 'none' && expense.myShareMinor === null) {
      throw new AppError(
        'REIMBURSEMENT_NOT_REIMBURSABLE',
        'Expense is not configured as reimbursable',
        400,
        { expenseOutId: expense.id },
      );
    }
  };

  return {
    async link(input: CreateReimbursementLinkInput, context: ActorContext = DEFAULT_ACTOR) {
      const amountMinor = assertPositiveMinor(input.amountMinor, 'amountMinor');
      const idempotencyKey = input.idempotencyKey?.trim() || null;

      if (idempotencyKey) {
        const existingByKey = reimbursementsRepo().findByIdempotencyKey({ idempotencyKey }).link;
        if (existingByKey) {
          if (
            existingByKey.expenseOutId === input.expenseOutId &&
            existingByKey.expenseInId === input.expenseInId &&
            existingByKey.amountMinor === amountMinor
          ) {
            return existingByKey;
          }

          throw new AppError(
            'REIMBURSEMENT_IDEMPOTENCY_KEY_CONFLICT',
            'idempotencyKey is already used for a different reimbursement link payload',
            409,
            { idempotencyKey },
          );
        }
      }

      let created: ReimbursementLinkDto;
      withTransaction(runtime.db, (tx) => {
        const outExpense = getExpenseOrThrow(tx, input.expenseOutId);
        const inExpense = getExpenseOrThrow(tx, input.expenseInId);

        if (outExpense.id === inExpense.id) {
          throw new AppError('REIMBURSEMENT_INVALID_LINK_TARGET', 'Cannot link an expense to itself', 400);
        }

        assertOutboundReimbursable(outExpense);

        if (!(inExpense.kind === 'income' || inExpense.kind === 'transfer_external')) {
          throw new AppError(
            'REIMBURSEMENT_INVALID_LINK_TARGET',
            'Inbound reimbursement target must be income or external transfer',
            400,
            { expenseInId: inExpense.id, kind: inExpense.kind },
          );
        }

        if (outExpense.money.currency !== inExpense.money.currency) {
          throw new AppError('REIMBURSEMENT_CURRENCY_MISMATCH', 'Currencies must match to create a reimbursement link', 400, {
            expenseOutId: outExpense.id,
            expenseInId: inExpense.id,
            outCurrency: outExpense.money.currency,
            inCurrency: inExpense.money.currency,
          });
        }

        const outRecoveredMinor =
          reimbursementsRepo(tx).sumRecoveredByExpenseOutIds({ expenseOutIds: [outExpense.id] }).rows[0]?.totalMinor ?? 0;
        const inAllocatedMinor =
          reimbursementsRepo(tx).sumAllocatedByExpenseInIds({ expenseInIds: [inExpense.id] }).rows[0]?.totalMinor ?? 0;

        const recoverableMinor = computeRecoverableMinor(outExpense);
        const outstandingMinor = Math.max(
          recoverableMinor - outRecoveredMinor - Math.max(outExpense.closedOutstandingMinor ?? 0, 0),
          0,
        );
        const inboundAvailableMinor = Math.max(inExpense.money.amountMinor - inAllocatedMinor, 0);

        if (outstandingMinor <= 0) {
          throw new AppError(
            'REIMBURSEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
            'No outstanding reimbursable amount remains on outbound expense',
            400,
            { expenseOutId: outExpense.id },
          );
        }

        if (amountMinor > outstandingMinor) {
          throw new AppError(
            'REIMBURSEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
            'Link amount exceeds outbound outstanding amount',
            400,
            { amountMinor, outstandingMinor, expenseOutId: outExpense.id },
          );
        }

        if (amountMinor > inboundAvailableMinor) {
          throw new AppError(
            'REIMBURSEMENT_ALLOCATION_EXCEEDS_INBOUND_AVAILABLE',
            'Link amount exceeds inbound unallocated amount',
            400,
            { amountMinor, inboundAvailableMinor, expenseInId: inExpense.id },
          );
        }

        const now = toIso(new Date());
        created = reimbursementsRepo(tx).create({
          id: crypto.randomUUID(),
          expenseOutId: outExpense.id,
          expenseInId: inExpense.id,
          amountMinor,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        }).link;

        syncStoredReimbursementStatus(tx, outExpense.id);
      });

      await audit.writeAudit('reimbursement.link', { input: { ...input, amountMinor, idempotencyKey } }, context);
      return created!;
    },

    async createUnlinkApproval(id: string) {
      return approvals.createApproval('reimbursement_link.delete', { id });
    },

    async unlink(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
      await approvals.consumeApproval('reimbursement_link.delete', approveOperationId, { id });

      withTransaction(runtime.db, (tx) => {
        const link = reimbursementsRepo(tx).findById({ id }).link;
        if (!link) {
          throw new AppError('REIMBURSEMENT_LINK_NOT_FOUND', `Reimbursement link ${id} does not exist`, 404);
        }

        reimbursementsRepo(tx).deleteById({ id });
        syncStoredReimbursementStatus(tx, link.expenseOutId);
      });

      await audit.writeAudit('reimbursement.unlink', { id }, context);
    },

    async listCategoryRules() {
      return categoryRulesRepo().list({}).rules;
    },

    async createCategoryRule(
      input: CreateReimbursementCategoryRuleInput,
      context: ActorContext = DEFAULT_ACTOR,
    ) {
      const expenseCategoryId = input.expenseCategoryId.trim();
      const inboundCategoryId = input.inboundCategoryId.trim();
      const enabled = input.enabled ?? true;

      if (!expenseCategoryId || !inboundCategoryId) {
        throw new AppError('VALIDATION_ERROR', 'expenseCategoryId and inboundCategoryId are required', 400);
      }

      let rule: ReimbursementCategoryRuleDto;
      withTransaction(runtime.db, (tx) => {
        assertCategoryRuleKinds(tx, expenseCategoryId, inboundCategoryId);

        const existing = categoryRulesRepo(tx).findByPair({
          expenseCategoryId,
          inboundCategoryId,
        }).rule;

        if (existing) {
          if (existing.enabled === enabled) {
            rule = existing;
            return;
          }

          const updated = categoryRulesRepo(tx).update({
            id: existing.id,
            enabled,
            updatedAt: toIso(new Date()),
          }).rule;
          if (!updated) {
            throw new AppError(
              'REIMBURSEMENT_CATEGORY_RULE_NOT_FOUND',
              `Reimbursement category rule ${existing.id} does not exist`,
              404,
            );
          }
          rule = updated;
          return;
        }

        const now = toIso(new Date());
        rule = categoryRulesRepo(tx).create({
          id: crypto.randomUUID(),
          expenseCategoryId,
          inboundCategoryId,
          enabled,
          createdAt: now,
          updatedAt: now,
        }).rule;
      });

      await audit.writeAudit(
        'reimbursement.category_rule.create',
        { expenseCategoryId, inboundCategoryId, enabled },
        context,
      );
      return rule!;
    },

    async createDeleteCategoryRuleApproval(id: string) {
      return approvals.createApproval('reimbursement_category_rule.delete', { id });
    },

    async deleteCategoryRule(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
      await approvals.consumeApproval('reimbursement_category_rule.delete', approveOperationId, { id });

      const existing = categoryRulesRepo().findById({ id }).rule;
      if (!existing) {
        throw new AppError(
          'REIMBURSEMENT_CATEGORY_RULE_NOT_FOUND',
          `Reimbursement category rule ${id} does not exist`,
          404,
        );
      }

      categoryRulesRepo().deleteById({ id });
      await audit.writeAudit('reimbursement.category_rule.delete', { id }, context);
    },

    async close(expenseOutId: string, input: CloseReimbursementInput, context: ActorContext = DEFAULT_ACTOR) {
      let updatedExpense: ExpenseDto | null = null;

      withTransaction(runtime.db, (tx) => {
        const expense = getExpenseOrThrow(tx, expenseOutId);
        assertOutboundReimbursable(expense);

        const recoveredMinor =
          reimbursementsRepo(tx).sumRecoveredByExpenseOutIds({ expenseOutIds: [expense.id] }).rows[0]?.totalMinor ?? 0;
        const recoverableMinor = computeRecoverableMinor(expense);
        const currentWrittenOffMinor = Math.max(expense.closedOutstandingMinor ?? 0, 0);
        const outstandingMinor = Math.max(recoverableMinor - recoveredMinor - currentWrittenOffMinor, 0);

        if (outstandingMinor === 0) {
          updatedExpense = enrichExpense(tx, syncStoredReimbursementStatus(tx, expense.id));
          return;
        }

        const closeOutstandingMinor =
          input.closeOutstandingMinor === undefined ? outstandingMinor : input.closeOutstandingMinor;

        if (!Number.isInteger(closeOutstandingMinor) || closeOutstandingMinor < 0) {
          throw new AppError('REIMBURSEMENT_CLOSE_INVALID', 'closeOutstandingMinor must be a non-negative integer', 400, {
            closeOutstandingMinor,
          });
        }

        if (closeOutstandingMinor === 0) {
          throw new AppError('REIMBURSEMENT_CLOSE_INVALID', 'closeOutstandingMinor must be greater than zero when outstanding remains', 400, {
            outstandingMinor,
          });
        }

        if (closeOutstandingMinor > outstandingMinor) {
          throw new AppError('REIMBURSEMENT_CLOSE_INVALID', 'closeOutstandingMinor exceeds outstanding amount', 400, {
            closeOutstandingMinor,
            outstandingMinor,
          });
        }

        const now = toIso(new Date());
        const patched = expensesRepo(tx).updateReimbursement({
          id: expense.id,
          reimbursementStatus: expense.reimbursementStatus,
          myShareMinor: expense.myShareMinor,
          closedOutstandingMinor: closeOutstandingMinor,
          counterpartyType: expense.counterpartyType,
          reimbursementGroupId: expense.reimbursementGroupId,
          reimbursementClosedAt: now,
          reimbursementClosedReason: input.reason?.trim() || null,
          updatedAt: now,
        }).expense;

        if (!patched) {
          throw new AppError('EXPENSE_NOT_FOUND', `Expense ${expense.id} does not exist`, 404);
        }

        updatedExpense = enrichExpense(tx, syncStoredReimbursementStatus(tx, expense.id));
      });

      await audit.writeAudit(
        'reimbursement.close',
        { expenseOutId, closeOutstandingMinor: input.closeOutstandingMinor, reason: input.reason ?? null },
        context,
      );

      if (!updatedExpense) {
        throw new AppError('INTERNAL_ERROR', 'Failed to close reimbursement', 500);
      }
      return updatedExpense;
    },

    async reopen(expenseOutId: string, context: ActorContext = DEFAULT_ACTOR) {
      let updatedExpense: ExpenseDto | null = null;

      withTransaction(runtime.db, (tx) => {
        const expense = getExpenseOrThrow(tx, expenseOutId);
        assertOutboundReimbursable(expense);

        const now = toIso(new Date());
        const patched = expensesRepo(tx).updateReimbursement({
          id: expense.id,
          reimbursementStatus: expense.reimbursementStatus,
          myShareMinor: expense.myShareMinor,
          closedOutstandingMinor: null,
          counterpartyType: expense.counterpartyType,
          reimbursementGroupId: expense.reimbursementGroupId,
          reimbursementClosedAt: null,
          reimbursementClosedReason: null,
          updatedAt: now,
        }).expense;

        if (!patched) {
          throw new AppError('EXPENSE_NOT_FOUND', `Expense ${expense.id} does not exist`, 404);
        }

        updatedExpense = enrichExpense(tx, syncStoredReimbursementStatus(tx, expense.id));
      });

      await audit.writeAudit('reimbursement.reopen', { expenseOutId }, context);
      if (!updatedExpense) {
        throw new AppError('INTERNAL_ERROR', 'Failed to reopen reimbursement', 500);
      }
      return updatedExpense;
    },

    async autoMatch(input: AutoMatchReimbursementsInput = {}, context: ActorContext = DEFAULT_ACTOR) {
      const from = input.from ? assertDate(input.from, 'from') : null;
      const to = input.to ? assertDate(input.to, 'to') : null;

      const summary: AutoMatchReimbursementsSummary = {
        matched: 0,
        linksCreated: 0,
        scannedOutflows: 0,
        scannedInflows: 0,
        from,
        to,
      };

      withTransaction(runtime.db, (tx) => {
        const allExpenses = expensesRepo(tx).list({
          from: from ?? undefined,
          to: to ?? undefined,
          limit: 10_000,
        }).expenses;

        const categoriesById = new Map(categoriesRepo(tx).list({}).categories.map((item) => [item.id, item] as const));

        const reimbursableOutflows = allExpenses
          .filter((expense) => expense.kind === 'expense')
          .filter((expense) => expense.reimbursementStatus !== 'none' || expense.myShareMinor !== null)
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

        const inboundCandidates = allExpenses
          .filter((expense) => expense.kind === 'income' || expense.kind === 'transfer_external')
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

        summary.scannedOutflows = reimbursableOutflows.length;
        summary.scannedInflows = inboundCandidates.length;

        const rules = categoryRulesRepo(tx)
          .listByExpenseCategoryIds({
            expenseCategoryIds: [...new Set(reimbursableOutflows.map((expense) => expense.categoryId))],
            enabledOnly: true,
          })
          .rules;

        const inboundRuleIdsByExpenseCategoryId = new Map<string, Set<string>>();
        for (const rule of rules) {
          const set = inboundRuleIdsByExpenseCategoryId.get(rule.expenseCategoryId) ?? new Set<string>();
          set.add(rule.inboundCategoryId);
          inboundRuleIdsByExpenseCategoryId.set(rule.expenseCategoryId, set);
        }

        const outRecoveredById = new Map<string, number>(
          reimbursementsRepo(tx)
            .sumRecoveredByExpenseOutIds({
              expenseOutIds: reimbursableOutflows.map((expense) => expense.id),
            })
            .rows.map((row) => [row.expenseOutId, row.totalMinor] as const),
        );

        const inAllocatedById = new Map<string, number>(
          reimbursementsRepo(tx)
            .sumAllocatedByExpenseInIds({
              expenseInIds: inboundCandidates.map((expense) => expense.id),
            })
            .rows.map((row) => [row.expenseInId, row.totalMinor] as const),
        );

        for (const outExpense of reimbursableOutflows) {
          const allowedInboundCategoryIds = inboundRuleIdsByExpenseCategoryId.get(outExpense.categoryId);
          if (!allowedInboundCategoryIds || allowedInboundCategoryIds.size === 0) {
            continue;
          }

          const outCategory = categoriesById.get(outExpense.categoryId);
          const recoveryWindowDays = Math.max(outCategory?.defaultRecoveryWindowDays ?? 14, 0);
          const outOccurredTs = new Date(outExpense.occurredAt).getTime();
          const windowEndTs = outOccurredTs + recoveryWindowDays * 24 * 60 * 60 * 1000;

          const recoverableMinor = computeRecoverableMinor(outExpense);
          const writtenOffMinor = Math.max(outExpense.closedOutstandingMinor ?? 0, 0);
          let remainingOutstandingMinor = Math.max(
            recoverableMinor - (outRecoveredById.get(outExpense.id) ?? 0) - writtenOffMinor,
            0,
          );

          if (remainingOutstandingMinor <= 0) {
            continue;
          }

          let matchedThisOutflow = false;

          for (const inExpense of inboundCandidates) {
            if (remainingOutstandingMinor <= 0) {
              break;
            }

            if (!allowedInboundCategoryIds.has(inExpense.categoryId)) {
              continue;
            }

            if (inExpense.money.currency !== outExpense.money.currency) {
              continue;
            }

            const inboundTs = new Date(inExpense.occurredAt).getTime();
            if (Number.isFinite(outOccurredTs) && Number.isFinite(inboundTs)) {
              if (inboundTs < outOccurredTs || inboundTs > windowEndTs) {
                continue;
              }
            }

            const inboundAllocatedMinor = inAllocatedById.get(inExpense.id) ?? 0;
            const inboundAvailableMinor = Math.max(inExpense.money.amountMinor - inboundAllocatedMinor, 0);
            if (inboundAvailableMinor <= 0) {
              continue;
            }

            const allocateMinor = Math.min(remainingOutstandingMinor, inboundAvailableMinor);
            if (allocateMinor <= 0) {
              continue;
            }

            const now = toIso(new Date());
            reimbursementsRepo(tx).create({
              id: crypto.randomUUID(),
              expenseOutId: outExpense.id,
              expenseInId: inExpense.id,
              amountMinor: allocateMinor,
              idempotencyKey: null,
              createdAt: now,
              updatedAt: now,
            });

            outRecoveredById.set(outExpense.id, (outRecoveredById.get(outExpense.id) ?? 0) + allocateMinor);
            inAllocatedById.set(inExpense.id, inboundAllocatedMinor + allocateMinor);
            remainingOutstandingMinor -= allocateMinor;
            summary.linksCreated += 1;
            if (!matchedThisOutflow) {
              summary.matched += 1;
              matchedThisOutflow = true;
            }
          }

          if (matchedThisOutflow) {
            syncStoredReimbursementStatus(tx, outExpense.id);
          }
        }
      });

      await audit.writeAudit('reimbursement.auto_match', summary, context);
      return summary;
    },
  };
};
