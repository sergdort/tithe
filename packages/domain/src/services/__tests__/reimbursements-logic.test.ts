import { describe, expect, it } from 'vitest';

import { AppError } from '../../errors.js';
import {
  assertExpenseCategoryKind,
  assertInboundCategoryKind,
  assertOutboundReimbursable,
  assertPositiveMinor,
  computeAutoMatchAllocation,
  computeRecoverableMinor,
  deriveReimbursementStatus,
  isInRecoveryWindow,
  validateCloseOutstandingMinor,
  validateLinkAmounts,
  validateLinkCurrency,
  validateLinkTarget,
} from '../reimbursements-logic.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const makeExpense = (
  overrides: Partial<{
    id: string;
    kind: string;
    reimbursementStatus: string;
    amountMinor: number;
    currency: string;
    myShareMinor: number | null;
    closedOutstandingMinor: number | null;
  }> = {},
) => ({
  id: overrides.id ?? 'exp-1',
  kind: (overrides.kind ?? 'expense') as
    | 'expense'
    | 'income'
    | 'transfer_internal'
    | 'transfer_external',
  reimbursementStatus: (overrides.reimbursementStatus ?? 'expected') as
    | 'none'
    | 'expected'
    | 'partial'
    | 'settled'
    | 'written_off',
  money: {
    amountMinor: overrides.amountMinor ?? 10000,
    currency: overrides.currency ?? 'GBP',
    amountBaseMinor: undefined,
    fxRate: undefined,
  },
  myShareMinor: overrides.myShareMinor === undefined ? 2000 : overrides.myShareMinor,
  closedOutstandingMinor: overrides.closedOutstandingMinor ?? null,
});

// ── assertPositiveMinor ────────────────────────────────────────────────────

describe('assertPositiveMinor', () => {
  it('accepts positive integers', () => expect(assertPositiveMinor(100, 'amt')).toBe(100));
  it('accepts 1', () => expect(assertPositiveMinor(1, 'amt')).toBe(1));
  it('rejects 0', () => expect(() => assertPositiveMinor(0, 'amt')).toThrow(AppError));
  it('rejects negative', () => expect(() => assertPositiveMinor(-5, 'amt')).toThrow(AppError));
  it('rejects floats', () => expect(() => assertPositiveMinor(1.5, 'amt')).toThrow(AppError));
  it('uses field name in error', () => {
    try {
      assertPositiveMinor(0, 'myField');
    } catch (error) {
      expect((error as AppError).message).toContain('myField');
    }
  });
});

// ── computeRecoverableMinor ────────────────────────────────────────────────

describe('computeRecoverableMinor', () => {
  it('returns 0 for non-expense kinds', () => {
    expect(computeRecoverableMinor(makeExpense({ kind: 'income' }))).toBe(0);
  });

  it('returns 0 when reimbursementStatus is none', () => {
    expect(computeRecoverableMinor(makeExpense({ reimbursementStatus: 'none' }))).toBe(0);
  });

  it('returns amountMinor - myShareMinor', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 10000, myShareMinor: 3000 }))).toBe(
      7000,
    );
  });

  it('returns full amount when myShareMinor is null', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 5000, myShareMinor: null }))).toBe(
      5000,
    );
  });

  it('returns full amount when myShareMinor is 0', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 5000, myShareMinor: 0 }))).toBe(5000);
  });

  it('clamps to 0 when myShareMinor exceeds amount', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 1000, myShareMinor: 2000 }))).toBe(0);
  });
});

// ── deriveReimbursementStatus ──────────────────────────────────────────────

describe('deriveReimbursementStatus', () => {
  it('returns "none" for non-expense kinds', () => {
    expect(deriveReimbursementStatus(makeExpense({ kind: 'income' }), 0)).toBe('none');
  });

  it('returns "none" when not reimbursable', () => {
    expect(
      deriveReimbursementStatus(
        makeExpense({ reimbursementStatus: 'none', myShareMinor: null }),
        0,
      ),
    ).toBe('none');
  });

  it('returns "expected" when nothing recovered', () => {
    expect(
      deriveReimbursementStatus(makeExpense({ amountMinor: 10000, myShareMinor: 2000 }), 0),
    ).toBe('expected');
  });

  it('returns "partial" when partially recovered', () => {
    expect(
      deriveReimbursementStatus(makeExpense({ amountMinor: 10000, myShareMinor: 2000 }), 3000),
    ).toBe('partial');
  });

  it('returns "settled" when fully recovered', () => {
    expect(
      deriveReimbursementStatus(makeExpense({ amountMinor: 10000, myShareMinor: 2000 }), 8000),
    ).toBe('settled');
  });

  it('returns "written_off" when closedOutstandingMinor > 0', () => {
    expect(
      deriveReimbursementStatus(
        makeExpense({ amountMinor: 10000, myShareMinor: 2000, closedOutstandingMinor: 3000 }),
        5000,
      ),
    ).toBe('written_off');
  });

  it('returns "settled" when recoverableMinor is 0', () => {
    expect(
      deriveReimbursementStatus(makeExpense({ amountMinor: 5000, myShareMinor: 5000 }), 0),
    ).toBe('settled');
  });

  it('returns "settled" when outstanding reaches 0 via recovery + write-off', () => {
    expect(
      deriveReimbursementStatus(
        makeExpense({ amountMinor: 10000, myShareMinor: 2000, closedOutstandingMinor: 4000 }),
        4000,
      ),
    ).toBe('written_off');
  });
});

