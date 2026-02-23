export interface ActorContext {
  actor: string;
  channel: 'api' | 'cli' | 'system';
}

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
  merchantName?: string | null;
  note?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon?: string;
  color?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  kind?: 'expense' | 'income' | 'transfer';
  icon?: string;
  color?: string;
  archivedAt?: string | null;
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
