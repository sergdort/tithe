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
import type { ElementType } from 'react';

import type { Category } from '../../../types.js';

export interface CategoryEditDraft {
  name: string;
  icon: string;
  reimbursementMode: 'none' | 'optional' | 'always';
  defaultCounterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDaysText: string;
}

interface EditCategoryDialogProps {
  open: boolean;
  category: Category | null;
  draft: CategoryEditDraft | null;
  iconOptions: readonly string[];
  iconComponents: Record<string, ElementType>;
  errorMessage: string | null;
  isSubmitting: boolean;
  isMobile: boolean;
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
  isMobile,
  onClose,
  onSave,
  onChangeDraft,
}: EditCategoryDialogProps) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
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
            <TextField
              select
              label="Icon"
              value={draft.icon}
              onChange={(event) => onChangeDraft({ icon: event.target.value })}
              size="small"
            >
              {iconOptions.map((iconName) => {
                const IconComponent = iconComponents[iconName] ?? CategoryIcon;
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
