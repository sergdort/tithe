import type {
  Category,
  CommitmentInstance,
  RecurringCommitment,
  TransferDirection,
} from '../../types.js';

export type TransactionKind = 'income' | 'expense' | 'transfer';
export type HomeTransferDirection = TransferDirection;
export type TransferSemanticKind = 'transfer_internal' | 'transfer_external';

export interface CategoriesByKind {
  expense: Category[];
  income: Category[];
  transfer: Category[];
}

export interface PayDialogSelection {
  instance: CommitmentInstance;
  commitment: RecurringCommitment | null;
  category: Category | null;
}

export interface UpcomingCommitmentPreviewRow {
  id: string;
  commitmentName: string;
  dueAt: string;
  expectedAmountMinor: number;
  currency: string;
  categoryLine: string;
}
