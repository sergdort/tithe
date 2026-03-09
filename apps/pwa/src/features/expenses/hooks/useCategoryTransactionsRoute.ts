import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { monthStartLocal, parseMonthParam, shiftMonthLocal } from '../../../lib/date/month.js';

interface ExpenseCategoryDetailLocationState {
  inAppBackTarget?: string;
  categoryName?: string;
}

const parseTransferDirection = (value: string | null): 'in' | 'out' | null =>
  value === 'in' || value === 'out' ? value : null;

export const useCategoryTransactionsRoute = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const locationState = (location.state as ExpenseCategoryDetailLocationState | null) ?? null;
  const monthParam = searchParams.get('month');
  const monthCursor = monthStartLocal(parseMonthParam(monthParam) ?? new Date());
  const nextMonthStart = shiftMonthLocal(monthCursor, 1);

  return {
    categoryId,
    fallbackHomeHref: monthParam ? `/?month=${encodeURIComponent(monthParam)}` : '/',
    from: monthCursor.toISOString(),
    monthLabel: monthCursor.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    }),
    seededCategoryName: locationState?.categoryName?.trim() || 'Transactions',
    shouldGoBackInApp: locationState?.inAppBackTarget === 'home',
    to: new Date(nextMonthStart.getTime() - 1).toISOString(),
    transferDirection: parseTransferDirection(searchParams.get('direction')),
  };
};
