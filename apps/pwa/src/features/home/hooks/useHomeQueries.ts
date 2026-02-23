import { useQuery } from '@tanstack/react-query';

import { api } from '../../../api.js';
import type { MonthWindow } from '../../../lib/date/month.js';
import { homeQueryKeys } from '../queries.js';

export const useHomeMonthlyLedgerQuery = (window: Pick<MonthWindow, 'from' | 'to'>) =>
  useQuery({
    queryKey: homeQueryKeys.monthlyLedger(window.from, window.to),
    queryFn: () => api.reports.monthlyLedger({ from: window.from, to: window.to }),
  });

export const useHomePendingCommitmentInstancesQuery = () =>
  useQuery({
    queryKey: homeQueryKeys.pendingCommitmentInstances(),
    queryFn: () => api.commitments.instances('pending'),
  });

export const useHomeCommitmentsQuery = () =>
  useQuery({
    queryKey: homeQueryKeys.commitments(),
    queryFn: () => api.commitments.list(),
  });

export const useHomeCategoriesQuery = () =>
  useQuery({
    queryKey: homeQueryKeys.categories(),
    queryFn: () => api.categories.list(),
  });

export const useHomeMonzoStatusQuery = () =>
  useQuery({
    queryKey: homeQueryKeys.monzoStatus(),
    queryFn: () => api.monzo.status(),
  });

export const useHomeCommitmentReferenceQueries = () => {
  const dueQuery = useHomePendingCommitmentInstancesQuery();
  const commitmentsQuery = useHomeCommitmentsQuery();
  const categoriesQuery = useHomeCategoriesQuery();

  return {
    dueQuery,
    commitmentsQuery,
    categoriesQuery,
  };
};
