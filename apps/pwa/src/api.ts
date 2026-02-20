import type {
  ApiEnvelope,
  Category,
  CommitmentInstance,
  Expense,
  RecurringCommitment,
  TrendPoint,
} from './types.js';

const baseUrl = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/v1';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.data;
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
      amountMinor: number;
      currency: string;
      categoryId: string;
      merchantName?: string;
      note?: string;
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
};
