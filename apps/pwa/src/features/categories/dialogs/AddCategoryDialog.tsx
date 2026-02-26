import CategoryIcon from '@mui/icons-material/Category';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';

import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_COMPONENTS,
  CATEGORY_ICON_OPTIONS,
  type CategoryIconOption,
} from '../constants.js';
import { useCreateCategoryMutation } from '../hooks/useCategoriesMutations.js';
import type { CategoryKind } from '../types.js';
import { getErrorMessage, parseNullableNonNegativeInt } from '../utils.js';

interface AddCategoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AddCategoryDialog = ({ open, onClose }: AddCategoryDialogProps) => {
  const createCategory = useCreateCategoryMutation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [reimbursementMode, setReimbursementMode] = useState<'none' | 'optional' | 'always'>(
    'none',
  );
  const [icon, setIcon] = useState<string>('savings');
  const [color, setColor] = useState<string>('#2E7D32');
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
    setColor('#2E7D32');
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
        color,
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
          <Autocomplete<CategoryIconOption, false, false, false>
            options={CATEGORY_ICON_OPTIONS as CategoryIconOption[]}
            value={CATEGORY_ICON_OPTIONS.find((option) => option.name === icon) ?? null}
            onChange={(_event, option) => setIcon(option?.name ?? 'savings')}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            openOnFocus={!isMobile}
            ListboxProps={{ style: { maxHeight: isMobile ? 260 : 360 } }}
            filterOptions={(options, state) => {
              const query = state.inputValue.trim().toLowerCase();
              if (!query) return options;
              return options.filter((option) =>
                [option.label, option.name, ...(option.keywords ?? [])]
                  .join(' ')
                  .toLowerCase()
                  .includes(query),
              );
            }}
            renderOption={(props, option) => {
              const IconComponent = CATEGORY_ICON_COMPONENTS[option.name] ?? CategoryIcon;
              return (
                <li {...props} key={option.name}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconComponent fontSize="small" />
                    <span>{option.label}</span>
                  </Stack>
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Icon"
                helperText={isMobile ? 'Tap to choose icon (keyboard disabled)' : undefined}
                inputProps={{ ...params.inputProps, readOnly: isMobile }}
              />
            )}
          />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              Color
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {CATEGORY_COLOR_OPTIONS.map((option) => (
                <Box
                  key={option}
                  component="button"
                  type="button"
                  onClick={() => setColor(option)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: color === option ? '2px solid #111827' : '1px solid #CFD8DC',
                    backgroundColor: option,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Stack>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              borderRadius: 2,
              bgcolor: 'action.hover',
            }}
          >
            {(() => {
              const IconComponent = CATEGORY_ICON_COMPONENTS[icon] ?? CategoryIcon;
              return (
                <Avatar sx={{ width: 32, height: 32, bgcolor: `${color}22`, color }}>
                  <IconComponent fontSize="small" />
                </Avatar>
              );
            })()}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {name.trim() || 'Category preview'}
            </Typography>
          </Box>
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
