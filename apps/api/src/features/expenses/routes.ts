import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

type ExpenseSource = 'local' | 'monzo' | 'commitment';
type TransferDirection = 'in' | 'out';
type ExpenseKind = 'expense' | 'income' | 'transfer_internal' | 'transfer_external';
type CounterpartyType = 'self' | 'partner' | 'team' | 'other';

interface ExpenseParams {
  id: string;
}

interface ExpenseListQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  limit?: number;
}

interface CreateExpenseBody {
  occurredAt: string;
  postedAt?: string | null;
  amountMinor: number;
  currency: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId: string;
  source?: ExpenseSource;
  transferDirection?: TransferDirection | null;
  kind?: ExpenseKind;
  reimbursable?: boolean;
  myShareMinor?: number | null;
  counterpartyType?: CounterpartyType | null;
  reimbursementGroupId?: string | null;
  merchantName?: string | null;
  note?: string | null;
  providerTransactionId?: string | null;
  commitmentInstanceId?: string | null;
}

interface UpdateExpenseBody {
  occurredAt?: string;
  postedAt?: string | null;
  amountMinor?: number;
  currency?: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId?: string;
  transferDirection?: TransferDirection | null;
  kind?: ExpenseKind;
  reimbursable?: boolean;
  myShareMinor?: number | null;
  counterpartyType?: CounterpartyType | null;
  reimbursementGroupId?: string | null;
  merchantName?: string | null;
  note?: string | null;
}

interface DeleteExpenseQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

