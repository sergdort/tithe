import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../../http/app-context.js';

export const registerCommitmentRoutes = (app: FastifyInstance, ctx: AppContext): void => {
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
    '/commitments',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'List recurring commitments',
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await service.listCommitments()),
  );

  app.post(
    '/commitments',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Create recurring commitment',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'rrule', 'startDate', 'defaultAmountMinor', 'currency', 'categoryId'],
          properties: {
            name: { type: 'string', minLength: 1 },
            rrule: { type: 'string', minLength: 1 },
            startDate: isoDateTimeSchema,
            defaultAmountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            graceDays: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
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
          name: z.string().min(1),
          rrule: z.string().min(1),
          startDate: z.string().datetime({ offset: true }),
          defaultAmountMinor: z.number().int(),
          currency: z.string().length(3),
          amountBaseMinor: z.number().int().optional(),
          fxRate: z.number().positive().optional(),
          categoryId: z.string().uuid(),
          graceDays: z.number().int().nonnegative().optional(),
          active: z.boolean().optional(),
        })
        .parse(request.body);

      return ok(await service.createCommitment(payload, actorFromRequest(request)));
    },
  );

  app.patch(
    '/commitments/:id',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Update recurring commitment',
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            rrule: { type: 'string', minLength: 1 },
            startDate: isoDateTimeSchema,
            defaultAmountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            graceDays: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
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
          name: z.string().min(1).optional(),
          rrule: z.string().min(1).optional(),
          startDate: z.string().datetime({ offset: true }).optional(),
          defaultAmountMinor: z.number().int().optional(),
          currency: z.string().length(3).optional(),
          amountBaseMinor: z.number().int().optional(),
          fxRate: z.number().positive().optional(),
          categoryId: z.string().uuid().optional(),
          graceDays: z.number().int().nonnegative().optional(),
          active: z.boolean().optional(),
        })
        .parse(request.body);

      return ok(await service.updateCommitment(params.id, payload, actorFromRequest(request)));
    },
  );

  app.delete(
    '/commitments/:id',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Delete recurring commitment',
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
        const token = await service.createDeleteCommitmentApproval(params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await service.deleteCommitment(
        params.id,
        query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: params.id });
    },
  );

  app.post(
    '/commitments/run-due',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Generate due commitment instances',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            upTo: isoDateTimeSchema,
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
      const payload = z
        .object({
          upTo: z.string().datetime({ offset: true }).optional(),
        })
        .parse(request.body ?? {});

      return ok(await service.runCommitmentDueGeneration(payload.upTo, actorFromRequest(request)));
    },
  );

  app.get(
    '/commitment-instances',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'List commitment instances',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'paid', 'overdue', 'skipped'],
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
          status: z.enum(['pending', 'paid', 'overdue', 'skipped']).optional(),
        })
        .parse(request.query);

      return ok(await service.listCommitmentInstances(query.status));
    },
  );
};
