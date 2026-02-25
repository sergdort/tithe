import type { Category } from '../../types.js';
import type { CategoryEditDraft } from './types.js';

export const normalizeCategoryLabel = (name: string): string =>
  name.startsWith('Monzo: ') ? name.slice('Monzo: '.length) : name;

export const isMonzoPlaceholderCategoryName = (name: string): boolean =>
  /^Category [a-z0-9]+$/i.test(name.trim());

export const buildDraftFromCategory = (category: Category): CategoryEditDraft => ({
  name: category.name,
  icon: category.icon,
  reimbursementMode: category.reimbursementMode ?? 'none',
  defaultCounterpartyType: category.defaultCounterpartyType ?? null,
  defaultRecoveryWindowDaysText:
    category.defaultRecoveryWindowDays === null || category.defaultRecoveryWindowDays === undefined
      ? ''
      : String(category.defaultRecoveryWindowDays),
});

export const parseNullableNonNegativeInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Default recovery window must be a non-negative integer or blank.');
  }
  return parsed;
};

export const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;
