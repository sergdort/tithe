import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

type QueryEntity = 'expenses' | 'categories' | 'commitment_instances' | 'recurring_commitments';
type QueryOperation = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
type QueryFilterValue = string | number | boolean | Array<string | number>;

interface QueryFilter {
  field: string;
  op: QueryOperation;
  value: QueryFilterValue;
}

interface QueryBody {
  entity: QueryEntity;
  filters?: QueryFilter[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export const registerQueryRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { services } = ctx;
  const queryService = services.query;
  const { defaultErrorResponses, errorEnvelopeSchema, genericObjectSchema, successEnvelopeSchema } =
    ctx.docs;

  app.post<{ Body: QueryBody }>(
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
      const result = await queryService.run({
        entity: request.body.entity,
        filters: request.body.filters ?? [],
        sortBy: request.body.sortBy ?? 'created_at',
        sortDir: request.body.sortDir ?? 'desc',
        limit: request.body.limit ?? 100,
      });

      return result;
    },
  );
};
