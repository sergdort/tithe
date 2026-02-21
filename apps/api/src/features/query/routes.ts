import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../../http/app-context.js';

export const registerQueryRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { service } = ctx;
  const { defaultErrorResponses, errorEnvelopeSchema, genericObjectSchema, successEnvelopeSchema } =
    ctx.docs;

  app.post(
    '/run',
    {
      schema: {
        tags: ['Query'],
        summary: 'Run ad-hoc query',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['entity'],
          properties: {
            entity: {
              type: 'string',
              enum: ['expenses', 'categories', 'commitment_instances', 'recurring_commitments'],
            },
            filters: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['field', 'op', 'value'],
                properties: {
                  field: { type: 'string' },
                  op: {
                    type: 'string',
                    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like'],
                  },
                  value: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'boolean' },
                      {
                        type: 'array',
                        items: {
                          oneOf: [{ type: 'string' }, { type: 'number' }],
                        },
                      },
                    ],
                  },
                },
              },
            },
            sortBy: { type: 'string' },
            sortDir: { type: 'string', enum: ['asc', 'desc'] },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        },
        response: {
          200: {
            oneOf: [
              successEnvelopeSchema({
                type: 'array',
                items: genericObjectSchema,
              }),
              errorEnvelopeSchema,
            ],
          },
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      const payload = z
        .object({
          entity: z.enum([
            'expenses',
            'categories',
            'commitment_instances',
            'recurring_commitments',
          ]),
          filters: z
            .array(
              z.object({
                field: z.string(),
                op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like']),
                value: z.union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.array(z.union([z.string(), z.number()])),
                ]),
              }),
            )
            .optional(),
          sortBy: z.string().optional(),
          sortDir: z.enum(['asc', 'desc']).optional(),
          limit: z.number().int().positive().max(1000).optional(),
        })
        .parse(request.body);

      const result = await service.runQuery({
        entity: payload.entity,
        filters: payload.filters ?? [],
        sortBy: payload.sortBy ?? 'created_at',
        sortDir: payload.sortDir ?? 'desc',
        limit: payload.limit ?? 100,
      });

      return result;
    },
  );
};
