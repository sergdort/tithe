import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, CircularProgress, Fab, Stack } from '@mui/material';
import { useMemo, useState } from 'react';

import type { Category, ReimbursementCategoryRule } from '../../types.js';
import { CategoriesListCard } from './components/CategoriesListCard.js';
import { CATEGORY_ICON_COMPONENTS, CATEGORY_ICON_OPTIONS } from './constants.js';
import { AddCategoryDialog } from './dialogs/AddCategoryDialog.js';
import { AutoMatchRepaymentCategoriesDialog } from './dialogs/AutoMatchRepaymentCategoriesDialog.js';
import { EditCategoryDialog } from './dialogs/EditCategoryDialog.js';
import {
  useCreateReimbursementCategoryRuleMutation,
  useDeleteReimbursementCategoryRuleMutation,
  useUpdateCategoryMutation,
} from './hooks/useCategoriesMutations.js';
import {
  useCategoriesListQuery,
  useReimbursementCategoryRulesQuery,
} from './hooks/useCategoriesQueries.js';
import type { CategoryEditDraft } from './types.js';
import { buildDraftFromCategory, getErrorMessage, parseNullableNonNegativeInt } from './utils.js';

export const CategoriesScreen = () => {
  const [addOpen, setAddOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [draftsById, setDraftsById] = useState<Record<string, CategoryEditDraft>>({});
  const [rulesOpenCategoryId, setRulesOpenCategoryId] = useState<string | null>(null);
  const [rowErrorById, setRowErrorById] = useState<Record<string, string | null>>({});
  const [rulesErrorByExpenseCategoryId, setRulesErrorByExpenseCategoryId] = useState<
    Record<string, string | null>
  >({});

  const categoriesQuery = useCategoriesListQuery();
  const rulesQuery = useReimbursementCategoryRulesQuery();

  const updateCategory = useUpdateCategoryMutation();
  const createRule = useCreateReimbursementCategoryRuleMutation();
  const deleteRule = useDeleteReimbursementCategoryRuleMutation();

  const categories = categoriesQuery.data ?? [];
  const rules = rulesQuery.data ?? [];

  const editingCategory = editingCategoryId
    ? (categories.find((category) => category.id === editingCategoryId) ?? null)
    : null;
  const rulesEditingCategory = rulesOpenCategoryId
    ? (categories.find(
        (category) => category.id === rulesOpenCategoryId && category.kind === 'expense',
      ) ?? null)
    : null;

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

  const editingDraft = editingCategory
    ? (draftsById[editingCategory.id] ?? buildDraftFromCategory(editingCategory))
    : null;
  const rulesEditingLinkedInboundIds = new Set(
    (rulesEditingCategory ? (rulesByExpenseCategoryId.get(rulesEditingCategory.id) ?? []) : []).map(
      (rule) => rule.inboundCategoryId,
    ),
  );

  const beginEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setDraftsById((prev) => ({
      ...prev,
      [category.id]: prev[category.id] ?? buildDraftFromCategory(category),
    }));
    setRowErrorById((prev) => ({ ...prev, [category.id]: null }));
  };

  const cancelEdit = (categoryId: string) => {
    setEditingCategoryId((prev) => (prev === categoryId ? null : prev));
    setDraftsById((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setRowErrorById((prev) => ({ ...prev, [categoryId]: null }));
  };

  const setDraft = (categoryId: string, patch: Partial<CategoryEditDraft>) => {
    setDraftsById((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? {
          name: '',
          icon: 'savings',
          reimbursementMode: 'none',
          defaultCounterpartyType: null,
          defaultRecoveryWindowDaysText: '',
        }),
        ...patch,
      },
    }));
  };

  const handleSaveCategory = async (category: Category) => {
    const draft = draftsById[category.id] ?? buildDraftFromCategory(category);
    setRowErrorById((prev) => ({ ...prev, [category.id]: null }));

    try {
      const patch: {
        name?: string;
        icon?: string;
        reimbursementMode?: 'none' | 'optional' | 'always';
        defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
        defaultRecoveryWindowDays?: number | null;
      } = {
        name: draft.name.trim(),
        icon: draft.icon,
      };

      if (category.kind === 'expense') {
        patch.reimbursementMode = draft.reimbursementMode;
        patch.defaultCounterpartyType = draft.defaultCounterpartyType;
        patch.defaultRecoveryWindowDays = parseNullableNonNegativeInt(
          draft.defaultRecoveryWindowDaysText,
        );
      }

      await updateCategory.mutateAsync({ id: category.id, patch });
      setEditingCategoryId((prev) => (prev === category.id ? null : prev));
    } catch (error) {
      setRowErrorById((prev) => ({
        ...prev,
        [category.id]: getErrorMessage(error, 'Failed to update category.'),
      }));
    }
  };

  const handleToggleRule = async (
    expenseCategoryId: string,
    inboundCategoryId: string,
    enabled: boolean,
  ) => {
    setRulesErrorByExpenseCategoryId((prev) => ({ ...prev, [expenseCategoryId]: null }));

    try {
      const existing = (rulesByExpenseCategoryId.get(expenseCategoryId) ?? []).find(
        (rule) => rule.inboundCategoryId === inboundCategoryId,
      );

      if (enabled) {
        await createRule.mutateAsync({ expenseCategoryId, inboundCategoryId });
      } else if (existing) {
        await deleteRule.mutateAsync(existing.id);
      }
    } catch (error) {
      setRulesErrorByExpenseCategoryId((prev) => ({
        ...prev,
        [expenseCategoryId]: getErrorMessage(error, 'Failed to update auto-match rule.'),
      }));
    }
  };

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
          onOpenAutoMatchRules={setRulesOpenCategoryId}
          onEditCategory={beginEdit}
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
        open={Boolean(rulesEditingCategory)}
        expenseCategory={rulesEditingCategory}
        inboundCategories={inboundCategories}
        linkedInboundIds={rulesEditingLinkedInboundIds}
        errorMessage={
          rulesEditingCategory
            ? (rulesErrorByExpenseCategoryId[rulesEditingCategory.id] ?? null)
            : null
        }
        isBusy={createRule.isPending || deleteRule.isPending}
        onClose={() => setRulesOpenCategoryId(null)}
        onToggleRule={(inboundCategoryId, enabled) => {
          if (!rulesEditingCategory) return;
          void handleToggleRule(rulesEditingCategory.id, inboundCategoryId, enabled);
        }}
      />

      <EditCategoryDialog
        open={Boolean(editingCategory && editingDraft)}
        category={editingCategory}
        draft={editingDraft}
        iconOptions={CATEGORY_ICON_OPTIONS}
        iconComponents={CATEGORY_ICON_COMPONENTS}
        errorMessage={editingCategory ? (rowErrorById[editingCategory.id] ?? null) : null}
        isSubmitting={updateCategory.isPending}
        onClose={() => {
          if (!editingCategory) return;
          cancelEdit(editingCategory.id);
        }}
        onSave={() => {
          if (!editingCategory) return;
          void handleSaveCategory(editingCategory);
        }}
        onChangeDraft={(patch) => {
          if (!editingCategory) return;
          setDraft(editingCategory.id, patch);
        }}
      />
    </Box>
  );
};
