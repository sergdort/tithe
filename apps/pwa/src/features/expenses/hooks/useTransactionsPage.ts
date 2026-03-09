import { useQuery } from '@tanstack/react-query';

import { api } from '../../../api.js';

export const useTransactionsPage = () => {
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const expensesQuery = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.expenses.list(),
  });

  return {
    categories: categoriesQuery.data ?? [],
    emptyLabel: 'No transactions logged yet.',
    expenses: expensesQuery.data ?? [],
    isError: categoriesQuery.isError || expensesQuery.isError,
    isLoading: categoriesQuery.isLoading || expensesQuery.isLoading,
  };
};
