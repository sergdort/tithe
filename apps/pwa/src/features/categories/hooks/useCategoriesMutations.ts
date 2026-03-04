import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api.js';
import type { Category } from '../../../types.js';
import { categoriesQueryKeys } from '../queries.js';

type CreateCategoryInput = Parameters<typeof api.categories.create>[0];
type UpdateCategoryPatch = Parameters<typeof api.categories.update>[1];

const updateCategoriesCacheEntry = (categories: Category[], updated: Category): Category[] => {
  const index = categories.findIndex((item) => item.id === updated.id);
  if (index === -1) {
    return categories;
  }

  const next = [...categories];
  next[index] = updated;
  return next;
};

export const useCreateCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCategoryInput) => api.categories.create(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.categories() });
    },
  });
};

export const useUpdateCategoryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateCategoryPatch }) =>
      api.categories.update(input.id, input.patch),
    onSuccess: async (updatedCategory) => {
      queryClient.setQueryData<Category[] | undefined>(
        categoriesQueryKeys.categories(),
        (currentCategories) => {
          if (!currentCategories) {
            return currentCategories;
          }

          return updateCategoriesCacheEntry(currentCategories, updatedCategory);
        },
      );

      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.categories(),
        refetchType: 'none',
      });
    },
  });
};

export const useCreateReimbursementCategoryRuleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { expenseCategoryId: string; inboundCategoryId: string }) =>
      api.reimbursements.createCategoryRule(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.reimbursementCategoryRules(),
      });
    },
  });
};

export const useDeleteReimbursementCategoryRuleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.reimbursements.deleteCategoryRule(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.reimbursementCategoryRules(),
      });
    },
  });
};
