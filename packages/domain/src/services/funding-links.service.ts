import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import type { FundingLinkDto } from '../repositories/funding-links.repository.js';
import { SqliteFundingLinksRepository } from '../repositories/funding-links.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type { ActorContext } from '../types.js';
import {
  assertIncomeSource,
  assertTransferTarget,
  validateFundingLinkAmounts,
  validateFundingLinkCurrency,
} from './funding-links-logic.js';
import { assertPositiveMinor } from './reimbursements-logic.js';
import type { ApprovalService, ApprovalToken } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, toIso } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

interface FundingLinksServiceDeps {
  runtime: DomainDbRuntime;
  approvals: ApprovalService;
  audit: AuditService;
}

export interface CreateFundingLinkInput {
  incomeExpenseId: string;
  transferExpenseId: string;
  amountMinor: number;
  idempotencyKey?: string | null;
}

export interface FundingLinksService {
  link: (input: CreateFundingLinkInput, context?: ActorContext) => Promise<FundingLinkDto>;
  createUnlinkApproval: (id: string) => Promise<ApprovalToken>;
  unlink: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
  listByTransferExpenseId: (transferExpenseId: string) => Promise<FundingLinkDto[]>;
  listByIncomeExpenseId: (incomeExpenseId: string) => Promise<FundingLinkDto[]>;
}

export const createFundingLinksService = ({
  runtime,
  approvals,
  audit,
}: FundingLinksServiceDeps): FundingLinksService => {
  const expensesRepo = (db: RepositoryDb = runtime.db) => new SqliteExpensesRepository(db);
  const fundingLinksRepo = (db: RepositoryDb = runtime.db) => new SqliteFundingLinksRepository(db);

  const getExpenseOrThrow = (db: RepositoryDb, id: string): ExpenseDto => {
    const expense = expensesRepo(db).findById({ id }).expense;
    if (!expense) {
      throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
    }
    return expense;
  };

  return {
    async link(input: CreateFundingLinkInput, context: ActorContext = DEFAULT_ACTOR) {
      const amountMinor = assertPositiveMinor(input.amountMinor, 'amountMinor');
      const idempotencyKey = input.idempotencyKey?.trim() || null;

      if (idempotencyKey) {
        const existingByKey = fundingLinksRepo().findByIdempotencyKey({ idempotencyKey }).link;
        if (existingByKey) {
          if (
            existingByKey.incomeExpenseId === input.incomeExpenseId &&
            existingByKey.transferExpenseId === input.transferExpenseId &&
            existingByKey.amountMinor === amountMinor
          ) {
            return existingByKey;
          }

          throw new AppError(
            'FUNDING_LINK_IDEMPOTENCY_KEY_CONFLICT',
            'idempotencyKey is already used for a different funding link payload',
            409,
            { idempotencyKey },
          );
        }
      }

      let created: FundingLinkDto | null = null;
      withTransaction(runtime.db, (tx) => {
        const incomeExpense = getExpenseOrThrow(tx, input.incomeExpenseId);
        const transferExpense = getExpenseOrThrow(tx, input.transferExpenseId);

        if (incomeExpense.id === transferExpense.id) {
          throw new AppError(
            'FUNDING_LINK_INVALID_TARGET',
            'Cannot link a transaction to itself',
            400,
          );
        }

        assertIncomeSource(incomeExpense);
        assertTransferTarget(transferExpense);
        validateFundingLinkCurrency(incomeExpense, transferExpense);

        const incomeAllocatedMinor =
          fundingLinksRepo(tx).sumAllocatedByIncomeExpenseIds({
            incomeExpenseIds: [incomeExpense.id],
          }).rows[0]?.totalMinor ?? 0;
        const transferFundedMinor =
          fundingLinksRepo(tx).sumFundedByTransferExpenseIds({
            transferExpenseIds: [transferExpense.id],
          }).rows[0]?.totalMinor ?? 0;

        const incomeUnallocatedMinor = Math.max(
          incomeExpense.money.amountMinor - incomeAllocatedMinor,
          0,
        );
        const transferUnfundedMinor = Math.max(
          transferExpense.money.amountMinor - transferFundedMinor,
          0,
        );

        validateFundingLinkAmounts({
          amountMinor,
          incomeUnallocatedMinor,
          transferUnfundedMinor,
          incomeExpenseId: incomeExpense.id,
          transferExpenseId: transferExpense.id,
        });

        const now = toIso(new Date());
        created = fundingLinksRepo(tx).create({
          id: crypto.randomUUID(),
          incomeExpenseId: incomeExpense.id,
          transferExpenseId: transferExpense.id,
          amountMinor,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        }).link;
      });

      if (!created) {
        throw new AppError('INTERNAL_ERROR', 'Failed to create funding link', 500);
      }

      await audit.writeAudit(
        'funding.link',
        { input: { ...input, amountMinor, idempotencyKey } },
        context,
      );
      return created;
    },

    async createUnlinkApproval(id: string) {
      return approvals.createApproval('funding_link.delete', { id });
    },

    async unlink(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
      await approvals.consumeApproval('funding_link.delete', approveOperationId, { id });

      withTransaction(runtime.db, (tx) => {
        const link = fundingLinksRepo(tx).findById({ id }).link;
        if (!link) {
          throw new AppError('FUNDING_LINK_NOT_FOUND', `Funding link ${id} does not exist`, 404);
        }

        fundingLinksRepo(tx).deleteById({ id });
      });

      await audit.writeAudit('funding.unlink', { id }, context);
    },

    async listByTransferExpenseId(transferExpenseId: string) {
      return fundingLinksRepo().listByTransferExpenseIds({
        transferExpenseIds: [transferExpenseId],
      }).links;
    },

    async listByIncomeExpenseId(incomeExpenseId: string) {
      return fundingLinksRepo().listByIncomeExpenseIds({
        incomeExpenseIds: [incomeExpenseId],
      }).links;
    },
  };
};
