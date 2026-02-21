import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../../http/app-context.js';

export const registerExpenseRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { service, actorFromRequest, parseBoolean } = ctx;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    idParamsSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = ctx.docs;

  app.get(
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
    async (request) => {
      const query = z
        .object({
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
          categoryId: z.string().uuid().optional(),
          limit: z.coerce.number().int().positive().max(1000).optional(),
        })
        .parse(request.query);

      return ok(await service.listExpenses(query));
    },
  );

  app.get(
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
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      return ok(await service.getExpense(params.id));
    },
  );

  app.post(
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
    async (request) => {
      const payload = z
        .object({
          occurredAt: z.string().datetime({ offset: true }),
          postedAt: z.string().datetime({ offset: true }).nullable().optional(),
          amountMinor: z.number().int(),
          currency: z.string().length(3),
          amountBaseMinor: z.number().int().optional(),
          fxRate: z.number().positive().optional(),
          categoryId: z.string().uuid(),
          source: z.enum(['manual', 'monzo_import', 'commitment']).optional(),
          merchantName: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
          externalRef: z.string().nullable().optional(),
          commitmentInstanceId: z.string().uuid().nullable().optional(),
        })
        .parse(request.body);

      return ok(await service.createExpense(payload, actorFromRequest(request)));
    },
  );

  app.patch(
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
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z
        .object({
          occurredAt: z.string().datetime({ offset: true }).optional(),
          postedAt: z.string().datetime({ offset: true }).nullable().optional(),
          amountMinor: z.number().int().optional(),
          currency: z.string().length(3).optional(),
          amountBaseMinor: z.number().int().optional(),
          fxRate: z.number().positive().optional(),
          categoryId: z.string().uuid().optional(),
          merchantName: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
        })
        .parse(request.body);

      return ok(await service.updateExpense(params.id, payload, actorFromRequest(request)));
    },
  );

  app.delete(
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
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const query = z
        .object({
          dryRun: z.union([z.string(), z.boolean()]).optional(),
          approveOperationId: z.string().uuid().optional(),
        })
        .parse(request.query);

      if (parseBoolean(query.dryRun)) {
        const token = await service.createDeleteExpenseApproval(params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await service.deleteExpense(params.id, query.approveOperationId, actorFromRequest(request));
      return ok({ deleted: true, id: params.id });
    },
  );
};
