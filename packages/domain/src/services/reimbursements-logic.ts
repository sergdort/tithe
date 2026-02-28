/**
 * Pure business logic functions extracted from reimbursements.service.ts for testability.
 *
 * These functions contain no I/O or database access — they are purely computational.
 */

import { AppError } from '../errors.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import type { ReimbursementStatus } from '../types.js';

// ── Validation ─────────────────────────────────────────────────────────────

export const assertPositiveMinor = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer`, 400, {
      field,
      value,
    });
  }
  return value;
};

// ── Reimbursement math ─────────────────────────────────────────────────────

export const computeRecoverableMinor = (
  expense: Pick<ExpenseDto, 'kind' | 'reimbursementStatus' | 'money' | 'myShareMinor'>,
): number => {
  if (expense.kind !== 'expense' || expense.reimbursementStatus === 'none') return 0;
  return Math.max(expense.money.amountMinor - (expense.myShareMinor ?? 0), 0);
};

export const deriveReimbursementStatus = (
  expense: Pick<
    ExpenseDto,
    'kind' | 'reimbursementStatus' | 'money' | 'myShareMinor' | 'closedOutstandingMinor'
  >,
  recoveredMinor: number,
): ReimbursementStatus => {
  if (expense.kind !== 'expense') return 'none';

  const isReimbursable = expense.reimbursementStatus !== 'none' || expense.myShareMinor !== null;
  if (!isReimbursable) return 'none';

  const recoverableMinor = computeRecoverableMinor(expense);
  const writtenOffMinor = Math.max(expense.closedOutstandingMinor ?? 0, 0);
  const outstandingMinor = Math.max(recoverableMinor - recoveredMinor - writtenOffMinor, 0);

  if (writtenOffMinor > 0) return 'written_off';
  if (recoverableMinor === 0 || outstandingMinor === 0) return 'settled';
  if (recoveredMinor > 0) return 'partial';
  return 'expected';
};

// ── Link validation ────────────────────────────────────────────────────────

export const assertOutboundReimbursable = (
  expense: Pick<ExpenseDto, 'id' | 'kind' | 'reimbursementStatus' | 'myShareMinor'>,
): void => {
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

export const validateLinkTarget = (inExpense: Pick<ExpenseDto, 'id' | 'kind'>): void => {
  if (!(inExpense.kind === 'income' || inExpense.kind === 'transfer_external')) {
    throw new AppError(
      'REIMBURSEMENT_INVALID_LINK_TARGET',
      'Inbound reimbursement target must be income or external transfer',
      400,
      { expenseInId: inExpense.id, kind: inExpense.kind },
    );
  }
};

export const validateLinkCurrency = (
  outExpense: Pick<ExpenseDto, 'id' | 'money'>,
  inExpense: Pick<ExpenseDto, 'id' | 'money'>,
): void => {
  if (outExpense.money.currency !== inExpense.money.currency) {
    throw new AppError(
      'REIMBURSEMENT_CURRENCY_MISMATCH',
      'Currencies must match to create a reimbursement link',
      400,
      {
        expenseOutId: outExpense.id,
        expenseInId: inExpense.id,
        outCurrency: outExpense.money.currency,
        inCurrency: inExpense.money.currency,
      },
    );
  }
};

export const validateLinkAmounts = ({
  amountMinor,
  outstandingMinor,
  inboundAvailableMinor,
  expenseOutId,
  expenseInId,
}: {
  amountMinor: number;
  outstandingMinor: number;
  inboundAvailableMinor: number;
  expenseOutId: string;
  expenseInId: string;
}): void => {
  if (outstandingMinor <= 0) {
    throw new AppError(
      'REIMBURSEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
      'No outstanding reimbursable amount remains on outbound expense',
      400,
      { expenseOutId },
    );
  }

  if (amountMinor > outstandingMinor) {
    throw new AppError(
      'REIMBURSEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
      'Link amount exceeds outbound outstanding amount',
      400,
      { amountMinor, outstandingMinor, expenseOutId },
    );
  }

  if (amountMinor > inboundAvailableMinor) {
    throw new AppError(
      'REIMBURSEMENT_ALLOCATION_EXCEEDS_INBOUND_AVAILABLE',
      'Link amount exceeds inbound unallocated amount',
      400,
      { amountMinor, inboundAvailableMinor, expenseInId },
    );
  }
};

// ── Close validation ───────────────────────────────────────────────────────

export const validateCloseOutstandingMinor = (
  closeOutstandingMinor: number,
  outstandingMinor: number,
): void => {
  if (!Number.isInteger(closeOutstandingMinor) || closeOutstandingMinor < 0) {
    throw new AppError(
      'REIMBURSEMENT_CLOSE_INVALID',
      'closeOutstandingMinor must be a non-negative integer',
      400,
      { closeOutstandingMinor },
    );
  }

  if (closeOutstandingMinor === 0) {
    throw new AppError(
      'REIMBURSEMENT_CLOSE_INVALID',
      'closeOutstandingMinor must be greater than zero when outstanding remains',
      400,
      { outstandingMinor },
    );
  }

  if (closeOutstandingMinor > outstandingMinor) {
    throw new AppError(
      'REIMBURSEMENT_CLOSE_INVALID',
      'closeOutstandingMinor exceeds outstanding amount',
      400,
      { closeOutstandingMinor, outstandingMinor },
    );
  }
};

// ── Category rule validation ───────────────────────────────────────────────

export const assertExpenseCategoryKind = (category: { id: string; kind: string }): void => {
  if (category.kind !== 'expense') {
    throw new AppError(
      'REIMBURSEMENT_CATEGORY_RULE_INVALID_EXPENSE_CATEGORY',
      'Expense category rule source must be an expense category',
      400,
      { expenseCategoryId: category.id, kind: category.kind },
    );
  }
};

export const assertInboundCategoryKind = (category: { id: string; kind: string }): void => {
  if (!(category.kind === 'income' || category.kind === 'transfer')) {
    throw new AppError(
      'REIMBURSEMENT_CATEGORY_RULE_INVALID_INBOUND_CATEGORY',
      'Inbound category rule target must be an income or transfer category',
      400,
      { inboundCategoryId: category.id, kind: category.kind },
    );
  }
};

// ── Auto-match helpers ─────────────────────────────────────────────────────

export const isInRecoveryWindow = ({
  outOccurredAt,
  inOccurredAt,
  recoveryWindowDays,
}: {
  outOccurredAt: string;
  inOccurredAt: string;
  recoveryWindowDays: number;
}): boolean => {
  const outTs = new Date(outOccurredAt).getTime();
  const inTs = new Date(inOccurredAt).getTime();

  if (!Number.isFinite(outTs) || !Number.isFinite(inTs)) return true;

  const windowEndTs = outTs + recoveryWindowDays * 24 * 60 * 60 * 1000;
  return inTs >= outTs && inTs <= windowEndTs;
};

export const computeAutoMatchAllocation = ({
  remainingOutstandingMinor,
  inboundAvailableMinor,
}: {
  remainingOutstandingMinor: number;
  inboundAvailableMinor: number;
}): number => {
  if (inboundAvailableMinor <= 0 || remainingOutstandingMinor <= 0) return 0;
  return Math.min(remainingOutstandingMinor, inboundAvailableMinor);
};
