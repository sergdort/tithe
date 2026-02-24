export interface ActorContext {
  actor: string;
  channel: 'api' | 'cli' | 'system';
}

export type ExpenseKind = 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
export type ReimbursementStatus = 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
export type CounterpartyType = 'self' | 'partner' | 'team' | 'other';
export type ReimbursementMode = 'none' | 'optional' | 'always';

export interface ListExpensesInput {
  from?: string;
  to?: string;
  categoryId?: string;
  limit?: number;
}

export interface CreateExpenseInput {
  occurredAt: string;
  postedAt?: string | null;
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId: string;
  source?: 'local' | 'monzo' | 'commitment';
  transferDirection?: 'in' | 'out' | null;
  kind?: ExpenseKind;
  reimbursable?: boolean;
  myShareMinor?: number | null;
  counterpartyType?: CounterpartyType | null;
  reimbursementGroupId?: string | null;
  merchantName?: string | null;
  note?: string | null;
  providerTransactionId?: string | null;
  commitmentInstanceId?: string | null;
}

export interface UpdateExpenseInput {
  occurredAt?: string;
  postedAt?: string | null;
  amountMinor?: number;
  currency?: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId?: string;
  transferDirection?: 'in' | 'out' | null;
  kind?: ExpenseKind;
  reimbursable?: boolean;
  myShareMinor?: number | null;
  counterpartyType?: CounterpartyType | null;
  reimbursementGroupId?: string | null;
  merchantName?: string | null;
  note?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon?: string;
  color?: string;
  reimbursementMode?: ReimbursementMode;
  defaultCounterpartyType?: CounterpartyType | null;
  defaultRecoveryWindowDays?: number | null;
  defaultMyShareMode?: 'fixed' | 'percent' | null;
  defaultMyShareValue?: number | null;
}

export interface UpdateCategoryInput {
  name?: string;
  kind?: 'expense' | 'income' | 'transfer';
  icon?: string;
  color?: string;
  archivedAt?: string | null;
  reimbursementMode?: ReimbursementMode;
  defaultCounterpartyType?: CounterpartyType | null;
  defaultRecoveryWindowDays?: number | null;
  defaultMyShareMode?: 'fixed' | 'percent' | null;
  defaultMyShareValue?: number | null;
}

export interface CreateCommitmentInput {
  name: string;
  rrule: string;
  startDate: string;
  defaultAmountMinor: number;
  currency: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId: string;
  graceDays?: number;
  active?: boolean;
}

export interface UpdateCommitmentInput {
  name?: string;
  rrule?: string;
  startDate?: string;
  defaultAmountMinor?: number;
  currency?: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId?: string;
  graceDays?: number;
  active?: boolean;
}
