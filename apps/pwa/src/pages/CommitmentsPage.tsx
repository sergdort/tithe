import AutorenewIcon from '@mui/icons-material/Autorenew';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api.js';

export const CommitmentsPage = () => {
  const queryClient = useQueryClient();

  const commitmentsQuery = useQuery({
    queryKey: ['commitments'],
    queryFn: () => api.commitments.list(),
  });

  const instancesQuery = useQuery({
    queryKey: ['commitmentInstances', 'pending'],
    queryFn: () => api.commitments.instances('pending'),
  });

  const runDueMutation = useMutation({
    mutationFn: () => api.commitments.runDue(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commitments'] }),
        queryClient.invalidateQueries({ queryKey: ['commitmentInstances', 'pending'] }),
      ]);
    },
  });

  if (commitmentsQuery.isLoading || instancesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (commitmentsQuery.isError || instancesQuery.isError) {
    return <Alert severity="error">Unable to load commitments.</Alert>;
  }

  const commitments = commitmentsQuery.data ?? [];
  const instances = instancesQuery.data ?? [];

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Recurring Commitments
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AutorenewIcon />}
              onClick={() => runDueMutation.mutate()}
              disabled={runDueMutation.isPending}
            >
              Run Due
            </Button>
          </Stack>
          <List disablePadding>
            {commitments.map((item) => (
              <ListItem key={item.id} disableGutters>
                <ListItemText
                  primary={item.name}
                  secondary={`${item.defaultMoney.amountMinor / 100} ${item.defaultMoney.currency} • ${item.rrule}`}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Due Items
          </Typography>
          {instances.length === 0 ? (
            <Typography color="text.secondary">No pending items.</Typography>
          ) : (
            <List disablePadding>
              {instances.map((item) => (
                <ListItem key={item.id} disableGutters>
                  <ListItemText
                    primary={`${item.expectedMoney.amountMinor / 100} ${item.expectedMoney.currency}`}
                    secondary={`${new Date(item.dueAt).toLocaleDateString()} • ${item.status}`}
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
