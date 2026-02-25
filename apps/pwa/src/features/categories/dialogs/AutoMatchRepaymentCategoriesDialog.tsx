import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';

import type { Category } from '../../../types.js';
import { normalizeCategoryLabel } from '../utils.js';

interface AutoMatchRepaymentCategoriesDialogProps {
  open: boolean;
  expenseCategory: Category | null;
  inboundCategories: Category[];
  linkedInboundIds: Set<string>;
  errorMessage: string | null;
  isBusy: boolean;
  onClose: () => void;
  onToggleRule: (inboundCategoryId: string, enabled: boolean) => void;
}

export const AutoMatchRepaymentCategoriesDialog = ({
  open,
  expenseCategory,
  inboundCategories,
  linkedInboundIds,
  errorMessage,
  isBusy,
  onClose,
  onToggleRule,
}: AutoMatchRepaymentCategoriesDialogProps) => (
  <Dialog open={open} onClose={onClose} fullWidth>
    {expenseCategory ? (
      <>
        <DialogTitle>Auto-match repayment categories</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Expense category: <strong>{normalizeCategoryLabel(expenseCategory.name)}</strong>
            </Typography>
            <Stack spacing={0.5}>
              {inboundCategories.map((inboundCategory) => (
                <FormControlLabel
                  key={`${expenseCategory.id}:${inboundCategory.id}`}
                  control={
                    <Switch
                      size="small"
                      checked={linkedInboundIds.has(inboundCategory.id)}
                      onChange={(event) => onToggleRule(inboundCategory.id, event.target.checked)}
                      disabled={isBusy}
                    />
                  }
                  label={`${normalizeCategoryLabel(inboundCategory.name)} (${inboundCategory.kind})`}
                />
              ))}
            </Stack>
            {inboundCategories.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                Create an income or transfer category first to add repayment auto-match rules.
              </Typography>
            ) : null}
            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </>
    ) : null}
  </Dialog>
);
