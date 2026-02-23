import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';

import { pounds } from '../../../lib/format/money.js';
import { useHomeCommitmentReferenceQueries } from '../hooks/useHomeQueries.js';
import {
  indexCategoriesById,
  indexCommitmentsById,
  selectUpcomingCommitmentPreviewRows,
} from '../selectors.js';

interface UpcomingCommitmentsCardProps {
  onMarkPaid: (instanceId: string) => void;
}

export const UpcomingCommitmentsCard = ({ onMarkPaid }: UpcomingCommitmentsCardProps) => {
  const { dueQuery, commitmentsQuery, categoriesQuery } = useHomeCommitmentReferenceQueries();

  const dueData = dueQuery.data ?? [];
  const commitments = commitmentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const commitmentsById = useMemo(() => indexCommitmentsById(commitments), [commitments]);
  const categoriesById = useMemo(() => indexCategoriesById(categories), [categories]);

  const rows = useMemo(
    () =>
      selectUpcomingCommitmentPreviewRows({
        dueInstances: dueData,
        commitmentsById,
        categoriesById,
        limit: 8,
      }),
    [categoriesById, commitmentsById, dueData],
  );

  const anyLoading = dueQuery.isLoading || commitmentsQuery.isLoading || categoriesQuery.isLoading;
  const anyError = dueQuery.isError || commitmentsQuery.isError || categoriesQuery.isError;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <AccessTimeOutlinedIcon color="secondary" />
          <Typography variant="subtitle1" fontWeight={700}>
            Upcoming Commitments
          </Typography>
        </Stack>

        {anyLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : anyError ? (
          <Alert severity="error">Unable to load upcoming commitments.</Alert>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">No pending commitments.</Typography>
        ) : (
          <List disablePadding>
            {rows.map((row) => (
              <ListItem key={row.id} disableGutters sx={{ alignItems: 'flex-start', gap: 1 }}>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.4 }}>
                  <ReceiptLongOutlinedIcon fontSize="small" color="action" />
                </ListItemIcon>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {row.commitmentName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {new Date(row.dueAt).toLocaleDateString()} •{' '}
                    {pounds(row.expectedAmountMinor, row.currency)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {row.categoryLine}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => onMarkPaid(row.id)}
                  sx={{ minWidth: 86, minHeight: 36 }}
                >
                  Mark paid
                </Button>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
};
