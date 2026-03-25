import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { api } from '../../../api.js';
import { pounds } from '../../../lib/format/money.js';
import type { Expense, FundingLink } from '../../../types.js';

interface LinkFundingSourceDialogProps {
  open: boolean;
  onClose: () => void;
  incomeExpense: Expense | null;
}

const computeDateWindow = (occurredAt: string): { from: string; to: string } => {
  const date = new Date(occurredAt);
  const from = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 2, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
};

const dayLabel = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const sumLinkedByTransfer = (links: FundingLink[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const link of links) {
    map.set(link.transferExpenseId, (map.get(link.transferExpenseId) ?? 0) + link.amountMinor);
  }
  return map;
};

export const LinkFundingSourceDialog = ({
  open,
  onClose,
  incomeExpense,
}: LinkFundingSourceDialogProps) => {
  const queryClient = useQueryClient();
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dateWindow = useMemo(
    () => (incomeExpense ? computeDateWindow(incomeExpense.occurredAt) : null),
    [incomeExpense],
  );

  // Fetch Monzo income transactions as candidates (these are the transfers that were funded by this salary)
  const candidatesQuery = useQuery({
    queryKey: ['expenses', 'funding-transfer-candidates', dateWindow?.from, dateWindow?.to],
    queryFn: () =>
      api.expenses.list({
        from: dateWindow?.from,
        to: dateWindow?.to,
        kind: 'income',
        source: 'monzo',
        limit: 50,
      }),
    enabled: open && dateWindow !== null,
  });

  const existingLinksQuery = useQuery({
    queryKey: ['funding-links', 'by-income', incomeExpense?.id],
    // biome-ignore lint/style/noNonNullAssertion: guarded by enabled
    queryFn: () => api.fundingLinks.listByIncome(incomeExpense!.id),
    enabled: open && incomeExpense !== null,
  });

  const existingLinks = existingLinksQuery.data ?? [];
  const totalLinkedMinor = existingLinks.reduce((sum, link) => sum + link.amountMinor, 0);
  const incomeAmountMinor = incomeExpense?.money.amountMinor ?? 0;
  const remainingUnallocatedMinor = Math.max(incomeAmountMinor - totalLinkedMinor, 0);
  const isFullyAllocated = remainingUnallocatedMinor === 0 && incomeAmountMinor > 0;
  const linkedByTransferId = useMemo(() => sumLinkedByTransfer(existingLinks), [existingLinks]);

  const linkMutation = useMutation({
    mutationFn: (payload: {
      incomeExpenseId: string;
      transferExpenseId: string;
      amountMinor: number;
    }) =>
      api.fundingLinks.link({
        ...payload,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
        queryClient.invalidateQueries({ queryKey: ['funding-links'] }),
      ]);
      handleClose();
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const handleClose = () => {
    setSelectedTransferId(null);
    setAmountText('');
    setSubmitError(null);
    onClose();
  };

  const handleSelect = (transfer: Expense) => {
    setSelectedTransferId(transfer.id);
    setSubmitError(null);
    const transferAmount = transfer.money.amountMinor;
    const defaultAmount = Math.min(remainingUnallocatedMinor, transferAmount);
    setAmountText((defaultAmount / 100).toFixed(2));
  };

  const handleSave = () => {
    if (!selectedTransferId || !incomeExpense) return;
    setSubmitError(null);
    const parsed = Number(amountText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSubmitError('Amount must be greater than zero.');
      return;
    }
    linkMutation.mutate({
      incomeExpenseId: incomeExpense.id,
      transferExpenseId: selectedTransferId,
      amountMinor: Math.round(parsed * 100),
    });
  };

  const candidates = (candidatesQuery.data ?? []).filter((item) => item.id !== incomeExpense?.id);
  const isLoading =
    (candidatesQuery.isLoading && candidates.length === 0) ||
    (existingLinksQuery.isLoading && existingLinks.length === 0);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth>
      <DialogTitle>Link funded transactions</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {incomeExpense
            ? `Select which transactions were funded by this ${pounds(incomeAmountMinor)} income.`
            : 'Select a transaction to link.'}
        </Typography>

        {incomeExpense && totalLinkedMinor > 0 ? (
          <Typography
            variant="caption"
            color={isFullyAllocated ? 'success.main' : 'text.secondary'}
            sx={{ mb: 1, display: 'block' }}
          >
            {isFullyAllocated
              ? `Fully allocated (${pounds(totalLinkedMinor)})`
              : `${pounds(totalLinkedMinor)} of ${pounds(incomeAmountMinor)} allocated \u2014 ${pounds(remainingUnallocatedMinor)} remaining`}
          </Typography>
        ) : null}

        {isLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : candidatesQuery.isError ? (
          <Alert severity="error">Unable to load transactions.</Alert>
        ) : candidates.length === 0 ? (
          <Alert severity="info">No Monzo income transactions found within +/- 1 month.</Alert>
        ) : (
          <>
            <List disablePadding>
              {candidates.map((transfer) => {
                const alreadyLinkedMinor = linkedByTransferId.get(transfer.id) ?? 0;
                const isAlreadyLinked = alreadyLinkedMinor > 0;

                return (
                  <ListItem key={transfer.id} disableGutters disablePadding>
                    <ListItemButton
                      selected={selectedTransferId === transfer.id}
                      onClick={() => handleSelect(transfer)}
                      disabled={isAlreadyLinked || isFullyAllocated}
                      sx={{
                        borderRadius: 1,
                        py: 0.75,
                        opacity: isAlreadyLinked || isFullyAllocated ? 0.4 : 1,
                      }}
                    >
                      <ListItemText
                        primary={
                          transfer.merchantName?.trim() || transfer.note?.trim() || 'Transfer'
                        }
                        secondary={
                          isAlreadyLinked
                            ? `${dayLabel(transfer.occurredAt)} \u2014 ${pounds(alreadyLinkedMinor)} linked`
                            : dayLabel(transfer.occurredAt)
                        }
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {isAlreadyLinked ? (
                          <Chip
                            size="small"
                            label="Linked"
                            color="success"
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        ) : null}
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {pounds(transfer.money.amountMinor)}
                        </Typography>
                      </Stack>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>

            {selectedTransferId && !isFullyAllocated ? (
              <TextField
                label="Funded amount (GBP)"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
                fullWidth
                sx={{ mt: 1.5 }}
              />
            ) : null}
          </>
        )}

        {submitError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {submitError}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!selectedTransferId || isFullyAllocated || linkMutation.isPending}
        >
          Link
        </Button>
      </DialogActions>
    </Dialog>
  );
};
