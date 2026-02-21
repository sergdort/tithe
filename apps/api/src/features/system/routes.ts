import { ok } from '@tithe/contracts';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

export const registerSystemRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { errorEnvelopeSchema, successEnvelopeSchema } = ctx.docs;

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
