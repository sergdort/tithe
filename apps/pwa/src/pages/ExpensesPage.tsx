import AddIcon from '@mui/icons-material/Add';
import { Box, Fab } from '@mui/material';
import { useState } from 'react';

import { ExpensesList } from '../features/expenses/components/ExpensesList.js';
import { useTransactionsPage } from '../features/expenses/hooks/useTransactionsPage.js';
import { AddTransactionDialog } from '../features/home/dialogs/AddTransactionDialog.js';

export const ExpensesPage = () => {
  const [addOpen, setAddOpen] = useState(false);
  const view = useTransactionsPage();

  return (
    <Box>
      <ExpensesList
        categories={view.categories}
        expenses={view.expenses}
        isLoading={view.isLoading}
        isError={view.isError}
        emptyLabel={view.emptyLabel}
      />

      <Fab
        color="primary"
        aria-label="Add transaction"
        onClick={() => setAddOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 88,
          right: 20,
          minWidth: 56,
          minHeight: 56,
        }}
      >
        <AddIcon />
      </Fab>

      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </Box>
  );
};
