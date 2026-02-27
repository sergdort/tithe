/**
 * Pure business logic functions extracted from expenses.service.ts for testability.
 *
 * These functions contain no I/O or database access — they are purely computational.
 */

import { AppError } from '../errors.js';
import type { CategoryDto } from '../repositories/categories.repository.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import type { ExpenseKind, ReimbursementStatus } from '../types.js';

// ── Normalisation ──────────────────────────────────────────────────────────

type TransferDirection = 'in' | 'out' | null;

export const normalizeTransferDirection = (
  value: 'in' | 'out' | null | undefined,
): TransferDirection => {
  if (value === 'in' || value === 'out') return value;
  return null;
};

export const normalizeExpenseKind = (value: ExpenseKind | null | undefined): ExpenseKind | null => {
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

export const normalizeCounterpartyType = (
  value: 'self' | 'partner' | 'team' | 'other' | null | undefined,
): 'self' | 'partner' | 'team' | 'other' | null => {
  if (value === 'self' || value === 'partner' || value === 'team' || value === 'other')
    return value;
  return null;
};

// ── Validation ─────────────────────────────────────────────────────────────

export const assertPositiveAmountMinor = (value: number, field = 'amountMinor'): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer`, 400, {
      field,
      value,
    });
  }
  return value;
};

export const isTransferKind = (kind: ExpenseKind): boolean =>
  kind === 'transfer_internal' || kind === 'transfer_external';

// ── Kind derivation ────────────────────────────────────────────────────────

export const deriveExpenseKind = ({
  category,
  requestedKind,
  transferDirection,
}: {
  category: Pick<CategoryDto, 'id' | 'kind'>;
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

    if (!requestedKind) return 'transfer_external';

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

// ── Reimbursement logic ────────────────────────────────────────────────────

export const computeRecoverableMinor = (
  expense: Pick<ExpenseDto, 'kind' | 'reimbursementStatus' | 'money' | 'myShareMinor'>,
): number => {
  if (expense.kind !== 'expense' || expense.reimbursementStatus === 'none') return 0;
  const myShareMinor = expense.myShareMinor ?? 0;
  return Math.max(expense.money.amountMinor - myShareMinor, 0);
};

export const deriveReimbursementStatus = ({
  expense,
  recoveredMinor,
}: {
  expense: Pick<
    ExpenseDto,
    'kind' | 'reimbursementStatus' | 'money' | 'myShareMinor' | 'closedOutstandingMinor'
  >;
  recoveredMinor: number;
}): ReimbursementStatus => {
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

export const enrichExpensesWithReimbursements = ({
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

// ── Reimbursable defaults ──────────────────────────────────────────────────

export const resolveReimbursableDefaults = ({
  category,
  kind,
  requestedReimbursable,
  existing,
}: {
  category: Pick<CategoryDto, 'id' | 'kind' | 'reimbursementMode'>;
  kind: ExpenseKind;
  requestedReimbursable: boolean | undefined;
  existing?: Pick<ExpenseDto, 'reimbursementStatus' | 'myShareMinor'>;
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
        { categoryId: category.id },
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

  if (requestedReimbursable !== undefined) return requestedReimbursable;
  if (existing) return existing.reimbursementStatus !== 'none' || existing.myShareMinor !== null;
  return true;
};

// ── My share validation ────────────────────────────────────────────────────

export const validateAndResolveMyShareMinor = ({
  amountMinor,
  reimbursable,
  requestedMyShareMinor,
  existing,
}: {
  amountMinor: number;
  reimbursable: boolean;
  requestedMyShareMinor: number | null | undefined;
  existing?: Pick<ExpenseDto, 'myShareMinor'>;
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

  if (resolved === null) return 0;

  if (!Number.isInteger(resolved) || resolved < 0 || resolved > amountMinor) {
    throw new AppError(
      'VALIDATION_ERROR',
      'myShareMinor must be an integer between 0 and amountMinor',
      400,
      { myShareMinor: resolved, amountMinor },
    );
  }

  return resolved;
};
