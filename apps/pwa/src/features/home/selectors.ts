import type { Category, CommitmentInstance, RecurringCommitment } from '../../types.js';
import type {
  CategoriesByKind,
  PayDialogSelection,
  UpcomingCommitmentPreviewRow,
} from './types.js';

export const sectionLabel = (kind: Category['kind']): string =>
  kind === 'expense' ? 'Expenses' : kind === 'income' ? 'Income' : 'Transfers';

export const groupCategoriesByKind = (categories: Category[]): CategoriesByKind => ({
  expense: categories.filter((item) => item.kind === 'expense'),
  income: categories.filter((item) => item.kind === 'income'),
  transfer: categories.filter((item) => item.kind === 'transfer'),
});

export const indexCategoriesById = (categories: Category[]): Map<string, Category> =>
  new Map(categories.map((item) => [item.id, item] as const));

export const indexCommitmentsById = (
  commitments: RecurringCommitment[],
): Map<string, RecurringCommitment> => new Map(commitments.map((item) => [item.id, item] as const));

export const selectPayDialogSelection = (input: {
  instanceId: string | null;
  dueInstances: CommitmentInstance[];
  commitmentsById: Map<string, RecurringCommitment>;
  categoriesById: Map<string, Category>;
}): PayDialogSelection | null => {
  const { instanceId, dueInstances, commitmentsById, categoriesById } = input;
  if (!instanceId) {
    return null;
  }

  const instance = dueInstances.find((item) => item.id === instanceId);
  if (!instance) {
    return null;
  }

  const commitment = commitmentsById.get(instance.commitmentId) ?? null;
  const category = commitment ? (categoriesById.get(commitment.categoryId) ?? null) : null;

  return { instance, commitment, category };
};

export const selectUpcomingCommitmentPreviewRows = (input: {
  dueInstances: CommitmentInstance[];
  commitmentsById: Map<string, RecurringCommitment>;
  categoriesById: Map<string, Category>;
  limit?: number;
}): UpcomingCommitmentPreviewRow[] => {
  const { dueInstances, commitmentsById, categoriesById, limit = 8 } = input;

  return dueInstances.slice(0, limit).map((instance) => {
    const commitment = commitmentsById.get(instance.commitmentId);
    const category = commitment ? categoriesById.get(commitment.categoryId) : undefined;

    return {
      id: instance.id,
      commitmentName: commitment?.name ?? 'Commitment',
      dueAt: instance.dueAt,
      expectedAmountMinor: instance.expectedMoney.amountMinor,
      currency: instance.expectedMoney.currency,
      categoryLine: category
        ? `${sectionLabel(category.kind)} • ${category.name}`
        : instance.status,
    };
  });
};
