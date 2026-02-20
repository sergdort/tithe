import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { api } from '../api.js';

export const ExpensesPage = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [merchantName, setMerchantName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const expensesQuery = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.expenses.list(),
  });

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

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  if (categoriesQuery.isLoading || expensesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (categoriesQuery.isError || expensesQuery.isError) {
    return <Alert severity="error">Unable to load expenses.</Alert>;
  }

  const categories = categoriesQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];

  return (
    <Box>
      <Stack spacing={2}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700}>
              Latest Expenses
            </Typography>
            {expenses.length === 0 ? (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                No expenses logged yet.
              </Typography>
            ) : (
              <List disablePadding>
                {expenses.map((expense) => (
                  <ListItem key={expense.id} disableGutters sx={{ py: 1 }}>
                    <ListItemText
                      primary={`${expense.money.amountMinor / 100} ${expense.money.currency}`}
                      secondary={`${categoryById.get(expense.categoryId) ?? expense.categoryId} • ${new Date(
                        expense.occurredAt,
                      ).toLocaleDateString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Stack>

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
