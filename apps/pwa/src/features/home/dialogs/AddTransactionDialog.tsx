import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { toDateInputValue } from '../../../lib/date/date-input.js';
import { buildAddTransactionPayload } from '../form-payloads.js';
import { useCreateHomeTransactionMutation } from '../hooks/useHomeMutations.js';
import { useHomeCategoriesQuery } from '../hooks/useHomeQueries.js';
import { groupCategoriesByKind } from '../selectors.js';
import type { HomeTransferDirection, TransactionKind, TransferSemanticKind } from '../types.js';

interface AddTransactionDialogProps {
  open: boolean;
  onClose: () => void;
}

const getErrorMessage = (value: unknown): string =>
  value instanceof Error ? value.message : 'Unable to save transaction.';

export const AddTransactionDialog = ({ open, onClose }: AddTransactionDialogProps) => {
  const categoriesQuery = useHomeCategoriesQuery();
  const createTransactionMutation = useCreateHomeTransactionMutation();

  const [txKind, setTxKind] = useState<TransactionKind>('expense');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(() => toDateInputValue(new Date()));
  const [txDescription, setTxDescription] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txTransferDirection, setTxTransferDirection] = useState<HomeTransferDirection>('out');
  const [txTransferSemanticKind, setTxTransferSemanticKind] =
    useState<TransferSemanticKind>('transfer_external');
  const [txReimbursable, setTxReimbursable] = useState(false);
  const [txMyShare, setTxMyShare] = useState('0');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const categories = categoriesQuery.data ?? [];
  const categoriesByKind = useMemo(() => groupCategoriesByKind(categories), [categories]);

  useEffect(() => {
    const available = categoriesByKind[txKind];
    if (available.length === 0) {
      setTxCategoryId('');
      return;
    }

    if (!available.some((item) => item.id === txCategoryId)) {
      setTxCategoryId(available[0]?.id ?? '');
    }
  }, [categoriesByKind, txCategoryId, txKind]);

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
    }
  }, [open]);

  const selectedCategory = categories.find((category) => category.id === txCategoryId) ?? null;
  const selectedCategoryReimbursementMode =
    txKind === 'expense' ? (selectedCategory?.reimbursementMode ?? 'none') : 'none';

  useEffect(() => {
    if (selectedCategoryReimbursementMode === 'always') {
      setTxReimbursable(true);
      return;
    }

    if (selectedCategoryReimbursementMode === 'optional') {
      setTxReimbursable(true);
      return;
    }

    setTxReimbursable(false);
  }, [selectedCategoryReimbursementMode, txKind, txCategoryId]);

  const resetAfterSuccess = () => {
    setTxAmount('');
    setTxDescription('');
    setTxNote('');
    setTxDate(toDateInputValue(new Date()));
    setTxTransferDirection('out');
    setTxTransferSemanticKind('transfer_external');
    setTxReimbursable(false);
    setTxMyShare('0');
    setSubmitError(null);
  };

  const handleSubmit = () => {
    setSubmitError(null);

    try {
      const payload = buildAddTransactionPayload({
        kind: txKind,
        categoryId: txCategoryId,
        amountText: txAmount,
        dateInput: txDate,
        description: txDescription,
        note: txNote,
        transferDirection: txTransferDirection,
        transferSemanticKind: txTransferSemanticKind,
        reimbursable: txReimbursable,
        myShareText: txMyShare,
      });

      createTransactionMutation.mutate(payload, {
        onSuccess: () => {
          resetAfterSuccess();
          onClose();
        },
      });
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  };

  const visibleError =
    submitError ??
    (createTransactionMutation.isError ? getErrorMessage(createTransactionMutation.error) : null);
  const showInitialLoading = categoriesQuery.isLoading && categories.length === 0;
  const availableCategories = categoriesByKind[txKind];

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>Add Transaction</DialogTitle>
      <DialogContent>
        {showInitialLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Type"
              value={txKind}
              onChange={(event) => setTxKind(event.target.value as TransactionKind)}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </TextField>
            <TextField
              label="Date"
              type="date"
              value={txDate}
              onChange={(event) => setTxDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
            <TextField
              label="Amount (GBP)"
              value={txAmount}
              onChange={(event) => setTxAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
              required
            />
            <TextField
              select
              label="Category"
              value={txCategoryId}
              onChange={(event) => setTxCategoryId(event.target.value)}
              required
              disabled={availableCategories.length === 0 || categoriesQuery.isError}
            >
              {availableCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
            {txKind === 'transfer' ? (
              <>
                <TextField
                  select
                  label="Transfer type"
                  value={txTransferSemanticKind}
                  onChange={(event) =>
                    setTxTransferSemanticKind(event.target.value as TransferSemanticKind)
                  }
                >
                  <MenuItem value="transfer_external">External transfer</MenuItem>
                  <MenuItem value="transfer_internal">Internal transfer</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Direction"
                  value={txTransferDirection}
                  onChange={(event) =>
                    setTxTransferDirection(event.target.value as HomeTransferDirection)
                  }
                >
                  <MenuItem value="out">Money out</MenuItem>
                  <MenuItem value="in">Money in</MenuItem>
                </TextField>
              </>
            ) : null}
            {txKind === 'expense' && selectedCategoryReimbursementMode !== 'none' ? (
              <>
                {selectedCategoryReimbursementMode === 'optional' ? (
                  <TextField
                    select
                    label="Track reimbursement"
                    value={txReimbursable ? 'yes' : 'no'}
                    onChange={(event) => setTxReimbursable(event.target.value === 'yes')}
                  >
                    <MenuItem value="yes">Yes</MenuItem>
                    <MenuItem value="no">No</MenuItem>
                  </TextField>
                ) : null}
                {txReimbursable ? (
                  <TextField
                    label="My share (GBP)"
                    value={txMyShare}
                    onChange={(event) => setTxMyShare(event.target.value)}
                    inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
                    helperText="The portion that belongs to you (not expected back)."
                  />
                ) : null}
              </>
            ) : null}
            <TextField
              label="Description / payee"
              value={txDescription}
              onChange={(event) => setTxDescription(event.target.value)}
            />
            <TextField
              label="Note"
              value={txNote}
              onChange={(event) => setTxNote(event.target.value)}
            />

            {categoriesQuery.isError ? (
              <Alert severity="error">Unable to load categories.</Alert>
            ) : null}
            {visibleError ? <Alert severity="error">{visibleError}</Alert> : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            createTransactionMutation.isPending || showInitialLoading || categoriesQuery.isError
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
