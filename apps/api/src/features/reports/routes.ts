import { ok } from '@tithe/contracts';
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

export const registerReportRoutes = (app: FastifyInstance): void => {
  const { services, docs } = app.tithe;
  const reportsService = services.reports;
  const { defaultErrorResponses, genericObjectSchema, isoDateTimeSchema, successEnvelopeSchema } =
    docs;

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
};
