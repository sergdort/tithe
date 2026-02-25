import type { Category } from '../../types.js';

export type CategoryKind = Category['kind'];

export interface CategoryEditDraft {
  name: string;
  icon: string;
  reimbursementMode: 'none' | 'optional' | 'always';
  defaultCounterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDaysText: string;
}
