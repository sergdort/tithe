import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, CircularProgress, Fab, Stack } from '@mui/material';
import { useMemo, useState } from 'react';

import type { ReimbursementCategoryRule } from '../../types.js';
import { CategoriesListCard } from './components/CategoriesListCard.js';
import { CATEGORY_ICON_COMPONENTS, CATEGORY_ICON_OPTIONS } from './constants.js';
import { AddCategoryDialog } from './dialogs/AddCategoryDialog.js';
import { AutoMatchRepaymentCategoriesDialog } from './dialogs/AutoMatchRepaymentCategoriesDialog.js';
import { EditCategoryDialog } from './dialogs/EditCategoryDialog.js';
import { useAutoMatchRulesDialog } from './hooks/useAutoMatchRulesDialog.js';
import {
  useCreateReimbursementCategoryRuleMutation,
  useDeleteReimbursementCategoryRuleMutation,
  useUpdateCategoryMutation,
} from './hooks/useCategoriesMutations.js';
import {
  useCategoriesListQuery,
  useReimbursementCategoryRulesQuery,
} from './hooks/useCategoriesQueries.js';
import { useCategoryEditDialog } from './hooks/useCategoryEditDialog.js';

export const CategoriesScreen = () => {
  const [addOpen, setAddOpen] = useState(false);

  const categoriesQuery = useCategoriesListQuery();
  const rulesQuery = useReimbursementCategoryRulesQuery();

  const updateCategory = useUpdateCategoryMutation();
  const createRule = useCreateReimbursementCategoryRuleMutation();
  const deleteRule = useDeleteReimbursementCategoryRuleMutation();

  const categories = categoriesQuery.data ?? [];
  const rules = rulesQuery.data ?? [];

  const rulesByExpenseCategoryId = useMemo(() => {
    const map = new Map<string, ReimbursementCategoryRule[]>();
    for (const rule of rules) {
      const list = map.get(rule.expenseCategoryId) ?? [];
      list.push(rule);
      map.set(rule.expenseCategoryId, list);
    }
    return map;
  }, [rules]);

  const inboundCategories = useMemo(
    () =>
      categories.filter((category) => category.kind === 'income' || category.kind === 'transfer'),
    [categories],
  );

  const editDialog = useCategoryEditDialog({
    categories,
    saveCategory: (input) => updateCategory.mutateAsync(input),
  });

  const rulesDialog = useAutoMatchRulesDialog({
    categories,
    rulesByExpenseCategoryId,
    createRule: (input) => createRule.mutateAsync(input),
    deleteRule: (id) => deleteRule.mutateAsync(id),
  });

  if (categoriesQuery.isLoading || rulesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (categoriesQuery.isError) {
    return <Alert severity="error">Unable to load categories.</Alert>;
  }

  if (rulesQuery.isError) {
    return <Alert severity="error">Unable to load reimbursement category rules.</Alert>;
  }

  return (
    <Box>
      <Stack spacing={2}>
        <CategoriesListCard
          categories={categories}
          rulesByExpenseCategoryId={rulesByExpenseCategoryId}
          onOpenAutoMatchRules={rulesDialog.openForCategory}
          onEditCategory={editDialog.beginEdit}
        />
      </Stack>

      <Fab
        color="primary"
        aria-label="Add category"
        onClick={() => setAddOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 88,
          right: 20,
          minWidth: 56,
          minHeight: 56,
        }}
      >
        <AddIcon />
      </Fab>

      <AddCategoryDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <AutoMatchRepaymentCategoriesDialog
        open={rulesDialog.open}
        expenseCategory={rulesDialog.expenseCategory}
        inboundCategories={inboundCategories}
        linkedInboundIds={rulesDialog.linkedInboundIds}
        errorMessage={rulesDialog.errorMessage}
        isBusy={createRule.isPending || deleteRule.isPending}
        onClose={rulesDialog.close}
        onToggleRule={(inboundCategoryId, enabled) => {
          void rulesDialog.toggleRule(inboundCategoryId, enabled);
        }}
      />

      <EditCategoryDialog
        open={editDialog.open}
        category={editDialog.category}
        draft={editDialog.draft}
        iconOptions={CATEGORY_ICON_OPTIONS}
        iconComponents={CATEGORY_ICON_COMPONENTS}
        errorMessage={editDialog.errorMessage}
        isSubmitting={updateCategory.isPending}
        onClose={editDialog.closeEdit}
        onSave={() => {
          void editDialog.save();
        }}
        onChangeDraft={editDialog.changeDraft}
      />
    </Box>
  );
};
