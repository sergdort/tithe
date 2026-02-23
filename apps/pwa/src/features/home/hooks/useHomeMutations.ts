import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api.js';
import { homeQueryKeys } from '../queries.js';

type CreateExpenseInput = Parameters<typeof api.expenses.create>[0];

export const useMonzoConnectStartMutation = () =>
  useMutation({
    mutationFn: () => api.monzo.connectStart(),
  });

type MonzoSyncMutationInput = Parameters<typeof api.monzo.sync>[0];

export const useMonzoSyncMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MonzoSyncMutationInput) => api.monzo.sync(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.monzoStatus() }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.expenses() }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.monthlyLedgerRoot() }),
      ]);
    },
  });
};

export const useCreateHomeTransactionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateExpenseInput) => api.expenses.create(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.monthlyLedgerRoot() }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.expenses() }),
      ]);
    },
  });
};

export const useMarkCommitmentPaidMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateExpenseInput) => api.expenses.create(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.pendingCommitmentInstances() }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.monthlyLedgerRoot() }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.expenses() }),
      ]);
    },
  });
};
