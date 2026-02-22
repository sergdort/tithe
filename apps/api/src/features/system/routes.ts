import { ok } from '@tithe/contracts';
import type { FastifyInstance } from 'fastify';

export const registerSystemRoutes = (app: FastifyInstance): void => {
  const { errorEnvelopeSchema, successEnvelopeSchema } = app.tithe.docs;

  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Health check',
        response: {
          200: successEnvelopeSchema({
            type: 'object',
            additionalProperties: false,
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['ok'] },
            },
          }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok({ status: 'ok' }),
  );
};
