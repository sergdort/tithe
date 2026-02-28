import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

import type { MonthWindow } from '../../../lib/date/month.js';
import { pounds, signedPounds } from '../../../lib/format/money.js';
import { useMonzoSyncMutation } from '../hooks/useHomeMutations.js';
import { useHomeMonthlyLedgerQuery, useHomeMonzoStatusQuery } from '../hooks/useHomeQueries.js';
import { MonthNavigator } from './MonthNavigator.js';

interface MonthlyLedgerCardProps {
  monthWindow: MonthWindow;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onAddTransaction: () => void;
}

interface LedgerCategorySectionProps {
  title: string;
  titleColor: string;
  emptyLabel: string;
  rows: Array<{
    categoryId: string;
    categoryName: string;
    totalMinor: number;
    txCount: number;
  }>;
  rowAmountColor?: string;
}

const LedgerCategorySection = ({
  title,
  titleColor,
  emptyLabel,
  rows,
  rowAmountColor,
}: LedgerCategorySectionProps) => (
  <Box>
    <Typography variant="subtitle2" fontWeight={700} color={titleColor} sx={{ mb: 0.5 }}>
      {title}
    </Typography>
    {rows.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    ) : (
      <List disablePadding>
        {rows.map((item) => (
          <ListItem
            key={`${title.toLowerCase()}-${item.categoryId}`}
            disableGutters
            sx={{ py: 0.35 }}
          >
            <ListItemText
              primary={item.categoryName}
              secondary={`${item.txCount} tx`}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, color: rowAmountColor }}>
              {pounds(item.totalMinor)}
            </Typography>
          </ListItem>
        ))}
      </List>
    )}
  </Box>
);

