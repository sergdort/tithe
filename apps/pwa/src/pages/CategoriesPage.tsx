import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../api.js';

export const CategoriesPage = () => {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>('expense');

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const createCategory = useMutation({
    mutationFn: () => api.categories.create({ name, kind }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  if (categoriesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (categoriesQuery.isError) {
    return <Alert severity="error">Unable to load categories.</Alert>;
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700}>
            Add Category
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              select
              label="Kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => createCategory.mutate()}
              disabled={createCategory.isPending || name.trim().length === 0}
            >
              Add Category
            </Button>
            {createCategory.isError ? (
              <Alert severity="error">{(createCategory.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Category List
          </Typography>
          <List disablePadding>
            {categories.map((category) => (
              <ListItem key={category.id} disableGutters>
                <ListItemText primary={category.name} secondary={category.kind} />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
};
