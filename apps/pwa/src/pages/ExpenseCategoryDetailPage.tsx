import { Alert, Stack, Typography } from '@mui/material';

import { ExpensesList } from '../features/expenses/components/ExpensesList.js';
import { useCategoryTransactions } from '../features/expenses/hooks/useCategoryTransactions.js';
import { useCategoryTransactionsRoute } from '../features/expenses/hooks/useCategoryTransactionsRoute.js';
import { useCategoryTransactionsShell } from '../features/expenses/hooks/useCategoryTransactionsShell.js';

const buildDetailCopy = ({
  transferDirection,
  categoryName,
  monthLabel,
}: {
  transferDirection: 'in' | 'out' | null;
  categoryName: string;
  monthLabel: string;
}) => {
  if (transferDirection === 'in') {
    return {
      helperText: 'Incoming transactions in this category for the selected month.',
      emptyLabel: `No incoming transactions in ${categoryName} for ${monthLabel}.`,
    };
  }

  if (transferDirection === 'out') {
    return {
      helperText: 'Outgoing transactions in this category for the selected month.',
      emptyLabel: `No outgoing transactions in ${categoryName} for ${monthLabel}.`,
    };
  }

  return {
    helperText: 'Transactions in this category for the selected month.',
    emptyLabel: `No transactions in ${categoryName} for ${monthLabel}.`,
  };
};

export const ExpenseCategoryDetailPage = () => {
  const route = useCategoryTransactionsRoute();
  const view = useCategoryTransactions({
    categoryId: route.categoryId,
    from: route.from,
    to: route.to,
    transferDirection: route.transferDirection,
    seededCategoryName: route.seededCategoryName,
  });
  const detailCopy = buildDetailCopy({
    transferDirection: route.transferDirection,
    categoryName: view.categoryName,
    monthLabel: route.monthLabel,
  });

  useCategoryTransactionsShell({
    title: view.categoryName,
    fallbackHomeHref: route.fallbackHomeHref,
    shouldGoBackInApp: route.shouldGoBackInApp,
  });

  if (!route.categoryId) {
    return <Alert severity="error">Missing category.</Alert>;
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="caption" color="text.secondary">
        {route.monthLabel}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {detailCopy.helperText}
      </Typography>

      {view.hasCategoryMetadataError ? (
        <Alert severity="warning">Category metadata unavailable. Showing raw category IDs.</Alert>
      ) : null}

      <ExpensesList
        categories={view.categories}
        expenses={view.expenses}
        isLoading={view.isLoading}
        isError={view.isError}
        emptyLabel={detailCopy.emptyLabel}
      />
    </Stack>
  );
};