export const registerExpenseRoutes = (app: FastifyInstance): void => {
  const { services, actorFromRequest, parseBoolean, docs } = app.tithe;
  const expensesService = services.expenses;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = docs;
  const expenseIdParamsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  } as const;
  const nullableStringSchema = {
    oneOf: [{ type: 'string' }, { type: 'null' }],
  } as const;
  const nullableIntegerSchema = {
    oneOf: [{ type: 'integer' }, { type: 'null' }],
  } as const;
  const moneyResponseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['amountMinor', 'currency'],
    properties: {
      amountMinor: { type: 'integer' },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      amountBaseMinor: { type: 'integer' },
      fxRate: { type: 'number', exclusiveMinimum: 0 },
    },
  } as const;
  const expenseResponseSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'occurredAt',
      'postedAt',
      'money',
      'categoryId',
      'source',
      'kind',
      'transferDirection',
      'reimbursementStatus',
      'myShareMinor',
      'closedOutstandingMinor',
      'counterpartyType',
      'reimbursementGroupId',
      'reimbursementClosedAt',
      'reimbursementClosedReason',
      'recoverableMinor',
      'recoveredMinor',
      'outstandingMinor',
      'merchantName',
      'merchantLogoUrl',
      'merchantEmoji',
      'note',
      'providerTransactionId',
      'commitmentInstanceId',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', minLength: 1 },
      occurredAt: isoDateTimeSchema,
      postedAt: {
        oneOf: [isoDateTimeSchema, { type: 'null' }],
      },
      money: moneyResponseSchema,
      categoryId: uuidSchema,
      source: { type: 'string', enum: ['local', 'monzo', 'commitment'] },
      kind: {
        type: 'string',
        enum: ['expense', 'income', 'transfer_internal', 'transfer_external'],
      },
      transferDirection: {
        oneOf: [{ type: 'string', enum: ['in', 'out'] }, { type: 'null' }],
      },
      reimbursementStatus: {
        type: 'string',
        enum: ['none', 'expected', 'partial', 'settled', 'written_off'],
      },
      myShareMinor: nullableIntegerSchema,
      closedOutstandingMinor: nullableIntegerSchema,
      counterpartyType: {
        oneOf: [{ type: 'string', enum: ['self', 'partner', 'team', 'other'] }, { type: 'null' }],
      },
      reimbursementGroupId: nullableStringSchema,
      reimbursementClosedAt: {
        oneOf: [isoDateTimeSchema, { type: 'null' }],
      },
      reimbursementClosedReason: nullableStringSchema,
      recoverableMinor: { type: 'integer', minimum: 0 },
      recoveredMinor: { type: 'integer', minimum: 0 },
      outstandingMinor: { type: 'integer', minimum: 0 },
      merchantName: nullableStringSchema,
      merchantLogoUrl: nullableStringSchema,
      merchantEmoji: nullableStringSchema,
      note: nullableStringSchema,
      providerTransactionId: nullableStringSchema,
      commitmentInstanceId: {
        oneOf: [uuidSchema, { type: 'null' }],
      },
      createdAt: isoDateTimeSchema,
      updatedAt: isoDateTimeSchema,
    },
  } as const;

  app.get<{ Querystring: ExpenseListQuery }>(
    '',
    {
      schema: {
        tags: ['Expenses'],
        summary: 'List expenses',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: isoDateTimeSchema,
            to: isoDateTimeSchema,
            categoryId: uuidSchema,
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 1000,
            },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: expenseResponseSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await expensesService.list(request.query)),
  );

  app.get<{ Params: ExpenseParams }>(
    '/:id',
    {
      schema: {
        tags: ['Expenses'],
        summary: 'Get expense by ID',
        params: expenseIdParamsSchema,
        response: {
          200: successEnvelopeSchema(expenseResponseSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await expensesService.get(request.params.id)),
  );

  app.post<{ Body: CreateExpenseBody }>(
    '',
    {
      schema: {
        tags: ['Expenses'],
        summary: 'Create expense',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['occurredAt', 'amountMinor', 'currency', 'categoryId'],
          properties: {
            occurredAt: isoDateTimeSchema,
            postedAt: {
              oneOf: [isoDateTimeSchema, { type: 'null' }],
            },
            amountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            source: { type: 'string', enum: ['local', 'monzo', 'commitment'] },
            kind: {
              type: 'string',
              enum: ['expense', 'income', 'transfer_internal', 'transfer_external'],
            },
            transferDirection: {
              oneOf: [{ type: 'string', enum: ['in', 'out'] }, { type: 'null' }],
            },
            reimbursable: { type: 'boolean' },
            myShareMinor: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
            counterpartyType: {
              oneOf: [
                { type: 'string', enum: ['self', 'partner', 'team', 'other'] },
                { type: 'null' },
              ],
            },
            reimbursementGroupId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            merchantName: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            note: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            providerTransactionId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            commitmentInstanceId: {
              oneOf: [uuidSchema, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(expenseResponseSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await expensesService.create(request.body, actorFromRequest(request))),
  );

  app.patch<{ Params: ExpenseParams; Body: UpdateExpenseBody }>(
    '/:id',
    {
      schema: {
        tags: ['Expenses'],
        summary: 'Update expense',
        params: expenseIdParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            occurredAt: isoDateTimeSchema,
            postedAt: {
              oneOf: [isoDateTimeSchema, { type: 'null' }],
            },
            amountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            transferDirection: {
              oneOf: [{ type: 'string', enum: ['in', 'out'] }, { type: 'null' }],
            },
            kind: {
              type: 'string',
              enum: ['expense', 'income', 'transfer_internal', 'transfer_external'],
            },
            reimbursable: { type: 'boolean' },
            myShareMinor: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
            counterpartyType: {
              oneOf: [
                { type: 'string', enum: ['self', 'partner', 'team', 'other'] },
                { type: 'null' },
              ],
            },
            reimbursementGroupId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            merchantName: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            note: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(expenseResponseSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await expensesService.update(request.params.id, request.body, actorFromRequest(request))),
  );

  app.delete<{ Params: ExpenseParams; Querystring: DeleteExpenseQuery }>(
    '/:id',
    {
      schema: {
        tags: ['Expenses'],
        summary: 'Delete expense',
        description:
          'Use `dryRun=true` first to obtain an approval token, then confirm with `approveOperationId`.',
        params: expenseIdParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dryRun: {
              oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false', '1', '0'] }],
            },
            approveOperationId: uuidSchema,
          },
        },
        response: {
          200: {
            oneOf: [
              successEnvelopeSchema({
                type: 'object',
                additionalProperties: false,
                required: ['deleted', 'id'],
                properties: {
                  deleted: { type: 'boolean' },
                  id: uuidSchema,
                },
              }),
              successEnvelopeSchema(genericObjectSchema),
            ],
          },
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      if (parseBoolean(request.query.dryRun)) {
        const token = await expensesService.createDeleteApproval(request.params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await expensesService.delete(
        request.params.id,
        request.query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: request.params.id });
    },
  );
};
