import { z } from 'zod';

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  amountBaseMinor: z.number().int().optional(),
  fxRate: z.number().positive().optional(),
});

export const categoryKindSchema = z.enum(['expense', 'income', 'transfer']);

export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  kind: categoryKindSchema,
  icon: z.string().default('receipt_long'),
  color: z.string().default('#2E7D32'),
  isSystem: z.boolean().default(false),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const expenseSourceSchema = z.enum(['local', 'monzo', 'commitment']);
export const transferDirectionSchema = z.enum(['in', 'out']);

export const expenseSchema = z.object({
  id: z.string().min(1),
  occurredAt: isoDateTimeSchema,
  postedAt: isoDateTimeSchema.nullable(),
  money: moneySchema,
  categoryId: z.string().uuid(),
  source: expenseSourceSchema,
  transferDirection: transferDirectionSchema.nullable(),
  merchantName: z.string().nullable(),
  merchantLogoUrl: z.string().nullable(),
  merchantEmoji: z.string().nullable(),
  note: z.string().nullable(),
  providerTransactionId: z.string().nullable(),
  commitmentInstanceId: z.string().uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const commitmentStatusSchema = z.enum(['pending', 'paid', 'overdue', 'skipped']);

export const recurringCommitmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rrule: z.string().min(1),
  startDate: isoDateTimeSchema,
  defaultMoney: moneySchema,
  categoryId: z.string().uuid(),
  graceDays: z.number().int().nonnegative(),
  active: z.boolean(),
  nextDueAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const commitmentInstanceSchema = z.object({
  id: z.string().uuid(),
  commitmentId: z.string().uuid(),
  dueAt: isoDateTimeSchema,
  expectedMoney: moneySchema,
  status: commitmentStatusSchema,
  expenseId: z.string().uuid().nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const trendPointSchema = z.object({
  month: z.string(),
  spendMinor: z.number().int(),
  spendBaseMinor: z.number().int(),
  txCount: z.number().int().nonnegative(),
});

export const monthlyLedgerCategoryRowSchema = z.object({
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  totalMinor: z.number().int(),
  txCount: z.number().int().nonnegative(),
});

export const monthlyLedgerTransferRowSchema = monthlyLedgerCategoryRowSchema.extend({
  direction: transferDirectionSchema,
});

export const monthlyLedgerSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  range: z.object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
  }),
  totals: z.object({
    incomeMinor: z.number().int(),
    expenseMinor: z.number().int(),
    transferInMinor: z.number().int(),
    transferOutMinor: z.number().int(),
    operatingSurplusMinor: z.number().int(),
    netCashMovementMinor: z.number().int(),
    txCount: z.number().int().nonnegative(),
  }),
  sections: z.object({
    income: z.array(monthlyLedgerCategoryRowSchema),
    expense: z.array(monthlyLedgerCategoryRowSchema),
    transfer: z.array(monthlyLedgerTransferRowSchema),
  }),
});

export const queryFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

export const querySpecSchema = z.object({
  entity: z.enum(['expenses', 'categories', 'commitment_instances', 'recurring_commitments']),
  filters: z.array(queryFilterSchema).default([]),
  sortBy: z.string().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().positive().max(1000).default(100),
});

export const responseMetaSchema = z.record(z.string(), z.any()).default({});

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: responseMetaSchema,
  });

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.any()).optional(),
  }),
});

export type Money = z.infer<typeof moneySchema>;
export type Category = z.infer<typeof categorySchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type RecurringCommitment = z.infer<typeof recurringCommitmentSchema>;
export type CommitmentInstance = z.infer<typeof commitmentInstanceSchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type MonthlyLedger = z.infer<typeof monthlyLedgerSchema>;
export type QuerySpec = z.infer<typeof querySpecSchema>;

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  meta: Record<string, unknown>;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export const ok = <T>(data: T, meta: Record<string, unknown> = {}): SuccessEnvelope<T> => ({
  ok: true,
  data,
  meta,
});

export const fail = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope => ({
  ok: false,
  error: {
    code,
    message,
    ...(details ? { details } : {}),
  },
});
