import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

interface TrendsQuery {
  months?: number;
}

interface CategoryBreakdownQuery {
  from?: string;
  to?: string;
}

interface CommitmentForecastQuery {
  days?: number;
}

interface MonthlyLedgerQuery {
  from?: string;
  to?: string;
  month?: string;
}

const monthPattern = /^\d{4}-\d{2}$/;

const resolveMonthRange = (month: string): { from: string; to: string } => {
  if (!monthPattern.test(month)) {
    throw new AppError('VALIDATION_ERROR', 'month must match YYYY-MM', 400, { month });
  }

  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new AppError('VALIDATION_ERROR', 'month must match YYYY-MM', 400, { month });
  }

  return {
    from: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)).toISOString(),
    to: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0)).toISOString(),
  };
};

const resolveMonthlyLedgerRange = (query: MonthlyLedgerQuery): { from: string; to: string } => {
  const hasMonth = typeof query.month === 'string' && query.month.length > 0;
  const hasFrom = typeof query.from === 'string' && query.from.length > 0;
  const hasTo = typeof query.to === 'string' && query.to.length > 0;

  if (hasMonth) {
    if (hasFrom || hasTo) {
      throw new AppError('VALIDATION_ERROR', 'Use either month or from/to, not both', 400);
    }
    return resolveMonthRange(query.month as string);
  }

  if (hasFrom && hasTo) {
    return { from: query.from as string, to: query.to as string };
  }

  throw new AppError('VALIDATION_ERROR', 'Pass month or both from and to', 400);
};

export const registerReportRoutes = (app: FastifyInstance): void => {
  const { services, docs } = app.tithe;
  const reportsService = services.reports;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = docs;
  const monthlyLedgerCategoryRowSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['categoryId', 'categoryName', 'totalMinor', 'txCount'],
    properties: {
      categoryId: uuidSchema,
      categoryName: { type: 'string' },
      totalMinor: { type: 'integer' },
      txCount: { type: 'integer', minimum: 0 },
    },
  } as const;
  const monthlyLedgerTransferRowSchema = {
    ...monthlyLedgerCategoryRowSchema,
    required: [...monthlyLedgerCategoryRowSchema.required, 'direction'],
    properties: {
      ...monthlyLedgerCategoryRowSchema.properties,
      direction: { type: 'string', enum: ['in', 'out'] },
    },
  } as const;
  const monthlyLedgerResponseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['month', 'range', 'totals', 'cashFlow', 'spending', 'reimbursements', 'sections'],
    properties: {
      month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
      range: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: isoDateTimeSchema,
          to: isoDateTimeSchema,
        },
      },
      totals: {
        type: 'object',
        additionalProperties: false,
        required: [
          'incomeMinor',
          'expenseMinor',
          'transferInMinor',
          'transferOutMinor',
          'operatingSurplusMinor',
          'netCashMovementMinor',
          'txCount',
        ],
        properties: {
          incomeMinor: { type: 'integer' },
          expenseMinor: { type: 'integer' },
          transferInMinor: { type: 'integer' },
          transferOutMinor: { type: 'integer' },
          operatingSurplusMinor: { type: 'integer' },
          netCashMovementMinor: { type: 'integer' },
          txCount: { type: 'integer', minimum: 0 },
        },
      },
      cashFlow: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cashInMinor',
          'cashOutMinor',
          'internalTransferInMinor',
          'internalTransferOutMinor',
          'externalTransferInMinor',
          'externalTransferOutMinor',
          'netFlowMinor',
        ],
        properties: {
          cashInMinor: { type: 'integer' },
          cashOutMinor: { type: 'integer' },
          internalTransferInMinor: { type: 'integer' },
          internalTransferOutMinor: { type: 'integer' },
          externalTransferInMinor: { type: 'integer' },
          externalTransferOutMinor: { type: 'integer' },
          netFlowMinor: { type: 'integer' },
        },
      },
      spending: {
        type: 'object',
        additionalProperties: false,
        required: ['grossSpendMinor', 'recoveredMinor', 'writtenOffMinor', 'netPersonalSpendMinor'],
        properties: {
          grossSpendMinor: { type: 'integer' },
          recoveredMinor: { type: 'integer' },
          writtenOffMinor: { type: 'integer' },
          netPersonalSpendMinor: { type: 'integer' },
        },
      },
      reimbursements: {
        type: 'object',
        additionalProperties: false,
        required: [
          'recoverableMinor',
          'recoveredMinor',
          'outstandingMinor',
          'partialCount',
          'settledCount',
        ],
        properties: {
          recoverableMinor: { type: 'integer' },
          recoveredMinor: { type: 'integer' },
          outstandingMinor: { type: 'integer' },
          partialCount: { type: 'integer', minimum: 0 },
          settledCount: { type: 'integer', minimum: 0 },
        },
      },
      sections: {
        type: 'object',
        additionalProperties: false,
        required: ['income', 'expense', 'transfer', 'transferInternal', 'transferExternal'],
        properties: {
          income: {
            type: 'array',
            items: monthlyLedgerCategoryRowSchema,
          },
          expense: {
            type: 'array',
            items: monthlyLedgerCategoryRowSchema,
          },
          transfer: {
            type: 'array',
            items: monthlyLedgerTransferRowSchema,
          },
          transferInternal: {
            type: 'array',
            items: monthlyLedgerTransferRowSchema,
          },
          transferExternal: {
            type: 'array',
            items: monthlyLedgerTransferRowSchema,
          },
        },
      },
    },
  } as const;

  app.get<{ Querystring: TrendsQuery }>(
    '/trends',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Monthly trend report',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            months: {
              type: 'integer',
              minimum: 1,
              maximum: 24,
            },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await reportsService.monthlyTrends(request.query.months ?? 6)),
  );

  app.get<{ Querystring: CategoryBreakdownQuery }>(
    '/category-breakdown',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Category spend breakdown report',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: isoDateTimeSchema,
            to: isoDateTimeSchema,
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await reportsService.categoryBreakdown(request.query.from, request.query.to)),
  );

  app.get<{ Querystring: CommitmentForecastQuery }>(
    '/commitment-forecast',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Upcoming commitments forecast report',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
            },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await reportsService.commitmentForecast(request.query.days ?? 30)),
  );

  app.get<{ Querystring: MonthlyLedgerQuery }>(
    '/monthly-ledger',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Monthly cashflow ledger report',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: isoDateTimeSchema,
            to: isoDateTimeSchema,
            month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
          },
        },
        response: {
          200: successEnvelopeSchema(monthlyLedgerResponseSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      const { from, to } = resolveMonthlyLedgerRange(request.query);
      return ok(await reportsService.monthlyLedger({ from, to }));
    },
  );
};
