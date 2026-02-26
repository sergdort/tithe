import { describe, expect, it } from 'vitest';

import { AppError } from '../../errors.js';
import {
  assertPositiveAmountMinor,
  computeRecoverableMinor,
  deriveExpenseKind,
  deriveReimbursementStatus,
  enrichExpensesWithReimbursements,
  isTransferKind,
  normalizeCounterpartyType,
  normalizeExpenseKind,
  normalizeTransferDirection,
  resolveReimbursableDefaults,
  validateAndResolveMyShareMinor,
} from '../expenses-logic.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const makeCategory = (
  overrides: Partial<{
    id: string;
    kind: 'expense' | 'income' | 'transfer';
    reimbursementMode: 'none' | 'optional' | 'always';
  }> = {},
) => ({
  id: overrides.id ?? 'cat-1',
  kind: overrides.kind ?? 'expense',
  reimbursementMode: overrides.reimbursementMode ?? 'none',
});

const makeExpense = (
  overrides: Partial<{
    id: string;
    kind: string;
    reimbursementStatus: string;
    amountMinor: number;
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
    currency: 'GBP',
    amountBaseMinor: undefined,
    fxRate: undefined,
  },
  myShareMinor: overrides.myShareMinor === undefined ? 2000 : overrides.myShareMinor,
  closedOutstandingMinor: overrides.closedOutstandingMinor ?? null,
});

// ── normalizeTransferDirection ─────────────────────────────────────────────

describe('normalizeTransferDirection', () => {
  it('returns "in" for "in"', () => expect(normalizeTransferDirection('in')).toBe('in'));
  it('returns "out" for "out"', () => expect(normalizeTransferDirection('out')).toBe('out'));
  it('returns null for null', () => expect(normalizeTransferDirection(null)).toBeNull());
  it('returns null for undefined', () => expect(normalizeTransferDirection(undefined)).toBeNull());
});

// ── normalizeExpenseKind ───────────────────────────────────────────────────

describe('normalizeExpenseKind', () => {
  it.each(['expense', 'income', 'transfer_internal', 'transfer_external'] as const)(
    'accepts "%s"',
    (kind) => expect(normalizeExpenseKind(kind)).toBe(kind),
  );
  it('returns null for undefined', () => expect(normalizeExpenseKind(undefined)).toBeNull());
  it('returns null for null', () => expect(normalizeExpenseKind(null)).toBeNull());
  it('returns null for invalid string', () =>
    expect(normalizeExpenseKind('bogus' as never)).toBeNull());
});

// ── normalizeCounterpartyType ──────────────────────────────────────────────

describe('normalizeCounterpartyType', () => {
  it.each(['self', 'partner', 'team', 'other'] as const)('accepts "%s"', (type) =>
    expect(normalizeCounterpartyType(type)).toBe(type),
  );
  it('returns null for null', () => expect(normalizeCounterpartyType(null)).toBeNull());
  it('returns null for undefined', () => expect(normalizeCounterpartyType(undefined)).toBeNull());
});

// ── assertPositiveAmountMinor ──────────────────────────────────────────────

describe('assertPositiveAmountMinor', () => {
  it('accepts positive integers', () => expect(assertPositiveAmountMinor(100)).toBe(100));
  it('accepts 1', () => expect(assertPositiveAmountMinor(1)).toBe(1));

  it('rejects 0', () => {
    expect(() => assertPositiveAmountMinor(0)).toThrow(AppError);
  });
  it('rejects negative', () => {
    expect(() => assertPositiveAmountMinor(-5)).toThrow(AppError);
  });
  it('rejects floats', () => {
    expect(() => assertPositiveAmountMinor(1.5)).toThrow(AppError);
  });
  it('uses custom field name in error', () => {
    try {
      assertPositiveAmountMinor(0, 'myField');
    } catch (error) {
      expect((error as AppError).message).toContain('myField');
    }
  });
});

// ── isTransferKind ─────────────────────────────────────────────────────────

describe('isTransferKind', () => {
  it('true for transfer_internal', () => expect(isTransferKind('transfer_internal')).toBe(true));
  it('true for transfer_external', () => expect(isTransferKind('transfer_external')).toBe(true));
  it('false for expense', () => expect(isTransferKind('expense')).toBe(false));
  it('false for income', () => expect(isTransferKind('income')).toBe(false));
});

// ── deriveExpenseKind ──────────────────────────────────────────────────────

