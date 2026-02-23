export const homeQueryKeys = {
  monthlyLedger: (from: string, to: string) => ['report', 'monthlyLedger', from, to] as const,
  monthlyLedgerRoot: () => ['report', 'monthlyLedger'] as const,
  pendingCommitmentInstances: () => ['commitments', 'instances', 'pending'] as const,
  commitments: () => ['commitments'] as const,
  categories: () => ['categories'] as const,
  monzoStatus: () => ['monzo', 'status'] as const,
  expenses: () => ['expenses'] as const,
};
