import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { api } from '../api.js';

export const InsightsPage = () => {
  const trendsQuery = useQuery({
    queryKey: ['report', 'trends'],
    queryFn: () => api.reports.trends(),
  });

  const categoryBreakdownQuery = useQuery({
    queryKey: ['report', 'categoryBreakdown'],
    queryFn: () => api.reports.categoryBreakdown(),
  });

  if (trendsQuery.isLoading || categoryBreakdownQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (trendsQuery.isError || categoryBreakdownQuery.isError) {
    return <Alert severity="error">Unable to load insights.</Alert>;
  }

  const trends = trendsQuery.data ?? [];
  const categoryBreakdown = categoryBreakdownQuery.data ?? [];

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Monthly Trend
          </Typography>
          <List disablePadding>
            {trends.map((trend) => (
              <ListItem key={trend.month} disableGutters>
                <ListItemText
                  primary={trend.month}
                  secondary={`${trend.spendBaseMinor / 100} total across ${trend.txCount} records`}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Category Breakdown
          </Typography>
          <List disablePadding>
            {categoryBreakdown.map((item) => (
              <ListItem key={item.categoryId} disableGutters>
                <ListItemText
                  primary={item.categoryName}
                  secondary={`${item.totalMinor / 100} across ${item.txCount} transactions`}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
};