const LedgerTransferSection = ({
  rows,
}: {
  rows: Array<{
    categoryId: string;
    categoryName: string;
    direction: 'in' | 'out';
    totalMinor: number;
    txCount: number;
  }>;
}) => (
  <Box>
    <Typography variant="subtitle2" fontWeight={700} color="info.dark" sx={{ mb: 0.5 }}>
      Transfers
    </Typography>
    {rows.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No transfers recorded.
      </Typography>
    ) : (
      <List disablePadding>
        {rows.map((item) => (
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
);

const errorMessage = (value: unknown): string =>
  value instanceof Error ? value.message : 'Request failed.';

export const MonthlyLedgerCard = ({
  monthWindow,
  onPreviousMonth,
  onNextMonth,
  onAddTransaction,
}: MonthlyLedgerCardProps) => {
  const ledgerQuery = useHomeMonthlyLedgerQuery(monthWindow);
  const monzoStatusQuery = useHomeMonzoStatusQuery();
  const syncMutation = useMonzoSyncMutation();
  const ledger = ledgerQuery.data;
  const monzoStatus = monzoStatusQuery.data;
  const monthKey = `${monthWindow.from}|${monthWindow.to}`;
  const resetSyncMutation = syncMutation.reset;
  const [visibleSyncFeedbackMonthKey, setVisibleSyncFeedbackMonthKey] = useState<string | null>(
    null,
  );
  const [spendMode, setSpendMode] = useState<'gross' | 'net'>('net');
  const [excludeInternalTransfers, setExcludeInternalTransfers] = useState(true);

  const isInitialLoading = ledgerQuery.isLoading && !ledger;
  const hasBlockingError = ledgerQuery.isError && !ledger;
  const syncDisabled = !monzoStatus?.connected || syncMutation.isPending;
  const showSyncFeedback = visibleSyncFeedbackMonthKey === monthKey;

  useEffect(() => {
    setVisibleSyncFeedbackMonthKey((current) => (current === monthKey ? current : null));
    resetSyncMutation();
  }, [monthKey, resetSyncMutation]);

  const handleSyncMonth = () => {
    setVisibleSyncFeedbackMonthKey(monthKey);
    syncMutation.mutate({
      from: monthWindow.from,
      to: monthWindow.to,
      overrideExisting: true,
    });
  };

  const cashFlow = ledger?.cashFlow;
  const spending = ledger?.spending;
  const reimbursements = ledger?.reimbursements;

  const displayCashInMinor = ledger
    ? excludeInternalTransfers
      ? (cashFlow?.cashInMinor ?? ledger.totals.incomeMinor)
      : (cashFlow?.cashInMinor ?? ledger.totals.incomeMinor) +
        (cashFlow?.internalTransferInMinor ?? 0)
    : 0;
  const displayCashOutMinor = ledger
    ? excludeInternalTransfers
      ? (cashFlow?.cashOutMinor ?? ledger.totals.expenseMinor)
      : (cashFlow?.cashOutMinor ?? ledger.totals.expenseMinor) +
        (cashFlow?.internalTransferOutMinor ?? 0)
    : 0;
  const displayNetFlowMinor = ledger
    ? excludeInternalTransfers
      ? (cashFlow?.netFlowMinor ?? ledger.totals.netCashMovementMinor)
      : (cashFlow?.netFlowMinor ?? ledger.totals.netCashMovementMinor) +
        (cashFlow?.internalTransferInMinor ?? 0) -
        (cashFlow?.internalTransferOutMinor ?? 0)
    : 0;
  const displayTrueSpendMinor = ledger
    ? spendMode === 'gross'
      ? (spending?.grossSpendMinor ?? ledger.totals.expenseMinor)
      : (spending?.netPersonalSpendMinor ?? ledger.totals.expenseMinor)
    : 0;
  const reimbursementOutstandingMinor = reimbursements?.outstandingMinor ?? 0;

  return (
    <Card>
      <CardContent>
        <MonthNavigator
          label={monthWindow.label}
          onPreviousMonth={onPreviousMonth}
          onNextMonth={onNextMonth}
          onAddTransaction={onAddTransaction}
        />

        <Typography variant="caption" color="text.secondary">
          Monthly cashflow ledger (actual transactions only)
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Pending Monzo card transactions are excluded from totals until settled.
        </Typography>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Monzo sync for this month overwrites existing imported transactions.
          </Typography>
          <Button variant="outlined" size="small" onClick={handleSyncMonth} disabled={syncDisabled}>
            Sync month
          </Button>
        </Stack>

        {monzoStatusQuery.isError ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Monzo status unavailable. Month sync is disabled.
          </Alert>
        ) : !monzoStatus?.connected ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Connect Monzo to sync transactions into this month.
          </Alert>
        ) : null}

        {showSyncFeedback && syncMutation.isError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {errorMessage(syncMutation.error)}
          </Alert>
        ) : null}

        {showSyncFeedback && syncMutation.isSuccess ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Imported {syncMutation.data.imported}, updated {syncMutation.data.updated}, skipped{' '}
            {syncMutation.data.skipped}.
          </Alert>
        ) : null}

        {isInitialLoading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : hasBlockingError ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            Unable to load monthly cashflow ledger.
          </Alert>
        ) : !ledger ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            Ledger data unavailable.
          </Alert>
        ) : (
          <>
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="caption" color="text.secondary">
                  Spend mode
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant={spendMode === 'net' ? 'contained' : 'outlined'}
                    onClick={() => setSpendMode('net')}
                  >
                    Net
                  </Button>
                  <Button
                    size="small"
                    variant={spendMode === 'gross' ? 'contained' : 'outlined'}
                    onClick={() => setSpendMode('gross')}
                  >
                    Gross
                  </Button>
                </Stack>
              </Stack>
              <FormControlLabel
                sx={{ my: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={excludeInternalTransfers}
                    onChange={(event) => setExcludeInternalTransfers(event.target.checked)}
                  />
                }
                label="Exclude internal transfers"
              />
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={0.75}>
              <Stack direction="row" justifyContent="space-between">
                <Typography>Cash In</Typography>
                <Typography sx={{ fontWeight: 700, color: 'success.main' }}>
                  {pounds(displayCashInMinor)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography>Cash Out</Typography>
                <Typography sx={{ fontWeight: 700, color: 'error.main' }}>
                  {pounds(displayCashOutMinor)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography>Net Flow</Typography>
                <Typography
                  sx={{
                    fontWeight: 700,
                    color: displayNetFlowMinor >= 0 ? 'info.main' : 'error.main',
                  }}
                >
                  {signedPounds(displayNetFlowMinor)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography>True Spend</Typography>
                <Typography sx={{ fontWeight: 700, color: 'error.main' }}>
                  {pounds(displayTrueSpendMinor)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography>Reimbursement Outstanding</Typography>
                <Typography sx={{ fontWeight: 700, color: 'warning.main' }}>
                  {pounds(reimbursementOutstandingMinor)}
                </Typography>
              </Stack>
            </Stack>

            <Divider sx={{ my: 1.5 }} />

            <Stack spacing={0.75}>
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
                    color: ledger.totals.operatingSurplusMinor >= 0 ? 'success.main' : 'error.main',
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
              <LedgerCategorySection
                title="Income"
                titleColor="success.dark"
                emptyLabel="No income recorded."
                rows={ledger.sections.income}
                rowAmountColor="success.main"
              />

              <LedgerCategorySection
                title="Expenses"
                titleColor="error.dark"
                emptyLabel="No expenses recorded."
                rows={ledger.sections.expense}
              />

              <LedgerTransferSection rows={ledger.sections.transfer} />
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};
