import type {
  ApiEnvelope,
  Category,
  CommitmentInstance,
  Expense,
  MonthlyLedger,
  MonzoConnectStart,
  MonzoStatus,
  MonzoSyncSummary,
  ReimbursementCategoryRule,
  ReimbursementLink,
  RecurringCommitment,
  TrendPoint,
} from './types.js';

const baseUrl = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/v1';
const requestTimeoutMs = 10_000;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const payload = (await response.json()) as ApiEnvelope<T>;

    if (!payload.ok) {
      throw new Error(payload.error.message);
    }

    return payload.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`API request timed out after ${requestTimeoutMs}ms.`);
    }

    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }
};

export const api = {
  categories: {
    list: () => request<Category[]>('/categories'),
    create: (body: {
      name: string;
      kind: 'expense' | 'income' | 'transfer';
      icon?: string;
      color?: string;
      reimbursementMode?: 'none' | 'optional' | 'always';
      defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
      defaultRecoveryWindowDays?: number | null;
      defaultMyShareMode?: 'fixed' | 'percent' | null;
      defaultMyShareValue?: number | null;
    }) =>
      request<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      body: {
        name?: string;
        reimbursementMode?: 'none' | 'optional' | 'always';
        defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
        defaultRecoveryWindowDays?: number | null;
      },
    ) =>
      request<Category>(`/categories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  expenses: {
    list: () => request<Expense[]>('/expenses?limit=100'),
    create: (body: {
      occurredAt: string;
      postedAt?: string | null;
      amountMinor: number;
      currency: string;
      categoryId: string;
      source?: 'local' | 'monzo' | 'commitment';
      transferDirection?: 'in' | 'out' | null;
      kind?: 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
      reimbursable?: boolean;
      myShareMinor?: number | null;
      counterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
      reimbursementGroupId?: string | null;
      merchantName?: string;
      note?: string;
      providerTransactionId?: string | null;
      commitmentInstanceId?: string | null;
    }) =>
      request<Expense>('/expenses', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  commitments: {
    list: () => request<RecurringCommitment[]>('/commitments'),
    runDue: (upTo?: string) =>
      request<{ created: number; upTo: string }>('/commitments/run-due', {
        method: 'POST',
        body: JSON.stringify(upTo ? { upTo } : {}),
      }),
    instances: (status?: string) =>
      request<CommitmentInstance[]>(
        `/commitment-instances${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    create: (body: {
      name: string;
      rrule: string;
      startDate: string;
      defaultAmountMinor: number;
      currency: string;
      categoryId: string;
      graceDays?: number;
    }) =>
      request<RecurringCommitment>('/commitments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  reports: {
    trends: () => request<TrendPoint[]>('/reports/trends?months=6'),
    monthlyLedger: (input: { from: string; to: string }) =>
      request<MonthlyLedger>(
        `/reports/monthly-ledger?from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}`,
      ),
    categoryBreakdown: () =>
      request<
        Array<{ categoryId: string; categoryName: string; totalMinor: number; txCount: number }>
      >('/reports/category-breakdown'),
    commitmentForecast: () =>
      request<
        Array<{
          id: string;
          commitmentId: string;
          commitmentName: string;
          dueAt: string;
          expectedAmountMinor: number;
          currency: string;
          status: string;
        }>
      >('/reports/commitment-forecast?days=30'),
  },
  reimbursements: {
    listCategoryRules: () => request<ReimbursementCategoryRule[]>('/reimbursements/category-rules'),
    createCategoryRule: (body: {
      expenseCategoryId: string;
      inboundCategoryId: string;
      enabled?: boolean;
    }) =>
      request<ReimbursementCategoryRule>('/reimbursements/category-rules', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteCategoryRule: async (id: string) => {
      const dryRun = await request<{ operationId: string }>(
        `/reimbursements/category-rules/${encodeURIComponent(id)}?dryRun=true`,
        { method: 'DELETE' },
      );
      return request<{ deleted: boolean; id: string }>(
        `/reimbursements/category-rules/${encodeURIComponent(id)}?approveOperationId=${encodeURIComponent(dryRun.operationId)}`,
        { method: 'DELETE' },
      );
    },
    link: (body: {
      expenseOutId: string;
      expenseInId: string;
      amountMinor: number;
      idempotencyKey?: string | null;
    }) =>
      request<ReimbursementLink>('/reimbursements/link', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    close: (expenseOutId: string, body?: { closeOutstandingMinor?: number; reason?: string | null }) =>
      request<Expense>(`/reimbursements/${encodeURIComponent(expenseOutId)}/close`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    reopen: (expenseOutId: string) =>
      request<Expense>(`/reimbursements/${encodeURIComponent(expenseOutId)}/reopen`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    autoMatch: (params?: { from?: string; to?: string }) => {
      const search = new URLSearchParams();
      if (params?.from) search.set('from', params.from);
      if (params?.to) search.set('to', params.to);
      const suffix = search.size > 0 ? `?${search.toString()}` : '';
      return request<{ matched: number; linksCreated: number }>(`/reimbursements/auto-match${suffix}`, {
        method: 'POST',
      });
    },
  },
  monzo: {
    connectStart: () =>
      request<MonzoConnectStart>('/integrations/monzo/connect/start', {
        method: 'POST',
      }),
    sync: (body?: { from?: string; to?: string; overrideExisting?: boolean }) =>
      request<MonzoSyncSummary>('/integrations/monzo/sync', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    syncNow: () =>
      request<MonzoSyncSummary>('/integrations/monzo/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    status: () => request<MonzoStatus>('/integrations/monzo/status'),
  },
};