describe('deriveExpenseKind', () => {
  describe('expense category', () => {
    const category = makeCategory({ kind: 'expense' });

    it('derives "expense" with no requested kind', () => {
      expect(deriveExpenseKind({ category, requestedKind: null, transferDirection: null })).toBe(
        'expense',
      );
    });

    it('accepts matching requested kind', () => {
      expect(
        deriveExpenseKind({ category, requestedKind: 'expense', transferDirection: null }),
      ).toBe('expense');
    });

    it('rejects mismatched kind', () => {
      expect(() =>
        deriveExpenseKind({ category, requestedKind: 'income', transferDirection: null }),
      ).toThrow('kind does not match category kind');
    });

    it('rejects transfer kind on expense category', () => {
      expect(() =>
        deriveExpenseKind({
          category,
          requestedKind: 'transfer_external',
          transferDirection: null,
        }),
      ).toThrow('transfer kinds require a transfer category');
    });
  });

  describe('income category', () => {
    const category = makeCategory({ kind: 'income' });

    it('derives "income" with no requested kind', () => {
      expect(deriveExpenseKind({ category, requestedKind: null, transferDirection: null })).toBe(
        'income',
      );
    });
  });

  describe('transfer category', () => {
    const category = makeCategory({ kind: 'transfer' });

    it('requires transferDirection', () => {
      expect(() =>
        deriveExpenseKind({ category, requestedKind: null, transferDirection: null }),
      ).toThrow('transferDirection is required');
    });

    it('defaults to transfer_external when no kind requested', () => {
      expect(deriveExpenseKind({ category, requestedKind: null, transferDirection: 'out' })).toBe(
        'transfer_external',
      );
    });

    it('accepts transfer_internal', () => {
      expect(
        deriveExpenseKind({
          category,
          requestedKind: 'transfer_internal',
          transferDirection: 'out',
        }),
      ).toBe('transfer_internal');
    });

    it('accepts transfer_external', () => {
      expect(
        deriveExpenseKind({
          category,
          requestedKind: 'transfer_external',
          transferDirection: 'in',
        }),
      ).toBe('transfer_external');
    });

    it('rejects non-transfer kind on transfer category', () => {
      expect(() =>
        deriveExpenseKind({ category, requestedKind: 'expense', transferDirection: 'out' }),
      ).toThrow('kind must be transfer_internal or transfer_external');
    });
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

  it('returns amountMinor - myShareMinor for reimbursable expense', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 10000, myShareMinor: 3000 }))).toBe(
      7000,
    );
  });

  it('returns full amount when myShareMinor is 0', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 5000, myShareMinor: 0 }))).toBe(5000);
  });

  it('returns full amount when myShareMinor is null', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 5000, myShareMinor: null }))).toBe(
      5000,
    );
  });

  it('clamps to 0 when myShareMinor exceeds amount', () => {
    expect(computeRecoverableMinor(makeExpense({ amountMinor: 1000, myShareMinor: 2000 }))).toBe(0);
  });
});

// ── deriveReimbursementStatus ──────────────────────────────────────────────

describe('deriveReimbursementStatus', () => {
  it('returns "none" for non-expense kinds', () => {
    expect(
      deriveReimbursementStatus({ expense: makeExpense({ kind: 'income' }), recoveredMinor: 0 }),
    ).toBe('none');
  });

  it('returns "none" when not reimbursable (status=none + myShare=null)', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({ reimbursementStatus: 'none', myShareMinor: null }),
        recoveredMinor: 0,
      }),
    ).toBe('none');
  });

  it('returns "expected" when nothing recovered', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({ amountMinor: 10000, myShareMinor: 2000 }),
        recoveredMinor: 0,
      }),
    ).toBe('expected');
  });

  it('returns "partial" when partially recovered', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({ amountMinor: 10000, myShareMinor: 2000 }),
        recoveredMinor: 3000,
      }),
    ).toBe('partial');
  });

  it('returns "settled" when fully recovered', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({ amountMinor: 10000, myShareMinor: 2000 }),
        recoveredMinor: 8000,
      }),
    ).toBe('settled');
  });

  it('returns "written_off" when closedOutstandingMinor > 0', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({
          amountMinor: 10000,
          myShareMinor: 2000,
          closedOutstandingMinor: 3000,
        }),
        recoveredMinor: 5000,
      }),
    ).toBe('written_off');
  });

  it('returns "settled" when recoverableMinor is 0 (myShare == amount)', () => {
    expect(
      deriveReimbursementStatus({
        expense: makeExpense({ amountMinor: 5000, myShareMinor: 5000 }),
        recoveredMinor: 0,
      }),
    ).toBe('settled');
  });
});

// ── enrichExpensesWithReimbursements ───────────────────────────────────────

