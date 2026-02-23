import type {
  ApiEnvelope,
  Category,
  CommitmentInstance,
  Expense,
  MonthlyLedger,
  MonzoConnectStart,
  MonzoStatus,
  MonzoSyncSummary,
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
    }) =>
      request<Category>('/categories', {
        method: 'POST',
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
      source?: 'manual' | 'monzo_import' | 'commitment';
      transferDirection?: 'in' | 'out' | null;
      merchantName?: string;
      note?: string;
      externalRef?: string | null;
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
