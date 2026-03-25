import { AppError } from '../errors.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';

export const assertIncomeSource = (
  expense: Pick<ExpenseDto, 'id' | 'kind'>,
): void => {
  if (expense.kind !== 'income') {
    throw new AppError(
      'FUNDING_LINK_INVALID_SOURCE',
      'Funding link source must be an income transaction',
      400,
      { incomeExpenseId: expense.id, kind: expense.kind },
    );
  }
};

export const assertTransferTarget = (
  expense: Pick<ExpenseDto, 'id' | 'kind' | 'transferDirection'>,
): void => {
  const isExternalTransferIn =
    expense.kind === 'transfer_external' && expense.transferDirection === 'in';
  const isIncome = expense.kind === 'income';

  if (!isExternalTransferIn && !isIncome) {
    throw new AppError(
      'FUNDING_LINK_INVALID_TARGET',
      'Funding link target must be an income or external transfer-in transaction',
      400,
      {
        transferExpenseId: expense.id,
        kind: expense.kind,
        transferDirection: expense.transferDirection,
      },
    );
  }
};

export const validateFundingLinkCurrency = (
  incomeExpense: Pick<ExpenseDto, 'id' | 'money'>,
  transferExpense: Pick<ExpenseDto, 'id' | 'money'>,
): void => {
  if (incomeExpense.money.currency !== transferExpense.money.currency) {
    throw new AppError(
      'FUNDING_LINK_CURRENCY_MISMATCH',
      'Currencies must match to create a funding link',
      400,
      {
        incomeExpenseId: incomeExpense.id,
        transferExpenseId: transferExpense.id,
        incomeCurrency: incomeExpense.money.currency,
        transferCurrency: transferExpense.money.currency,
      },
    );
  }
};

export const validateFundingLinkAmounts = ({
  amountMinor,
  incomeUnallocatedMinor,
  transferUnfundedMinor,
  incomeExpenseId,
  transferExpenseId,
}: {
  amountMinor: number;
  incomeUnallocatedMinor: number;
  transferUnfundedMinor: number;
  incomeExpenseId: string;
  transferExpenseId: string;
}): void => {
  if (incomeUnallocatedMinor <= 0) {
    throw new AppError(
      'FUNDING_LINK_EXCEEDS_INCOME',
      'No unallocated income amount remains',
      400,
      { incomeExpenseId },
    );
  }

  if (amountMinor > incomeUnallocatedMinor) {
    throw new AppError(
      'FUNDING_LINK_EXCEEDS_INCOME',
      'Link amount exceeds unallocated income amount',
      400,
      { amountMinor, incomeUnallocatedMinor, incomeExpenseId },
    );
  }

  if (transferUnfundedMinor <= 0) {
    throw new AppError(
      'FUNDING_LINK_EXCEEDS_TRANSFER',
      'No unfunded transfer amount remains',
      400,
      { transferExpenseId },
    );
  }

  if (amountMinor > transferUnfundedMinor) {
    throw new AppError(
      'FUNDING_LINK_EXCEEDS_TRANSFER',
      'Link amount exceeds unfunded transfer amount',
      400,
      { amountMinor, transferUnfundedMinor, transferExpenseId },
    );
  }
};
