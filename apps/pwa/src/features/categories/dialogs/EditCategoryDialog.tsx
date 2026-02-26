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
import type { ElementType } from 'react';

import type { Category } from '../../../types.js';
import { CATEGORY_COLOR_OPTIONS, type CategoryIconOption } from '../constants.js';
import type { CategoryEditDraft } from '../types.js';

interface EditCategoryDialogProps {
  open: boolean;
  category: Category | null;
  draft: CategoryEditDraft | null;
  iconOptions: readonly CategoryIconOption[];
  iconComponents: Record<string, ElementType>;
  errorMessage: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeDraft: (patch: Partial<CategoryEditDraft>) => void;
}

export const EditCategoryDialog = ({
  open,
  category,
  draft,
  iconOptions,
  iconComponents,
  errorMessage,
  isSubmitting,
  onClose,
  onSave,
  onChangeDraft,
}: EditCategoryDialogProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      {category && draft ? (
        <>
          <DialogTitle>Edit category</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField
                label="Name"
                value={draft.name}
                onChange={(event) => onChangeDraft({ name: event.target.value })}
                size="small"
                autoFocus
              />
              <Autocomplete<CategoryIconOption, false, false, false>
                options={iconOptions as CategoryIconOption[]}
                value={iconOptions.find((option) => option.name === draft.icon) ?? null}
                onChange={(_event, option) => onChangeDraft({ icon: option?.name ?? 'savings' })}
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
                  const IconComponent = iconComponents[option.name] ?? CategoryIcon;
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
                    size="small"
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
                      onClick={() => onChangeDraft({ color: option })}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        border: draft.color === option ? '2px solid #111827' : '1px solid #CFD8DC',
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
                  const IconComponent = iconComponents[draft.icon] ?? CategoryIcon;
                  return (
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: `${draft.color}22`,
                        color: draft.color,
                      }}
                    >
                      <IconComponent fontSize="small" />
                    </Avatar>
                  );
                })()}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {draft.name.trim() || 'Category preview'}
                </Typography>
              </Box>
              {category.kind === 'expense' ? (
                <>
                  <TextField
                    select
                    label="Reimbursement Mode"
                    value={draft.reimbursementMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as CategoryEditDraft['reimbursementMode'];
                      onChangeDraft({
                        reimbursementMode: nextMode,
                        ...(nextMode === 'none'
                          ? {
                              defaultCounterpartyType: null,
                              defaultRecoveryWindowDaysText: '',
                            }
                          : {}),
                      });
                    }}
                    size="small"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="optional">Optional</MenuItem>
                    <MenuItem value="always">Always</MenuItem>
                  </TextField>
                  {draft.reimbursementMode !== 'none' ? (
                    <>
                      <TextField
                        select
                        label="Default Counterparty"
                        value={draft.defaultCounterpartyType ?? '__none'}
                        onChange={(event) =>
                          onChangeDraft({
                            defaultCounterpartyType:
                              event.target.value === '__none'
                                ? null
                                : (event.target
                                    .value as CategoryEditDraft['defaultCounterpartyType']),
                          })
                        }
                        size="small"
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
                        size="small"
                        value={draft.defaultRecoveryWindowDaysText}
                        onChange={(event) =>
                          onChangeDraft({ defaultRecoveryWindowDaysText: event.target.value })
                        }
                        inputProps={{ min: 0 }}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={onSave}
              disabled={isSubmitting || draft.name.trim().length === 0}
            >
              Save
            </Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
};
