import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { api } from '../api.js';

export const HomePage = () => {
  const trendQuery = useQuery({
    queryKey: ['report', 'trends'],
    queryFn: () => api.reports.trends(),
  });

  const dueQuery = useQuery({
    queryKey: ['commitments', 'instances', 'pending'],
    queryFn: () => api.commitments.instances('pending'),
  });

  if (trendQuery.isLoading || dueQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (trendQuery.isError || dueQuery.isError) {
    return <Alert severity="error">Unable to load dashboard data.</Alert>;
  }

  const trendData = trendQuery.data ?? [];
  const dueData = dueQuery.data ?? [];
  const latestTrend = trendData.at(-1);

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
