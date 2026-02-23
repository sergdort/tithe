import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  List,
  ListItem,
  ListItemAvatar,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api.js';
import { pounds } from '../lib/format/money.js';

const merchantInitials = (merchantName?: string | null): string => {
  const trimmed = merchantName?.trim();
  if (!trimmed) {
    return '•';
  }

  const tokens = trimmed.match(/[A-Za-z0-9]+/g) ?? [];
  if (tokens.length >= 2) {
    return `${tokens[0]?.[0] ?? ''}${tokens[1]?.[0] ?? ''}`.toUpperCase() || '•';
  }

  const singleToken = tokens[0] ?? '';
  const initials = singleToken.slice(0, 2).toUpperCase();
  return initials || '•';
};

interface ExpenseMerchantAvatarProps {
  expenseId: string;
  merchantName?: string | null;
  merchantLogoUrl?: string | null;
  merchantEmoji?: string | null;
}

const ExpenseMerchantAvatar = ({
  expenseId,
  merchantName,
  merchantLogoUrl,
  merchantEmoji,
}: ExpenseMerchantAvatarProps) => {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [merchantLogoUrl]);

  const merchantLabel = merchantName?.trim() || 'Merchant';
  const logoUrl = merchantLogoUrl?.trim() || '';
  const emoji = merchantEmoji?.trim() || '';
  const canShowLogo = logoUrl.length > 0 && !logoFailed;
  const fallbackText = emoji || merchantInitials(merchantName);
  const avatarKind = canShowLogo ? 'logo' : emoji ? 'emoji' : 'initials';

  return (
    <Avatar
      data-testid={`expense-avatar-${expenseId}`}
      data-avatar-kind={avatarKind}
      sx={{ width: 40, height: 40, bgcolor: '#DDEAF8', color: '#0E2A47' }}
    >
      {canShowLogo ? (
        <Box
          component="img"
          src={logoUrl}
          alt={`${merchantLabel} logo`}
          onError={() => setLogoFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        fallbackText
      )}
    </Avatar>
  );
};

const dayLabel = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfInput = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfInput.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

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
    const map = new Map<string, { name: string; color: string; icon: string }>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, {
        name: category.name,
        color: category.color,
        icon: category.icon,
      });
    }
    return map;
  }, [categoriesQuery.data]);

  const categories = categoriesQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, typeof expenses>();

    for (const expense of expenses) {
      const key = dayLabel(expense.occurredAt);
      const list = groups.get(key) ?? [];
      list.push(expense);
      groups.set(key, list);
    }

    return Array.from(groups.entries());
  }, [expenses]);

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
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                {groupedExpenses.map(([label, items]) => (
                  <Box key={label}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: 'text.secondary', px: 0.5 }}
                    >
                      {label}
                    </Typography>
                    <List disablePadding>
                      {items.map((expense) => {
                        const merchant = expense.merchantName?.trim() || 'Card payment';
                        const categoryMeta = categoryById.get(expense.categoryId);
                        const categoryName = categoryMeta?.name ?? expense.categoryId;
                        const categoryColor = categoryMeta?.color ?? '#607D8B';

                        return (
                          <ListItem
                            key={expense.id}
                            disableGutters
                            data-expense-id={expense.id}
                            sx={{ py: 1.1, alignItems: 'center', gap: 1.25 }}
                          >
                            <ListItemAvatar sx={{ minWidth: 48 }}>
                              <ExpenseMerchantAvatar
                                expenseId={expense.id}
                                merchantName={expense.merchantName}
                                merchantLogoUrl={expense.merchantLogoUrl}
                                merchantEmoji={expense.merchantEmoji}
                              />
                            </ListItemAvatar>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                                {merchant}
                              </Typography>
                              <Stack direction="row" spacing={0.75} sx={{ mt: 0.4 }}>
                                <Chip
                                  size="small"
                                  label={categoryName}
                                  sx={{
                                    height: 22,
                                    bgcolor: `${categoryColor}22`,
                                    color: categoryColor,
                                    fontWeight: 600,
                                  }}
                                />
                              </Stack>
                            </Box>

                            <Box sx={{ textAlign: 'right', minWidth: 112 }}>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                                {pounds(expense.money.amountMinor, expense.money.currency)}
                              </Typography>
                            </Box>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                ))}
              </Stack>
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
