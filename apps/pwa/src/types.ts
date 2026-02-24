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

export type TransferDirection = 'in' | 'out';

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string;
  color: string;
  isSystem: boolean;
  reimbursementMode?: 'none' | 'optional' | 'always';
  defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays?: number | null;
  defaultMyShareMode?: 'fixed' | 'percent' | null;
  defaultMyShareValue?: number | null;
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
  source: 'local' | 'monzo' | 'commitment';
  kind?: 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
  transferDirection: TransferDirection | null;
  reimbursementStatus?: 'none' | 'expected' | 'partial' | 'settled' | 'written_off';
  myShareMinor?: number | null;
  closedOutstandingMinor?: number | null;
  counterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
  reimbursementGroupId?: string | null;
  reimbursementClosedAt?: string | null;
  reimbursementClosedReason?: string | null;
  recoverableMinor?: number;
  recoveredMinor?: number;
  outstandingMinor?: number;
  merchantName: string | null;
  merchantLogoUrl: string | null;
  merchantEmoji: string | null;
  note: string | null;
  providerTransactionId: string | null;
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

export interface MonthlyLedgerCategoryRow {
  categoryId: string;
  categoryName: string;
  totalMinor: number;
  txCount: number;
}

export interface MonthlyLedgerTransferRow extends MonthlyLedgerCategoryRow {
  direction: TransferDirection;
}

export interface MonthlyLedger {
  month: string;
  range: {
    from: string;
    to: string;
  };
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    transferInMinor: number;
    transferOutMinor: number;
    operatingSurplusMinor: number;
    netCashMovementMinor: number;
    txCount: number;
  };
  cashFlow?: {
    cashInMinor: number;
    cashOutMinor: number;
    internalTransferInMinor: number;
    internalTransferOutMinor: number;
    externalTransferInMinor: number;
    externalTransferOutMinor: number;
    netFlowMinor: number;
  };
  spending?: {
    grossSpendMinor: number;
    recoveredMinor: number;
    writtenOffMinor: number;
    netPersonalSpendMinor: number;
  };
  reimbursements?: {
    recoverableMinor: number;
    recoveredMinor: number;
    outstandingMinor: number;
    partialCount: number;
    settledCount: number;
  };
  sections: {
    income: MonthlyLedgerCategoryRow[];
    expense: MonthlyLedgerCategoryRow[];
    transfer: MonthlyLedgerTransferRow[];
    transferInternal?: MonthlyLedgerTransferRow[];
    transferExternal?: MonthlyLedgerTransferRow[];
  };
}

export interface ReimbursementLink {
  id: string;
  expenseOutId: string;
  expenseInId: string;
  amountMinor: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReimbursementCategoryRule {
  id: string;
  expenseCategoryId: string;
  inboundCategoryId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonzoConnectStart {
  status: string;
  message: string;
  authUrl: string;
  stateExpiresAt: string;
}

export interface MonzoSyncSummary {
  status: string;
  message: string;
  imported: number;
  updated: number;
  skipped: number;
  accountId: string;
  from: string;
  to: string;
  cursor: string | null;
}

export interface MonzoStatus {
  status: string;
  mode: string;
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastCursor: string | null;
  mappingCount: number;
  lastError: string | null;
}
