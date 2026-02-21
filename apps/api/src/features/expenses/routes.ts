import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

type ExpenseSource = 'manual' | 'monzo_import' | 'commitment';

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
  merchantName?: string | null;
  note?: string | null;
  externalRef?: string | null;
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
  merchantName?: string | null;
  note?: string | null;
}

interface DeleteExpenseQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

export const registerExpenseRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { services, actorFromRequest, parseBoolean } = ctx;
  const expensesService = services.expenses;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    idParamsSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = ctx.docs;

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
            items: genericObjectSchema,
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
        params: idParamsSchema,
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
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
            source: { type: 'string', enum: ['manual', 'monzo_import', 'commitment'] },
            merchantName: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            note: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            externalRef: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            commitmentInstanceId: {
              oneOf: [uuidSchema, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
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
        params: idParamsSchema,
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
            merchantName: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            note: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
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
        params: idParamsSchema,
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
