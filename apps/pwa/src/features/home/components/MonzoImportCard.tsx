import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';

import { useMonzoConnectStartMutation } from '../hooks/useHomeMutations.js';
import { useHomeMonzoStatusQuery } from '../hooks/useHomeQueries.js';

const errorMessage = (value: unknown): string =>
  value instanceof Error ? value.message : 'Request failed.';

const isLikelyMobileBrowser = (): boolean => {
  const ua = globalThis.navigator?.userAgent ?? '';
  return /iPhone|iPad|iPod|Android/i.test(ua);
};

export const MonzoImportCard = () => {
  const monzoStatusQuery = useHomeMonzoStatusQuery();
  const connectMutation = useMonzoConnectStartMutation();
  const monzoStatus = monzoStatusQuery.data;

  const isInitialLoading = monzoStatusQuery.isLoading && !monzoStatus;
  const hasBlockingError = monzoStatusQuery.isError && !monzoStatus;

  const handleConnectClick = async () => {
    const payload = await connectMutation.mutateAsync();

    if (isLikelyMobileBrowser()) {
      // iOS/Safari is less reliable with popup navigation after async work.
      globalThis.location?.assign(payload.authUrl);
      return;
    }

    const opened = globalThis.open?.(payload.authUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      globalThis.location?.assign(payload.authUrl);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <CloudSyncOutlinedIcon color="info" />
          <Typography variant="subtitle1" fontWeight={700}>
            Monzo Import
          </Typography>
          {monzoStatus ? (
            <Chip
              size="small"
              color={monzoStatus.connected ? 'success' : 'default'}
              label={monzoStatus.status ?? 'unknown'}
              sx={{ textTransform: 'capitalize' }}
            />
          ) : null}
        </Stack>

        {isInitialLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : hasBlockingError ? (
          <Alert severity="error">Unable to load Monzo status.</Alert>
        ) : !monzoStatus ? (
          <Alert severity="error">Monzo status unavailable.</Alert>
        ) : (
          <>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              {monzoStatus.configured
                ? monzoStatus.connected
                  ? `Connected${monzoStatus.accountId ? ` • ${monzoStatus.accountId}` : ''}`
                  : 'Configured but not connected'
                : 'Set MONZO_CLIENT_ID, MONZO_CLIENT_SECRET and MONZO_REDIRECT_URI on the API server'}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Last sync:{' '}
              {monzoStatus.lastSyncAt ? new Date(monzoStatus.lastSyncAt).toLocaleString() : 'Never'}
            </Typography>

            {monzoStatus.lastError ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {monzoStatus.lastError}
              </Alert>
            ) : null}

            {connectMutation.isError ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {errorMessage(connectMutation.error)}
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="outlined"
                onClick={() => void handleConnectClick()}
                disabled={!monzoStatus.configured || connectMutation.isPending}
              >
                Connect
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
};
