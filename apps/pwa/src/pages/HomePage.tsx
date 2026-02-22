import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api.js';

export const HomePage = () => {
  const queryClient = useQueryClient();

  const trendQuery = useQuery({
    queryKey: ['report', 'trends'],
    queryFn: () => api.reports.trends(),
  });

  const dueQuery = useQuery({
    queryKey: ['commitments', 'instances', 'pending'],
    queryFn: () => api.commitments.instances('pending'),
  });

  const monzoStatusQuery = useQuery({
    queryKey: ['monzo', 'status'],
    queryFn: () => api.monzo.status(),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.monzo.connectStart(),
    onSuccess: (payload) => {
      const popup = globalThis.open?.(payload.authUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        globalThis.location?.assign(payload.authUrl);
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.monzo.syncNow(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monzo', 'status'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ]);
    },
  });

  if (trendQuery.isLoading || dueQuery.isLoading || monzoStatusQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (trendQuery.isError || dueQuery.isError || monzoStatusQuery.isError) {
    return <Alert severity="error">Unable to load dashboard data.</Alert>;
  }

  const trendData = trendQuery.data ?? [];
  const dueData = dueQuery.data ?? [];
  const latestTrend = trendData.at(-1);
  const monzoStatus = monzoStatusQuery.data;

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TrendingUpIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>
              Monthly Snapshot
            </Typography>
          </Stack>
          <Typography variant="h4" fontWeight={700}>
            {(latestTrend?.spendBaseMinor ?? 0) / 100}
          </Typography>
          <Typography color="text.secondary">Base-currency spend this month</Typography>
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
              color={monzoStatus?.connected ? 'success' : 'default'}
              label={monzoStatus?.status ?? 'unknown'}
              sx={{ textTransform: 'capitalize' }}
            />
          </Stack>

          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {monzoStatus?.configured
              ? monzoStatus.connected
                ? `Connected${monzoStatus.accountId ? ` • ${monzoStatus.accountId}` : ''}`
                : 'Configured but not connected'
              : 'Set MONZO_CLIENT_ID, MONZO_CLIENT_SECRET and MONZO_REDIRECT_URI on the API server'}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            Last sync:{' '}
            {monzoStatus?.lastSyncAt ? new Date(monzoStatus.lastSyncAt).toLocaleString() : 'Never'}
          </Typography>

          {monzoStatus?.lastError ? (
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
              Imported {syncMutation.data.imported} transactions, skipped{' '}
              {syncMutation.data.skipped}.
            </Alert>
          ) : null}

          <Divider sx={{ my: 1.5 }} />

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              onClick={() => connectMutation.mutate()}
              disabled={!monzoStatus?.configured || connectMutation.isPending}
            >
              Connect
            </Button>
            <Button
              variant="contained"
              onClick={() => syncMutation.mutate()}
              disabled={!monzoStatus?.connected || syncMutation.isPending}
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
              {dueData.slice(0, 5).map((item) => (
                <ListItem key={item.id} disableGutters>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <AccessTimeOutlinedIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={new Date(item.dueAt).toLocaleDateString()}
                    secondary={`${item.expectedMoney.amountMinor / 100} ${item.expectedMoney.currency}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
};
