import { localDateInputToIso } from '../../lib/date/date-input.js';
import type { PayDialogSelection, TransactionKind } from './types.js';

type CreateExpenseInput = Parameters<typeof import('../../api.js').api['expenses']['create']>[0];

const parsePositiveAmountMinor = (amountText: string): number => {
  const parsed = Number(amountText);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  return Math.round(parsed * 100);
};

const parseNonNegativeAmountMinor = (amountText: string): number => {
  const parsed = Number(amountText);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Amount must be zero or greater');
  }

  return Math.round(parsed * 100);
};

export const buildAddTransactionPayload = (input: {
  kind: TransactionKind;
  transferSemanticKind: 'transfer_internal' | 'transfer_external';
  categoryId: string;
  amountText: string;
  dateInput: string;
  description: string;
  note: string;
  transferDirection: 'in' | 'out';
  reimbursable: boolean;
  myShareText: string;
}): CreateExpenseInput => {
  if (!input.categoryId) {
    throw new Error('Please select a category');
  }

  return {
    occurredAt: localDateInputToIso(input.dateInput),
    amountMinor: parsePositiveAmountMinor(input.amountText),
    currency: 'GBP',
    categoryId: input.categoryId,
    source: 'local',
    kind: input.kind === 'transfer' ? input.transferSemanticKind : input.kind,
    transferDirection: input.kind === 'transfer' ? input.transferDirection : null,
    reimbursable: input.kind === 'expense' ? input.reimbursable : undefined,
    myShareMinor:
      input.kind === 'expense' && input.reimbursable
        ? parseNonNegativeAmountMinor(input.myShareText || '0')
        : undefined,
    merchantName: input.description.trim() || undefined,
    note: input.note.trim() || undefined,
  };
};

export const buildMarkCommitmentPaidPayload = (input: {
  selection: PayDialogSelection | null;
  amountText: string;
  dateInput: string;
  transferDirection: 'in' | 'out';
}): CreateExpenseInput => {
  const selection = input.selection;
  const instance = selection?.instance ?? null;
  if (!instance) {
    throw new Error('Commitment instance not found');
  }

  const commitment = selection?.commitment ?? null;
  if (!commitment) {
    throw new Error('Commitment not found');
  }

  const category = selection?.category ?? null;
  if (!category) {
    throw new Error('Commitment category not found');
  }

  return {
    occurredAt: localDateInputToIso(input.dateInput),
    amountMinor: parsePositiveAmountMinor(input.amountText),
    currency: instance.expectedMoney.currency,
    categoryId: commitment.categoryId,
    source: 'commitment',
    commitmentInstanceId: instance.id,
    transferDirection: category.kind === 'transfer' ? input.transferDirection : null,
    merchantName: commitment.name,
  };
};
