import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../../http/app-context.js';

export const registerCategoryRoutes = (app: FastifyInstance, ctx: AppContext): void => {
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
        tags: ['Categories'],
        summary: 'List categories',
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await service.listCategories()),
  );

  app.post(
    '',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Create category',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kind'],
          properties: {
            name: { type: 'string', minLength: 1 },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            icon: { type: 'string' },
            color: { type: 'string' },
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
          kind: z.enum(['expense', 'income', 'transfer']),
          icon: z.string().optional(),
          color: z.string().optional(),
        })
        .parse(request.body);

      const category = await service.createCategory(payload, actorFromRequest(request));
      return ok(category);
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Update category',
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            icon: { type: 'string' },
            color: { type: 'string' },
            archivedAt: {
              oneOf: [isoDateTimeSchema, { type: 'null' }],
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
          name: z.string().min(1).optional(),
          kind: z.enum(['expense', 'income', 'transfer']).optional(),
          icon: z.string().optional(),
          color: z.string().optional(),
          archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
        })
        .parse(request.body);

      const category = await service.updateCategory(params.id, payload, actorFromRequest(request));
      return ok(category);
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Delete category',
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
            reassignCategoryId: uuidSchema,
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
          reassignCategoryId: z.string().uuid().optional(),
          approveOperationId: z.string().uuid().optional(),
        })
        .parse(request.query);

      if (parseBoolean(query.dryRun)) {
        const token = await service.createDeleteCategoryApproval(
          params.id,
          query.reassignCategoryId,
        );
        return ok(token, { mode: 'dry-run' });
      }

      if (!query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await service.deleteCategory(
        params.id,
        query.approveOperationId,
        query.reassignCategoryId,
        actorFromRequest(request),
      );

      return ok({ deleted: true, id: params.id });
    },
  );
};
