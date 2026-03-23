import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../api.js';
import { ExpensesList } from '../features/expenses/components/ExpensesList.js';
import { useTransactionsPage } from '../features/expenses/hooks/useTransactionsPage.js';

export const ExpensesPage = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [merchantName, setMerchantName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const view = useTransactionsPage();

  const createExpense = useMutation({
    mutationFn: async () => {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Amount must be greater than zero');
      }
      if (!categoryId) {
        throw new Error('Please select a category');
      }

      return api.expenses.create({
        occurredAt: new Date().toISOString(),
        amountMinor: Math.round(parsed * 100),
        currency: 'GBP',
        categoryId,
        merchantName,
        note,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setOpen(false);
      setMerchantName('');
      setAmount('');
      setCategoryId('');
      setNote('');
    },
  });

  const categories = view.categories;

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
        aria-label="Add expense"
        onClick={() => setOpen(true)}
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

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth>
        <DialogTitle>Add Expense</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Amount (GBP)"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
              required
            />
            <TextField
              label="Category"
              select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
            >
              {categories
                .filter((category) => category.kind === 'expense')
                .map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Merchant"
              value={merchantName}
              onChange={(event) => setMerchantName(event.target.value)}
            />
            <TextField
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {createExpense.isError ? (
              <Alert severity="error">{(createExpense.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => createExpense.mutate()}
            disabled={createExpense.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
