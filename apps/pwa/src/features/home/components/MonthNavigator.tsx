import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Button, IconButton, Stack, Typography } from '@mui/material';

interface MonthNavigatorProps {
  label: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onAddTransaction: () => void;
}

export const MonthNavigator = ({
  label,
  onPreviousMonth,
  onNextMonth,
  onAddTransaction,
}: MonthNavigatorProps) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <IconButton aria-label="Previous month" onClick={onPreviousMonth}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="subtitle1" fontWeight={700} sx={{ minWidth: 140, textAlign: 'center' }}>
        {label}
      </Typography>
      <IconButton aria-label="Next month" onClick={onNextMonth}>
        <ChevronRightIcon />
      </IconButton>
    </Stack>
    <Button variant="contained" startIcon={<AddIcon />} onClick={onAddTransaction}>
      Add
    </Button>
  </Stack>
);
