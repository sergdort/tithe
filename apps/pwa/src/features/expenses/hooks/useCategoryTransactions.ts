import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '../../../api.js';

interface UseCategoryTransactionsInput {
  categoryId?: string;
  from: string;
  to: string;
  transferDirection: 'in' | 'out' | null;
  seededCategoryName: string;
}

export const useCategoryTransactions = ({
  categoryId,
  from,
  to,
  transferDirection,
  seededCategoryName,
}: UseCategoryTransactionsInput) => {
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const expensesQuery = useQuery({
    queryKey: ['expenses', 'category-detail', categoryId, from, to],
    queryFn: () => api.expenses.list({ categoryId, from, to, limit: 1000 }),
    enabled: Boolean(categoryId),
  });

  const categories = categoriesQuery.data ?? [];
  const categoryName =
    categories.find((item) => item.id === categoryId)?.name ?? seededCategoryName;
  const expenses = useMemo(() => {
    const items = expensesQuery.data ?? [];
    if (!transferDirection) {
      return items;
    }

    return items.filter((item) => item.transferDirection === transferDirection);
  }, [expensesQuery.data, transferDirection]);

  return {
    categories,
    categoryName,
    expenses,
    hasCategoryMetadataError: categoriesQuery.isError,
    isError: expensesQuery.isError,
    isLoading: expensesQuery.isLoading || categoriesQuery.isLoading,
  };
};