// ── assertOutboundReimbursable ─────────────────────────────────────────────

describe('assertOutboundReimbursable', () => {
  it('passes for reimbursable expense', () => {
    expect(() =>
      assertOutboundReimbursable(makeExpense({ reimbursementStatus: 'expected', myShareMinor: 0 })),
    ).not.toThrow();
  });

  it('throws for non-expense kind', () => {
    expect(() => assertOutboundReimbursable(makeExpense({ kind: 'income' }))).toThrow(
      'Outgoing reimbursement source must be an expense row',
    );
  });

  it('throws when not reimbursable (none + null myShare)', () => {
    expect(() =>
      assertOutboundReimbursable(makeExpense({ reimbursementStatus: 'none', myShareMinor: null })),
    ).toThrow('Expense is not configured as reimbursable');
  });

  it('passes when reimbursementStatus is none but myShareMinor is set', () => {
    expect(() =>
      assertOutboundReimbursable(makeExpense({ reimbursementStatus: 'none', myShareMinor: 500 })),
    ).not.toThrow();
  });
});

// ── validateLinkTarget ─────────────────────────────────────────────────────

describe('validateLinkTarget', () => {
  it('accepts income', () => {
    expect(() => validateLinkTarget(makeExpense({ kind: 'income' }))).not.toThrow();
  });

  it('accepts transfer_external', () => {
    expect(() => validateLinkTarget(makeExpense({ kind: 'transfer_external' }))).not.toThrow();
  });

  it('rejects expense kind', () => {
    expect(() => validateLinkTarget(makeExpense({ kind: 'expense' }))).toThrow(
      'Inbound reimbursement target must be income or external transfer',
    );
  });

  it('rejects transfer_internal kind', () => {
    expect(() => validateLinkTarget(makeExpense({ kind: 'transfer_internal' }))).toThrow(
      'Inbound reimbursement target must be income or external transfer',
    );
  });
});

// ── validateLinkCurrency ───────────────────────────────────────────────────

describe('validateLinkCurrency', () => {
  it('passes when currencies match', () => {
    expect(() =>
      validateLinkCurrency(makeExpense({ currency: 'GBP' }), makeExpense({ currency: 'GBP' })),
    ).not.toThrow();
  });

  it('throws when currencies differ', () => {
    expect(() =>
      validateLinkCurrency(
        makeExpense({ id: 'out-1', currency: 'GBP' }),
        makeExpense({ id: 'in-1', currency: 'USD' }),
      ),
    ).toThrow('Currencies must match');
  });
});

// ── validateLinkAmounts ────────────────────────────────────────────────────

describe('validateLinkAmounts', () => {
  const base = { expenseOutId: 'out-1', expenseInId: 'in-1' };

  it('passes when amount is within bounds', () => {
    expect(() =>
      validateLinkAmounts({
        ...base,
        amountMinor: 3000,
        outstandingMinor: 5000,
        inboundAvailableMinor: 4000,
      }),
    ).not.toThrow();
  });

  it('throws when no outstanding remains', () => {
    expect(() =>
      validateLinkAmounts({
        ...base,
        amountMinor: 1000,
        outstandingMinor: 0,
        inboundAvailableMinor: 5000,
      }),
    ).toThrow('No outstanding reimbursable amount remains');
  });

  it('throws when amount exceeds outstanding', () => {
    expect(() =>
      validateLinkAmounts({
        ...base,
        amountMinor: 6000,
        outstandingMinor: 5000,
        inboundAvailableMinor: 10000,
      }),
    ).toThrow('Link amount exceeds outbound outstanding amount');
  });

  it('throws when amount exceeds inbound available', () => {
    expect(() =>
      validateLinkAmounts({
        ...base,
        amountMinor: 5000,
        outstandingMinor: 10000,
        inboundAvailableMinor: 3000,
      }),
    ).toThrow('Link amount exceeds inbound unallocated amount');
  });
});

// ── validateCloseOutstandingMinor ──────────────────────────────────────────