describe('enrichExpensesWithReimbursements', () => {
  it('enriches expense items with reimbursement fields', () => {
    const items = [makeExpense({ id: 'e1', amountMinor: 10000, myShareMinor: 2000 })] as never[];
    const recoveredByOutId = new Map([['e1', 3000]]);

    const result = enrichExpensesWithReimbursements({ items, recoveredByOutId });

    expect(result[0]).toMatchObject({
      recoverableMinor: 8000,
      recoveredMinor: 3000,
      outstandingMinor: 5000,
      reimbursementStatus: 'partial',
    });
  });

  it('handles items with no recovery data', () => {
    const items = [makeExpense({ id: 'e2', amountMinor: 5000, myShareMinor: 1000 })] as never[];
    const recoveredByOutId = new Map<string, number>();

    const result = enrichExpensesWithReimbursements({ items, recoveredByOutId });

    expect(result[0]).toMatchObject({
      recoverableMinor: 4000,
      recoveredMinor: 0,
      outstandingMinor: 4000,
      reimbursementStatus: 'expected',
    });
  });
});

// ── resolveReimbursableDefaults ────────────────────────────────────────────

describe('resolveReimbursableDefaults', () => {
  it('returns false for income categories', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'income' }),
        kind: 'income',
        requestedReimbursable: undefined,
      }),
    ).toBe(false);
  });

  it('throws if reimbursable requested on income', () => {
    expect(() =>
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'income' }),
        kind: 'income',
        requestedReimbursable: true,
      }),
    ).toThrow('Only expense rows can be reimbursable');
  });

  it('returns false for category with reimbursementMode=none', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'none' }),
        kind: 'expense',
        requestedReimbursable: undefined,
      }),
    ).toBe(false);
  });

  it('throws if reimbursable requested on mode=none category', () => {
    expect(() =>
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'none' }),
        kind: 'expense',
        requestedReimbursable: true,
      }),
    ).toThrow('Category does not allow reimbursement tracking');
  });

  it('returns true for category with reimbursementMode=always', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'always' }),
        kind: 'expense',
        requestedReimbursable: undefined,
      }),
    ).toBe(true);
  });

  it('throws if reimbursable=false on mode=always category', () => {
    expect(() =>
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'always' }),
        kind: 'expense',
        requestedReimbursable: false,
      }),
    ).toThrow('cannot be disabled per-row');
  });

  it('respects explicit request for mode=optional', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'optional' }),
        kind: 'expense',
        requestedReimbursable: false,
      }),
    ).toBe(false);
  });

  it('defaults to true for mode=optional with no request and no existing', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'optional' }),
        kind: 'expense',
        requestedReimbursable: undefined,
      }),
    ).toBe(true);
  });

  it('preserves existing reimbursable state for mode=optional', () => {
    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'optional' }),
        kind: 'expense',
        requestedReimbursable: undefined,
        existing: { reimbursementStatus: 'none' as const, myShareMinor: null },
      }),
    ).toBe(false);

    expect(
      resolveReimbursableDefaults({
        category: makeCategory({ kind: 'expense', reimbursementMode: 'optional' }),
        kind: 'expense',
        requestedReimbursable: undefined,
        existing: { reimbursementStatus: 'expected' as const, myShareMinor: 2000 },
      }),
    ).toBe(true);
  });
});

// ── validateAndResolveMyShareMinor ─────────────────────────────────────────

describe('validateAndResolveMyShareMinor', () => {
  it('returns null when not reimbursable', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 1000,
        reimbursable: false,
        requestedMyShareMinor: undefined,
      }),
    ).toBeNull();
  });

  it('throws when myShareMinor provided but not reimbursable', () => {
    expect(() =>
      validateAndResolveMyShareMinor({
        amountMinor: 1000,
        reimbursable: false,
        requestedMyShareMinor: 500,
      }),
    ).toThrow('myShareMinor is only valid for reimbursable expenses');
  });

  it('returns 0 when reimbursable and null explicitly passed', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 1000,
        reimbursable: true,
        requestedMyShareMinor: null,
      }),
    ).toBe(0);
  });

  it('returns requested value when valid', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: 2000,
      }),
    ).toBe(2000);
  });

  it('accepts 0 as myShareMinor', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: 0,
      }),
    ).toBe(0);
  });

  it('accepts myShareMinor equal to amountMinor', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: 5000,
      }),
    ).toBe(5000);
  });

  it('throws when myShareMinor exceeds amountMinor', () => {
    expect(() =>
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: 6000,
      }),
    ).toThrow('myShareMinor must be an integer between 0 and amountMinor');
  });

  it('throws for negative myShareMinor', () => {
    expect(() =>
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: -1,
      }),
    ).toThrow(AppError);
  });

  it('throws for non-integer myShareMinor', () => {
    expect(() =>
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: 1.5,
      }),
    ).toThrow(AppError);
  });

  it('falls back to existing myShareMinor when undefined', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: undefined,
        existing: { myShareMinor: 3000 },
      }),
    ).toBe(3000);
  });

  it('falls back to 0 when undefined and no existing', () => {
    expect(
      validateAndResolveMyShareMinor({
        amountMinor: 5000,
        reimbursable: true,
        requestedMyShareMinor: undefined,
      }),
    ).toBe(0);
  });
});
