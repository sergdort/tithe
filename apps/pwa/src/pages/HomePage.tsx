import AddIcon from '@mui/icons-material/Add';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import {
  Alert,
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
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api.js';

type TransactionKind = 'income' | 'expense' | 'transfer';
type TransferDirection = 'in' | 'out';

const pounds = (amountMinor: number, currency = 'GBP'): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amountMinor) / 100);

const signedPounds = (amountMinor: number, currency = 'GBP'): string =>
  `${amountMinor >= 0 ? '+' : '-'}${pounds(Math.abs(amountMinor), currency)}`;

const monthStartLocal = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const shiftMonthLocal = (date: Date, delta: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const localDateInputToIso = (value: string): string => {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
};

const monthWindow = (cursor: Date) => {
  const start = monthStartLocal(cursor);
  const end = shiftMonthLocal(start, 1);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label: start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

const sectionLabel = (kind: TransactionKind): string =>
  kind === 'expense' ? 'Expenses' : kind === 'income' ? 'Income' : 'Transfers';

export const HomePage = () => {
  const queryClient = useQueryClient();

  const [monthCursor, setMonthCursor] = useState(() => monthStartLocal(new Date()));
  const [addOpen, setAddOpen] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>('expense');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(() => toDateInputValue(new Date()));
  const [txDescription, setTxDescription] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txTransferDirection, setTxTransferDirection] = useState<TransferDirection>('out');

  const [payOpen, setPayOpen] = useState(false);
  const [payInstanceId, setPayInstanceId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => toDateInputValue(new Date()));
  const [payTransferDirection, setPayTransferDirection] = useState<TransferDirection>('out');

  const window = useMemo(() => monthWindow(monthCursor), [monthCursor]);

  const ledgerQuery = useQuery({
    queryKey: ['report', 'monthlyLedger', window.from, window.to],
    queryFn: () => api.reports.monthlyLedger({ from: window.from, to: window.to }),
  });

  const dueQuery = useQuery({
    queryKey: ['commitments', 'instances', 'pending'],
    queryFn: () => api.commitments.instances('pending'),
  });

  const commitmentsQuery = useQuery({
    queryKey: ['commitments'],
    queryFn: () => api.commitments.list(),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const monzoStatusQuery = useQuery({
    queryKey: ['monzo', 'status'],
    queryFn: () => api.monzo.status(),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.monzo.connectStart(),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.monzo.syncNow(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monzo', 'status'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
      ]);
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(txAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Amount must be greater than zero');
      }
      if (!txCategoryId) {
        throw new Error('Please select a category');
      }

      return api.expenses.create({
        occurredAt: localDateInputToIso(txDate),
        amountMinor: Math.round(parsed * 100),
        currency: 'GBP',
        categoryId: txCategoryId,
        source: 'manual',
        transferDirection: txKind === 'transfer' ? txTransferDirection : null,
        merchantName: txDescription.trim() || undefined,
        note: txNote.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ]);

      setAddOpen(false);
      setTxAmount('');
      setTxDescription('');
      setTxNote('');
      setTxDate(toDateInputValue(new Date()));
      setTxTransferDirection('out');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(payAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      const instance = (dueQuery.data ?? []).find((item) => item.id === payInstanceId);
      if (!instance) {
        throw new Error('Commitment instance not found');
      }
      const commitment = (commitmentsQuery.data ?? []).find((item) => item.id === instance.commitmentId);
      if (!commitment) {
        throw new Error('Commitment not found');
      }
      const category = (categoriesQuery.data ?? []).find((item) => item.id === commitment.categoryId);
      if (!category) {
        throw new Error('Commitment category not found');
      }

      return api.expenses.create({
        occurredAt: localDateInputToIso(payDate),
        amountMinor: Math.round(parsed * 100),
        currency: instance.expectedMoney.currency,
        categoryId: commitment.categoryId,
        source: 'commitment',
        commitmentInstanceId: instance.id,
        transferDirection: category.kind === 'transfer' ? payTransferDirection : null,
        merchantName: commitment.name,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commitments', 'instances', 'pending'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['report', 'monthlyLedger'] }),
      ]);
      setPayOpen(false);
      setPayInstanceId('');
      setPayAmount('');
      setPayDate(toDateInputValue(new Date()));
      setPayTransferDirection('out');
    },
  });

  const categories = categoriesQuery.data ?? [];
  const dueData = dueQuery.data ?? [];
  const commitments = commitmentsQuery.data ?? [];
  const monzoStatus = monzoStatusQuery.data;
  const ledger = ledgerQuery.data;

  const categoriesByKind = useMemo(
    () => ({
      expense: categories.filter((item) => item.kind === 'expense'),
      income: categories.filter((item) => item.kind === 'income'),
      transfer: categories.filter((item) => item.kind === 'transfer'),
    }),
    [categories],
  );

  const categoriesById = useMemo(() => new Map(categories.map((item) => [item.id, item] as const)), [categories]);
  const commitmentsById = useMemo(
    () => new Map(commitments.map((item) => [item.id, item] as const)),
    [commitments],
  );

  useEffect(() => {
    const available = categoriesByKind[txKind];
    if (available.length === 0) {
      setTxCategoryId('');
      return;
    }

    if (!available.some((item) => item.id === txCategoryId)) {
      setTxCategoryId(available[0]?.id ?? '');
    }
  }, [categoriesByKind, txKind, txCategoryId]);

  const selectedPayInstance = useMemo(
    () => dueData.find((item) => item.id === payInstanceId) ?? null,
    [dueData, payInstanceId],
  );
  const selectedPayCommitment = useMemo(
    () => (selectedPayInstance ? commitmentsById.get(selectedPayInstance.commitmentId) ?? null : null),
    [commitmentsById, selectedPayInstance],
  );
  const selectedPayCategory = useMemo(
    () => (selectedPayCommitment ? categoriesById.get(selectedPayCommitment.categoryId) ?? null : null),
    [categoriesById, selectedPayCommitment],
  );

  const openMarkPaidDialog = (instanceId: string) => {
    const instance = dueData.find((item) => item.id === instanceId);
    const commitment = instance ? commitmentsById.get(instance.commitmentId) : undefined;
    const category = commitment ? categoriesById.get(commitment.categoryId) : undefined;

    setPayInstanceId(instanceId);
    setPayAmount(instance ? (instance.expectedMoney.amountMinor / 100).toFixed(2) : '');
    setPayDate(toDateInputValue(instance ? new Date(instance.dueAt) : new Date()));
    setPayTransferDirection(category?.kind === 'transfer' ? 'out' : 'out');
    setPayOpen(true);
  };

  const handleConnectClick = async () => {
    const popup = globalThis.open?.('', '_blank', 'noopener,noreferrer');

    try {
      const payload = await connectMutation.mutateAsync();

      if (popup) {
        popup.location.replace(payload.authUrl);
        popup.focus?.();
        return;
      }

      const opened = globalThis.open?.(payload.authUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        globalThis.location?.assign(payload.authUrl);
      }
    } catch {
      popup?.close?.();
    }
  };

  const anyLoading =
    ledgerQuery.isLoading ||
    dueQuery.isLoading ||
    commitmentsQuery.isLoading ||
    categoriesQuery.isLoading ||
    monzoStatusQuery.isLoading;
  const anyError =
    ledgerQuery.isError ||
    dueQuery.isError ||
    commitmentsQuery.isError ||
    categoriesQuery.isError ||
    monzoStatusQuery.isError;

  if (anyLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (anyError || !ledger || !monzoStatus) {
    return <Alert severity="error">Unable to load dashboard data.</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <IconButton
                aria-label="Previous month"
                onClick={() => setMonthCursor((value) => shiftMonthLocal(value, -1))}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="subtitle1" fontWeight={700} sx={{ minWidth: 140, textAlign: 'center' }}>
                {window.label}
              </Typography>
              <IconButton
                aria-label="Next month"
                onClick={() => setMonthCursor((value) => shiftMonthLocal(value, 1))}
              >
                <ChevronRightIcon />
              </IconButton>
            </Stack>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add
            </Button>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Monthly cashflow ledger (actual transactions only)
          </Typography>

          <Stack spacing={0.75} sx={{ mt: 1.5 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Income</Typography>
              <Typography sx={{ fontWeight: 700, color: 'success.main' }}>
                {pounds(ledger.totals.incomeMinor)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Expenses</Typography>
              <Typography sx={{ fontWeight: 700, color: 'error.main' }}>
                {pounds(ledger.totals.expenseMinor)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Transfer in</Typography>
              <Typography sx={{ fontWeight: 700, color: 'info.main' }}>
                {pounds(ledger.totals.transferInMinor)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Transfer out</Typography>
              <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>
                {pounds(ledger.totals.transferOutMinor)}
              </Typography>
            </Stack>
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack spacing={0.75}>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontWeight: 700 }}>Operating Surplus</Typography>
              <Typography
                sx={{
                  fontWeight: 800,
                  color:
                    ledger.totals.operatingSurplusMinor >= 0 ? 'success.main' : 'error.main',
                }}
              >
                {signedPounds(ledger.totals.operatingSurplusMinor)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontWeight: 700 }}>Net Cash Movement</Typography>
              <Typography
                sx={{
                  fontWeight: 800,
                  color: ledger.totals.netCashMovementMinor >= 0 ? 'info.main' : 'error.main',
                }}
              >
                {signedPounds(ledger.totals.netCashMovementMinor)}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {ledger.totals.txCount} transactions in selected month
            </Typography>
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="success.dark" sx={{ mb: 0.5 }}>
                Income
              </Typography>
              {ledger.sections.income.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No income recorded.
                </Typography>
              ) : (
                <List disablePadding>
                  {ledger.sections.income.map((item) => (
                    <ListItem key={`income-${item.categoryId}`} disableGutters sx={{ py: 0.35 }}>
                      <ListItemText
                        primary={item.categoryName}
                        secondary={`${item.txCount} tx`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                        {pounds(item.totalMinor)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="error.dark" sx={{ mb: 0.5 }}>
                Expenses
              </Typography>
              {ledger.sections.expense.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No expenses recorded.
                </Typography>
              ) : (
                <List disablePadding>
                  {ledger.sections.expense.map((item) => (
                    <ListItem key={`expense-${item.categoryId}`} disableGutters sx={{ py: 0.35 }}>
                      <ListItemText
                        primary={item.categoryName}
                        secondary={`${item.txCount} tx`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {pounds(item.totalMinor)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="info.dark" sx={{ mb: 0.5 }}>
                Transfers
              </Typography>
              {ledger.sections.transfer.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No transfers recorded.
                </Typography>
              ) : (
                <List disablePadding>
                  {ledger.sections.transfer.map((item) => (
                    <ListItem
                      key={`transfer-${item.categoryId}-${item.direction}`}
                      disableGutters
                      sx={{ py: 0.35, gap: 1 }}
                    >
                      <ListItemText
                        primary={item.categoryName}
                        secondary={`${item.direction === 'in' ? 'Money in' : 'Money out'} • ${item.txCount} tx`}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {pounds(item.totalMinor)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <CloudSyncOutlinedIcon color="info" />
            <Typography variant="subtitle1" fontWeight={700}>
              Monzo Import
            </Typography>
            <Chip
              size="small"
              color={monzoStatus.connected ? 'success' : 'default'}
              label={monzoStatus.status ?? 'unknown'}
              sx={{ textTransform: 'capitalize' }}
            />
          </Stack>

          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {monzoStatus.configured
              ? monzoStatus.connected
                ? `Connected${monzoStatus.accountId ? ` • ${monzoStatus.accountId}` : ''}`
                : 'Configured but not connected'
              : 'Set MONZO_CLIENT_ID, MONZO_CLIENT_SECRET and MONZO_REDIRECT_URI on the API server'}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Last sync: {monzoStatus.lastSyncAt ? new Date(monzoStatus.lastSyncAt).toLocaleString() : 'Never'}
          </Typography>

          {monzoStatus.lastError ? (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {monzoStatus.lastError}
            </Alert>
          ) : null}

          {connectMutation.isError ? (
            <Alert severity="error" sx={{ mt: 1 }}>
              {(connectMutation.error as Error).message}
            </Alert>
          ) : null}

          {syncMutation.isError ? (
            <Alert severity="error" sx={{ mt: 1 }}>
              {(syncMutation.error as Error).message}
            </Alert>
          ) : null}

          {syncMutation.isSuccess ? (
            <Alert severity="success" sx={{ mt: 1 }}>
              Imported {syncMutation.data.imported} transactions, skipped {syncMutation.data.skipped}.
            </Alert>
          ) : null}

          <Divider sx={{ my: 1.5 }} />

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => void handleConnectClick()}
              disabled={!monzoStatus.configured || connectMutation.isPending}
            >
              Connect
            </Button>
            <Button
              variant="contained"
              onClick={() => syncMutation.mutate()}
              disabled={!monzoStatus.connected || syncMutation.isPending}
            >
              Sync now
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <AccessTimeOutlinedIcon color="secondary" />
            <Typography variant="subtitle1" fontWeight={700}>
              Upcoming Commitments
            </Typography>
          </Stack>
          {dueData.length === 0 ? (
            <Typography color="text.secondary">No pending commitments.</Typography>
          ) : (
            <List disablePadding>
              {dueData.slice(0, 8).map((item) => {
                const commitment = commitmentsById.get(item.commitmentId);
                const category = commitment ? categoriesById.get(commitment.categoryId) : undefined;
                return (
                  <ListItem key={item.id} disableGutters sx={{ alignItems: 'flex-start', gap: 1 }}>
                    <ListItemIcon sx={{ minWidth: 32, mt: 0.4 }}>
                      <ReceiptLongOutlinedIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {commitment?.name ?? 'Commitment'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {new Date(item.dueAt).toLocaleDateString()} • {pounds(item.expectedMoney.amountMinor, item.expectedMoney.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {category ? `${sectionLabel(category.kind)} • ${category.name}` : item.status}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => openMarkPaidDialog(item.id)}
                      sx={{ minWidth: 86, minHeight: 36 }}
                    >
                      Mark paid
                    </Button>
                  </ListItem>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth>
        <DialogTitle>Add Transaction</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Type"
              value={txKind}
              onChange={(event) => setTxKind(event.target.value as TransactionKind)}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </TextField>
            <TextField
              label="Date"
              type="date"
              value={txDate}
              onChange={(event) => setTxDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
            <TextField
              label="Amount (GBP)"
              value={txAmount}
              onChange={(event) => setTxAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
              required
            />
            <TextField
              select
              label="Category"
              value={txCategoryId}
              onChange={(event) => setTxCategoryId(event.target.value)}
              required
              disabled={categoriesByKind[txKind].length === 0}
            >
              {categoriesByKind[txKind].map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
            {txKind === 'transfer' ? (
              <TextField
                select
                label="Direction"
                value={txTransferDirection}
                onChange={(event) => setTxTransferDirection(event.target.value as TransferDirection)}
              >
                <MenuItem value="out">Money out</MenuItem>
                <MenuItem value="in">Money in</MenuItem>
              </TextField>
            ) : null}
            <TextField
              label="Description / payee"
              value={txDescription}
              onChange={(event) => setTxDescription(event.target.value)}
            />
            <TextField label="Note" value={txNote} onChange={(event) => setTxNote(event.target.value)} />
            {createTransactionMutation.isError ? (
              <Alert severity="error">{(createTransactionMutation.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => createTransactionMutation.mutate()}
            disabled={createTransactionMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth>
        <DialogTitle>Mark Commitment Paid</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Commitment"
              value={selectedPayCommitment?.name ?? 'Unknown commitment'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Category"
              value={selectedPayCategory?.name ?? 'Unknown category'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Paid date"
              type="date"
              value={payDate}
              onChange={(event) => setPayDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={`Amount (${selectedPayInstance?.expectedMoney.currency ?? 'GBP'})`}
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
            />
            {selectedPayCategory?.kind === 'transfer' ? (
              <TextField
                select
                label="Transfer direction"
                value={payTransferDirection}
                onChange={(event) => setPayTransferDirection(event.target.value as TransferDirection)}
              >
                <MenuItem value="out">Money out</MenuItem>
                <MenuItem value="in">Money in</MenuItem>
              </TextField>
            ) : null}
            {markPaidMutation.isError ? (
              <Alert severity="error">{(markPaidMutation.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => markPaidMutation.mutate()}
            disabled={markPaidMutation.isPending || !payInstanceId}
          >
            Create Transaction
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
