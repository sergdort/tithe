export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiFail {
  ok: false;
  error: ApiError;
}

export type ApiEnvelope<T> = ApiOk<T> | ApiFail;

export interface Money {
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number;
  fxRate?: number;
}

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string;
  color: string;
  isSystem: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  occurredAt: string;
  postedAt: string | null;
  money: Money;
  categoryId: string;
  source: 'manual' | 'monzo_import' | 'commitment';
  merchantName: string | null;
  note: string | null;
  externalRef: string | null;
  commitmentInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringCommitment {
  id: string;
  name: string;
  rrule: string;
  startDate: string;
  defaultMoney: Money;
  categoryId: string;
  graceDays: number;
  active: boolean;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentInstance {
  id: string;
  commitmentId: string;
  dueAt: string;
  expectedMoney: Money;
  status: 'pending' | 'paid' | 'overdue' | 'skipped';
  expenseId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface TrendPoint {
  month: string;
  spendMinor: number;
  spendBaseMinor: number;
  txCount: number;
}
