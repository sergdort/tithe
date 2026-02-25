import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Avatar,
  Box,
  Button,
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
  const logoUrl = merchantLogoUrl?.trim() || '';
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const merchantLabel = merchantName?.trim() || 'Merchant';
  const emoji = merchantEmoji?.trim() || '';
  const canShowLogo = logoUrl.length > 0 && failedLogoUrl !== logoUrl;
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
          onError={() => setFailedLogoUrl(logoUrl)}
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

const semanticKindLabel = (
  kind?: string,
  transferDirection?: 'in' | 'out' | null,
): string | null => {
  if (kind === 'transfer_internal') {
    return `Internal transfer (${transferDirection === 'in' ? 'in' : 'out'})`;
  }
  if (kind === 'transfer_external') {
    return `External transfer (${transferDirection === 'in' ? 'in' : 'out'})`;
  }
  return null;
};

const reimbursementChipLabel = (status?: string): string | null => {
  if (!status || status === 'none') return null;
  if (status === 'expected') return 'Reimbursable';
  if (status === 'partial') return 'Partial';
  if (status === 'settled') return 'Settled';
  if (status === 'written_off') return 'Written off';
  return null;
};

const isInflowExpense = (expense: {
  kind?: string;
  transferDirection?: 'in' | 'out' | null;
}): boolean => {
  if (expense.kind === 'income') return true;
  if (expense.kind === 'transfer_external' || expense.kind === 'transfer_internal') {
    return expense.transferDirection === 'in';
  }
  return false;
};

const expenseAmountPresentation = (expense: {
  kind?: string;
  transferDirection?: 'in' | 'out' | null;
  money: { amountMinor: number; currency: string };
}): { text: string; color: string } => {
  const base = pounds(expense.money.amountMinor, expense.money.currency);

  if (isInflowExpense(expense)) {
    return { text: `+${base}`, color: 'success.main' };
  }

  if (expense.kind === 'transfer_internal') {
    return { text: base, color: 'text.secondary' };
  }

  return { text: base, color: 'text.primary' };
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

  const linkReimbursement = useMutation({
    mutationFn: (payload: { expenseOutId: string; expenseInId: string; amountMinor: number }) =>
      api.reimbursements.link({
        ...payload,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
      ]);
    },
  });

  const closeReimbursement = useMutation({
    mutationFn: (payload: {
      expenseOutId: string;
      closeOutstandingMinor?: number;
      reason?: string | null;
    }) =>
      api.reimbursements.close(payload.expenseOutId, {
        closeOutstandingMinor: payload.closeOutstandingMinor,
        reason: payload.reason ?? undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
      ]);
    },
  });

  const reopenReimbursement = useMutation({
    mutationFn: (expenseOutId: string) => api.reimbursements.reopen(expenseOutId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
      ]);
    },
  });

  const categoryById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; icon: string; kind: string; reimbursementMode?: string }
    >();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, {
        name: category.name,
        color: category.color,
        icon: category.icon,
        kind: category.kind,
        reimbursementMode: category.reimbursementMode,
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
      {expenses.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          No expenses logged yet.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 0.5 }}>
          {groupedExpenses.map(([label, items]) => (
            <Box key={label}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{
                  position: 'sticky',
                  top: 'calc(56px + env(safe-area-inset-top, 0px))',
                  zIndex: 2,
                  px: 0.25,
                  py: 0.5,
                  mb: 0.25,
                  bgcolor: 'background.default',
                  borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {label}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {pounds(
                    items.reduce(
                      (sum, expense) =>
                        sum +
                        (isInflowExpense(expense)
                          ? expense.money.amountMinor
                          : -expense.money.amountMinor),
                      0,
                    ),
                    'GBP',
                  )}
                </Typography>
              </Stack>
              <List disablePadding>
                {items.map((expense) => {
                  const merchant = expense.merchantName?.trim() || 'Card payment';
                  const categoryMeta = categoryById.get(expense.categoryId);
                  const categoryName = categoryMeta?.name ?? expense.categoryId;
                  const kindLabel = semanticKindLabel(expense.kind, expense.transferDirection);
                  const reimbursementLabel = reimbursementChipLabel(expense.reimbursementStatus);
                  const canShowReimbursement =
                    expense.kind === 'expense' &&
                    expense.reimbursementStatus &&
                    expense.reimbursementStatus !== 'none';
                  const outstandingMinor = expense.outstandingMinor ?? 0;
                  const amountView = expenseAmountPresentation(expense);

                  const subtitle = canShowReimbursement
                    ? `${reimbursementLabel ?? 'Reimbursable'} · Outstanding ${pounds(
                        outstandingMinor,
                        expense.money.currency,
                      )}`
                    : kindLabel || categoryName;

                  const handleLinkRepayment = () => {
                    const expenseInId = window.prompt(
                      'Inbound transaction ID to link as reimbursement',
                    );
                    if (!expenseInId) return;
                    const amountText = window.prompt(
                      'Allocation amount (GBP)',
                      (outstandingMinor / 100).toFixed(2),
                    );
                    if (!amountText) return;
                    const parsed = Number(amountText);
                    if (!Number.isFinite(parsed) || parsed <= 0) return;
                    linkReimbursement.mutate({
                      expenseOutId: expense.id,
                      expenseInId: expenseInId.trim(),
                      amountMinor: Math.round(parsed * 100),
                    });
                  };

                  const handleCloseRemainder = () => {
                    const amountText = window.prompt(
                      'Write-off outstanding amount (GBP)',
                      (outstandingMinor / 100).toFixed(2),
                    );
                    if (!amountText) return;
                    const parsed = Number(amountText);
                    if (!Number.isFinite(parsed) || parsed < 0) return;
                    const reason = window.prompt('Reason (optional)') ?? undefined;
                    closeReimbursement.mutate({
                      expenseOutId: expense.id,
                      closeOutstandingMinor: Math.round(parsed * 100),
                      reason,
                    });
                  };

                  return (
                    <ListItem
                      key={expense.id}
                      disableGutters
                      data-expense-id={expense.id}
                      sx={{ py: 0.9, alignItems: 'center', gap: 1 }}
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
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
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {subtitle}
                        </Typography>
                        {canShowReimbursement && outstandingMinor > 0 ? (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
                            <Button
                              size="small"
                              variant="text"
                              onClick={handleLinkRepayment}
                              disabled={linkReimbursement.isPending}
                              sx={{ minHeight: 36, px: 0.5 }}
                            >
                              Link repayment
                            </Button>
                            <Button
                              size="small"
                              variant="text"
                              onClick={handleCloseRemainder}
                              disabled={closeReimbursement.isPending}
                              sx={{ minHeight: 36, px: 0.5 }}
                            >
                              Mark written off
                            </Button>
                          </Stack>
                        ) : null}
                        {canShowReimbursement &&
                        outstandingMinor === 0 &&
                        expense.reimbursementStatus === 'written_off' ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => reopenReimbursement.mutate(expense.id)}
                            disabled={reopenReimbursement.isPending}
                            sx={{ mt: 0.25, minHeight: 36, px: 0.5 }}
                          >
                            Reopen
                          </Button>
                        ) : null}
                      </Box>

                      <Box sx={{ textAlign: 'right', minWidth: 88, pr: 0.25 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 700, lineHeight: 1.1, color: amountView.color }}
                        >
                          {amountView.text}
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
