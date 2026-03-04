import { useMemo, useState } from 'react';

import type { Category, ReimbursementCategoryRule } from '../../../types.js';
import { getErrorMessage } from '../utils.js';

interface UseAutoMatchRulesDialogInput {
  categories: Category[];
  rulesByExpenseCategoryId: Map<string, ReimbursementCategoryRule[]>;
  createRule: (input: { expenseCategoryId: string; inboundCategoryId: string }) => Promise<unknown>;
  deleteRule: (id: string) => Promise<unknown>;
}

interface UseAutoMatchRulesDialogOutput {
  open: boolean;
  expenseCategory: Category | null;
  errorMessage: string | null;
  linkedInboundIds: Set<string>;
  openForCategory: (categoryId: string) => void;
  close: () => void;
  toggleRule: (inboundCategoryId: string, enabled: boolean) => Promise<void>;
}

export const useAutoMatchRulesDialog = ({
  categories,
  rulesByExpenseCategoryId,
  createRule,
  deleteRule,
}: UseAutoMatchRulesDialogInput): UseAutoMatchRulesDialogOutput => {
  const [openExpenseCategoryId, setOpenExpenseCategoryId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const expenseCategory = useMemo(() => {
    if (!openExpenseCategoryId) {
      return null;
    }
    return (
      categories.find(
        (category) => category.id === openExpenseCategoryId && category.kind === 'expense',
      ) ?? null
    );
  }, [categories, openExpenseCategoryId]);

  const linkedInboundIds = useMemo(
    () =>
      new Set(
        (expenseCategory ? (rulesByExpenseCategoryId.get(expenseCategory.id) ?? []) : []).map(
          (rule) => rule.inboundCategoryId,
        ),
      ),
    [expenseCategory, rulesByExpenseCategoryId],
  );

  const openForCategory = (categoryId: string): void => {
    setOpenExpenseCategoryId(categoryId);
    setErrorMessage(null);
  };

  const close = (): void => {
    setOpenExpenseCategoryId(null);
    setErrorMessage(null);
  };

  const toggleRule = async (inboundCategoryId: string, enabled: boolean): Promise<void> => {
    if (!expenseCategory) {
      return;
    }

    setErrorMessage(null);

    try {
      const existing = (rulesByExpenseCategoryId.get(expenseCategory.id) ?? []).find(
        (rule) => rule.inboundCategoryId === inboundCategoryId,
      );

      if (enabled && !existing) {
        await createRule({
          expenseCategoryId: expenseCategory.id,
          inboundCategoryId,
        });
      } else if (!enabled && existing) {
        await deleteRule(existing.id);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to update auto-match rule.'));
    }
  };

  return {
    open: Boolean(expenseCategory),
    expenseCategory,
    errorMessage,
    linkedInboundIds,
    openForCategory,
    close,
    toggleRule,
  };
};
