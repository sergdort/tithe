import { Alert, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { api } from '../api.js';
import { ExpensesList } from '../features/expenses/components/ExpensesList.js';
import { monthStartLocal, parseMonthParam, shiftMonthLocal } from '../lib/date/month.js';

export const ExpenseCategoryDetailPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams] = useSearchParams();

  const monthCursor = useMemo(
    () => monthStartLocal(parseMonthParam(searchParams.get('month')) ?? new Date()),
    [searchParams],
  );

  const monthLabel = useMemo(
    () =>
      monthCursor.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      }),
    [monthCursor],
  );

  const from = useMemo(() => monthCursor.toISOString(), [monthCursor]);
  const to = useMemo(() => {
    const nextMonthStart = shiftMonthLocal(monthCursor, 1);
    return new Date(nextMonthStart.getTime() - 1).toISOString();
  }, [monthCursor]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const expensesQuery = useQuery({
    queryKey: ['expenses', 'category-detail', categoryId, from, to],
    queryFn: () => api.expenses.list({ categoryId, from, to, limit: 1000 }),
    enabled: Boolean(categoryId),
  });

  if (!categoryId) {
    return <Alert severity="error">Missing category.</Alert>;
  }

  const categories = categoriesQuery.data ?? [];
  const categoryName = categories.find((item) => item.id === categoryId)?.name ?? 'Category';

  return (
    <Stack spacing={1.25}>
      <Typography variant="caption" color="text.secondary">
        {monthLabel}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {categoryName}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Transactions in this category for the selected month.
      </Typography>

      {categoriesQuery.isError ? (
        <Alert severity="warning">Category metadata unavailable. Showing raw category IDs.</Alert>
      ) : null}

      <ExpensesList
        categories={categories}
        expenses={expensesQuery.data ?? []}
        isLoading={expensesQuery.isLoading || categoriesQuery.isLoading}
        isError={expensesQuery.isError}
        emptyLabel={`No expenses in ${categoryName} for ${monthLabel}.`}
      />
    </Stack>
  );
};
