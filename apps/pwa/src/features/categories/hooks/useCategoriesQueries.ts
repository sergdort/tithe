import { useQuery } from '@tanstack/react-query';

import { api } from '../../../api.js';
import { categoriesQueryKeys } from '../queries.js';

export const useCategoriesListQuery = () =>
  useQuery({
    queryKey: categoriesQueryKeys.categories(),
    queryFn: () => api.categories.list(),
  });

export const useReimbursementCategoryRulesQuery = () =>
  useQuery({
    queryKey: categoriesQueryKeys.reimbursementCategoryRules(),
    queryFn: () => api.reimbursements.listCategoryRules(),
  });