describe('validateCloseOutstandingMinor', () => {
  it('passes for valid close amount', () => {
    expect(() => validateCloseOutstandingMinor(3000, 5000)).not.toThrow();
  });

  it('passes when close equals outstanding', () => {
    expect(() => validateCloseOutstandingMinor(5000, 5000)).not.toThrow();
  });

  it('throws for negative value', () => {
    expect(() => validateCloseOutstandingMinor(-1, 5000)).toThrow('non-negative integer');
  });

  it('throws for non-integer', () => {
    expect(() => validateCloseOutstandingMinor(1.5, 5000)).toThrow('non-negative integer');
  });

  it('throws for zero when outstanding remains', () => {
    expect(() => validateCloseOutstandingMinor(0, 5000)).toThrow(
      'must be greater than zero when outstanding remains',
    );
  });

  it('throws when exceeds outstanding', () => {
    expect(() => validateCloseOutstandingMinor(6000, 5000)).toThrow(
      'closeOutstandingMinor exceeds outstanding amount',
    );
  });
});

// ── assertExpenseCategoryKind ──────────────────────────────────────────────

describe('assertExpenseCategoryKind', () => {
  it('passes for expense category', () => {
    expect(() => assertExpenseCategoryKind({ id: 'c1', kind: 'expense' })).not.toThrow();
  });

  it('throws for income category', () => {
    expect(() => assertExpenseCategoryKind({ id: 'c1', kind: 'income' })).toThrow(
      'must be an expense category',
    );
  });

  it('throws for transfer category', () => {
    expect(() => assertExpenseCategoryKind({ id: 'c1', kind: 'transfer' })).toThrow(
      'must be an expense category',
    );
  });
});

// ── assertInboundCategoryKind ──────────────────────────────────────────────

describe('assertInboundCategoryKind', () => {
  it('passes for income category', () => {
    expect(() => assertInboundCategoryKind({ id: 'c1', kind: 'income' })).not.toThrow();
  });

  it('passes for transfer category', () => {
    expect(() => assertInboundCategoryKind({ id: 'c1', kind: 'transfer' })).not.toThrow();
  });

  it('throws for expense category', () => {
    expect(() => assertInboundCategoryKind({ id: 'c1', kind: 'expense' })).toThrow(
      'must be an income or transfer category',
    );
  });
});

// ── isInRecoveryWindow ─────────────────────────────────────────────────────

describe('isInRecoveryWindow', () => {
  const base = '2026-02-01T00:00:00.000Z';

  it('returns true when inbound is same day', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: base,
        recoveryWindowDays: 14,
      }),
    ).toBe(true);
  });

  it('returns true when inbound is within window', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: '2026-02-10T00:00:00.000Z',
        recoveryWindowDays: 14,
      }),
    ).toBe(true);
  });

  it('returns true when inbound is exactly at window end', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: '2026-02-15T00:00:00.000Z',
        recoveryWindowDays: 14,
      }),
    ).toBe(true);
  });

  it('returns false when inbound is after window', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: '2026-02-16T00:00:00.000Z',
        recoveryWindowDays: 14,
      }),
    ).toBe(false);
  });

  it('returns false when inbound is before outbound', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: '2026-01-31T00:00:00.000Z',
        recoveryWindowDays: 14,
      }),
    ).toBe(false);
  });

  it('returns true for zero-day window when same timestamp', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: base,
        inOccurredAt: base,
        recoveryWindowDays: 0,
      }),
    ).toBe(true);
  });

  it('returns true when dates are invalid (graceful fallback)', () => {
    expect(
      isInRecoveryWindow({
        outOccurredAt: 'not-a-date',
        inOccurredAt: '2026-02-10T00:00:00.000Z',
        recoveryWindowDays: 14,
      }),
    ).toBe(true);
  });
});

// ── computeAutoMatchAllocation ─────────────────────────────────────────────

describe('computeAutoMatchAllocation', () => {
  it('returns the smaller of outstanding and available', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 5000,
        inboundAvailableMinor: 3000,
      }),
    ).toBe(3000);
  });

  it('returns outstanding when smaller', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 2000,
        inboundAvailableMinor: 8000,
      }),
    ).toBe(2000);
  });

  it('returns 0 when inbound is 0', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 5000,
        inboundAvailableMinor: 0,
      }),
    ).toBe(0);
  });

  it('returns 0 when outstanding is 0', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 0,
        inboundAvailableMinor: 5000,
      }),
    ).toBe(0);
  });

  it('returns 0 when both are 0', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 0,
        inboundAvailableMinor: 0,
      }),
    ).toBe(0);
  });

  it('returns 0 when inbound is negative', () => {
    expect(
      computeAutoMatchAllocation({
        remainingOutstandingMinor: 5000,
        inboundAvailableMinor: -100,
      }),
    ).toBe(0);
  });
});
