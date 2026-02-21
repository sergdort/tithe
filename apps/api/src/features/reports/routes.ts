import { ok } from '@tithe/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppContext } from '../../http/app-context.js';

export const registerReportRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { service } = ctx;
  const { defaultErrorResponses, genericObjectSchema, isoDateTimeSchema, successEnvelopeSchema } =
    ctx.docs;

  app.get(
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
    async (request) => {
      const query = z
        .object({
          months: z.coerce.number().int().positive().max(24).optional(),
        })
        .parse(request.query);

      return ok(await service.reportMonthlyTrends(query.months ?? 6));
    },
  );

  app.get(
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
    async (request) => {
      const query = z
        .object({
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
        })
        .parse(request.query);

      return ok(await service.reportCategoryBreakdown(query.from, query.to));
    },
  );

  app.get(
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
    async (request) => {
      const query = z
        .object({
          days: z.coerce.number().int().positive().max(365).optional(),
        })
        .parse(request.query);

      return ok(await service.reportCommitmentForecast(query.days ?? 30));
    },
  );
};
