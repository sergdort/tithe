import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';

import type { MonthWindow } from '../../../lib/date/month.js';
import { pounds, signedPounds } from '../../../lib/format/money.js';
import { useHomeMonthlyLedgerQuery } from '../hooks/useHomeQueries.js';
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

export const MonthlyLedgerCard = ({
  monthWindow,
  onPreviousMonth,
  onNextMonth,
  onAddTransaction,
}: MonthlyLedgerCardProps) => {
  const ledgerQuery = useHomeMonthlyLedgerQuery(monthWindow);
  const ledger = ledgerQuery.data;

  const isInitialLoading = ledgerQuery.isLoading && !ledger;
  const hasBlockingError = ledgerQuery.isError && !ledger;

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
