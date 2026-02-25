import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api.js';
import { categoriesQueryKeys } from '../queries.js';

type CreateCategoryInput = Parameters<typeof api.categories.create>[0];
type UpdateCategoryPatch = Parameters<typeof api.categories.update>[1];

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.categories() });
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
