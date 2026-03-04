import { useMemo, useRef, useState } from 'react';

import type { Category } from '../../../types.js';
import type { CategoryEditDraft } from '../types.js';
import { buildDraftFromCategory, getErrorMessage, parseNullableNonNegativeInt } from '../utils.js';

type CategoryUpdatePatch = {
  name?: string;
  icon?: string;
  color?: string;
  reimbursementMode?: 'none' | 'optional' | 'always';
  defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays?: number | null;
};

interface CategoryEditingState {
  categoryId: string;
  draft: CategoryEditDraft;
}

interface UseCategoryEditDialogInput {
  categories: Category[];
  saveCategory: (input: { id: string; patch: CategoryUpdatePatch }) => Promise<unknown>;
}

interface UseCategoryEditDialogOutput {
  open: boolean;
  category: Category | null;
  draft: CategoryEditDraft | null;
  errorMessage: string | null;
  beginEdit: (category: Category) => void;
  closeEdit: () => void;
  changeDraft: (patch: Partial<CategoryEditDraft>) => void;
  save: () => Promise<void>;
}

export const useCategoryEditDialog = ({
  categories,
  saveCategory,
}: UseCategoryEditDialogInput): UseCategoryEditDialogOutput => {
  const [editing, setEditing] = useState<CategoryEditingState | null>(null);
  const editingRef = useRef<CategoryEditingState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setEditingState = (
    updater: (prev: CategoryEditingState | null) => CategoryEditingState | null,
  ): void => {
    setEditing((prev) => {
      const next = updater(prev);
      editingRef.current = next;
      return next;
    });
  };

  const category = useMemo(() => {
    if (!editing) {
      return null;
    }
    return categories.find((item) => item.id === editing.categoryId) ?? null;
  }, [categories, editing]);

  const beginEdit = (nextCategory: Category): void => {
    setErrorMessage(null);
    setEditingState(() => ({
      categoryId: nextCategory.id,
      draft: buildDraftFromCategory(nextCategory),
    }));
  };

  const closeEdit = (): void => {
    setEditingState(() => null);
    setErrorMessage(null);
  };

  const changeDraft = (patch: Partial<CategoryEditDraft>): void => {
    setEditingState((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        draft: {
          ...prev.draft,
          ...patch,
        },
      };
    });
  };

  const save = async (): Promise<void> => {
    const current = editingRef.current;
    if (!current) {
      return;
    }

    const currentCategory = categories.find((item) => item.id === current.categoryId);
    if (!currentCategory) {
      return;
    }

    setErrorMessage(null);

    try {
      const patch: CategoryUpdatePatch = {
        name: current.draft.name.trim(),
        icon: current.draft.icon,
        color: current.draft.color,
      };

      if (currentCategory.kind === 'expense') {
        patch.reimbursementMode = current.draft.reimbursementMode;
        patch.defaultCounterpartyType = current.draft.defaultCounterpartyType;
        patch.defaultRecoveryWindowDays = parseNullableNonNegativeInt(
          current.draft.defaultRecoveryWindowDaysText,
        );
      }

      await saveCategory({ id: current.categoryId, patch });
      closeEdit();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to update category.'));
    }
  };

  return {
    open: Boolean(category && editing),
    category,
    draft: editing?.draft ?? null,
    errorMessage,
    beginEdit,
    closeEdit,
    changeDraft,
    save,
  };
};
