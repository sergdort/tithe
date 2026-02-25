import CategoryIcon from '@mui/icons-material/Category';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { CATEGORY_ICON_COMPONENTS, CATEGORY_ICON_OPTIONS } from '../constants.js';
import { useCreateCategoryMutation } from '../hooks/useCategoriesMutations.js';
import type { CategoryKind } from '../types.js';
import { getErrorMessage, parseNullableNonNegativeInt } from '../utils.js';

interface AddCategoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AddCategoryDialog = ({ open, onClose }: AddCategoryDialogProps) => {
  const createCategory = useCreateCategoryMutation();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [reimbursementMode, setReimbursementMode] = useState<'none' | 'optional' | 'always'>(
    'none',
  );
  const [icon, setIcon] = useState<string>('savings');
  const [defaultCounterpartyType, setDefaultCounterpartyType] = useState<
    'self' | 'partner' | 'team' | 'other' | null
  >(null);
  const [defaultRecoveryWindowDaysText, setDefaultRecoveryWindowDaysText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setKind('expense');
    setReimbursementMode('none');
    setIcon('savings');
    setDefaultCounterpartyType(null);
    setDefaultRecoveryWindowDaysText('');
    setSubmitError(null);
  };

  const handleClose = () => {
    createCategory.reset();
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = () => {
    setSubmitError(null);

    try {
      const payload = {
        name: name.trim(),
        kind,
        icon,
        ...(kind === 'expense'
          ? {
              reimbursementMode,
              defaultCounterpartyType:
                reimbursementMode === 'none' ? null : defaultCounterpartyType,
              defaultRecoveryWindowDays:
                reimbursementMode === 'none'
                  ? null
                  : parseNullableNonNegativeInt(defaultRecoveryWindowDaysText),
            }
          : {}),
      };

      createCategory.mutate(payload, {
        onSuccess: () => {
          resetForm();
          handleClose();
        },
      });
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Failed to create category.'));
    }
  };

  const visibleError =
    submitError ??
    (createCategory.isError
      ? getErrorMessage(createCategory.error, 'Failed to create category.')
      : null);

  const handleReimbursementModeChange = (nextMode: typeof reimbursementMode) => {
    setReimbursementMode(nextMode);

    if (nextMode === 'none') {
      setDefaultCounterpartyType(null);
      setDefaultRecoveryWindowDaysText('');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth>
      <DialogTitle>Add Category</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            select
            label="Kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as CategoryKind)}
          >
            <MenuItem value="expense">Expense</MenuItem>
            <MenuItem value="income">Income</MenuItem>
            <MenuItem value="transfer">Transfer</MenuItem>
          </TextField>
          <TextField
            select
            label="Icon"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
          >
            {CATEGORY_ICON_OPTIONS.map((iconName) => {
              const IconComponent = CATEGORY_ICON_COMPONENTS[iconName] ?? CategoryIcon;
              return (
                <MenuItem key={iconName} value={iconName}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconComponent fontSize="small" />
                    <Typography variant="body2">{iconName}</Typography>
                  </Stack>
                </MenuItem>
              );
            })}
          </TextField>
          {kind === 'expense' ? (
            <TextField
              select
              label="Reimbursement Mode"
              value={reimbursementMode}
              onChange={(event) =>
                handleReimbursementModeChange(event.target.value as typeof reimbursementMode)
              }
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="optional">Optional</MenuItem>
              <MenuItem value="always">Always</MenuItem>
            </TextField>
          ) : null}
          {kind === 'expense' && reimbursementMode !== 'none' ? (
            <>
              <TextField
                select
                label="Default Counterparty"
                value={defaultCounterpartyType ?? '__none'}
                onChange={(event) =>
                  setDefaultCounterpartyType(
                    event.target.value === '__none'
                      ? null
                      : (event.target.value as typeof defaultCounterpartyType),
                  )
                }
              >
                <MenuItem value="__none">None</MenuItem>
                <MenuItem value="self">Self</MenuItem>
                <MenuItem value="partner">Partner</MenuItem>
                <MenuItem value="team">Team</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
              <TextField
                label="Default Recovery Window (days)"
                type="number"
                value={defaultRecoveryWindowDaysText}
                onChange={(event) => setDefaultRecoveryWindowDaysText(event.target.value)}
                inputProps={{ min: 0 }}
              />
            </>
          ) : null}
          {visibleError ? <Alert severity="error">{visibleError}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={createCategory.isPending || name.trim().length === 0}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
