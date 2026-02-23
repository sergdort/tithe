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
import { useEffect, useMemo, useRef, useState } from 'react';

import { toDateInputValue } from '../../../lib/date/date-input.js';
import { buildMarkCommitmentPaidPayload } from '../form-payloads.js';
import { useMarkCommitmentPaidMutation } from '../hooks/useHomeMutations.js';
import { useHomeCommitmentReferenceQueries } from '../hooks/useHomeQueries.js';
import {
  indexCategoriesById,
  indexCommitmentsById,
  selectPayDialogSelection,
} from '../selectors.js';
import type { HomeTransferDirection } from '../types.js';

interface MarkCommitmentPaidDialogProps {
  open: boolean;
  instanceId: string | null;
  onClose: () => void;
}

const getErrorMessage = (value: unknown): string =>
  value instanceof Error ? value.message : 'Unable to create commitment transaction.';

export const MarkCommitmentPaidDialog = ({
  open,
  instanceId,
  onClose,
}: MarkCommitmentPaidDialogProps) => {
  const { dueQuery, commitmentsQuery, categoriesQuery } = useHomeCommitmentReferenceQueries();
  const markPaidMutation = useMarkCommitmentPaidMutation();

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => toDateInputValue(new Date()));
  const [payTransferDirection, setPayTransferDirection] = useState<HomeTransferDirection>('out');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initializedInstanceIdRef = useRef<string | null>(null);

  const dueData = dueQuery.data ?? [];
  const commitments = commitmentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const commitmentsById = useMemo(() => indexCommitmentsById(commitments), [commitments]);
  const categoriesById = useMemo(() => indexCategoriesById(categories), [categories]);

  const selection = useMemo(
    () =>
      selectPayDialogSelection({
        instanceId,
        dueInstances: dueData,
        commitmentsById,
        categoriesById,
      }),
    [categoriesById, commitmentsById, dueData, instanceId],
  );

  useEffect(() => {
    if (!open) {
      initializedInstanceIdRef.current = null;
      setSubmitError(null);
      return;
    }

    if (!instanceId || !selection?.instance) {
      return;
    }

    if (initializedInstanceIdRef.current === instanceId) {
      return;
    }

    initializedInstanceIdRef.current = instanceId;
    setPayAmount((selection.instance.expectedMoney.amountMinor / 100).toFixed(2));
    setPayDate(toDateInputValue(new Date(selection.instance.dueAt)));
    setPayTransferDirection('out');
    setSubmitError(null);
  }, [instanceId, open, selection]);

  const handleSubmit = () => {
    setSubmitError(null);

    try {
      const payload = buildMarkCommitmentPaidPayload({
        selection,
        amountText: payAmount,
        dateInput: payDate,
        transferDirection: payTransferDirection,
      });

      markPaidMutation.mutate(payload, {
        onSuccess: () => {
          setPayAmount('');
          setPayDate(toDateInputValue(new Date()));
          setPayTransferDirection('out');
          setSubmitError(null);
          onClose();
        },
      });
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  };

  const selectedCommitment = selection?.commitment ?? null;
  const selectedCategory = selection?.category ?? null;
  const selectedInstance = selection?.instance ?? null;

  const anyLoading = dueQuery.isLoading || commitmentsQuery.isLoading || categoriesQuery.isLoading;
  const anyError = dueQuery.isError || commitmentsQuery.isError || categoriesQuery.isError;
  const visibleError =
    submitError ?? (markPaidMutation.isError ? getErrorMessage(markPaidMutation.error) : null);

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>Mark Commitment Paid</DialogTitle>
      <DialogContent>
        {anyLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {anyError ? <Alert severity="error">Unable to load commitment details.</Alert> : null}

            <TextField
              label="Commitment"
              value={selectedCommitment?.name ?? 'Unknown commitment'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Category"
              value={selectedCategory?.name ?? 'Unknown category'}
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Paid date"
              type="date"
              value={payDate}
              onChange={(event) => setPayDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={`Amount (${selectedInstance?.expectedMoney.currency ?? 'GBP'})`}
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 0.01 }}
            />
            {selectedCategory?.kind === 'transfer' ? (
              <TextField
                select
                label="Transfer direction"
                value={payTransferDirection}
                onChange={(event) =>
                  setPayTransferDirection(event.target.value as HomeTransferDirection)
                }
              >
                <MenuItem value="out">Money out</MenuItem>
                <MenuItem value="in">Money in</MenuItem>
              </TextField>
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
          disabled={markPaidMutation.isPending || anyLoading || !instanceId || !selection}
        >
          Create Transaction
        </Button>
      </DialogActions>
    </Dialog>
  );
};
