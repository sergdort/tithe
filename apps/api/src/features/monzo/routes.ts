import { ok } from '@tithe/contracts';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

export const registerMonzoRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { services } = ctx;
  const monzoService = services.monzo;
  const { defaultErrorResponses, genericObjectSchema, successEnvelopeSchema } = ctx.docs;

  app.post(
    '/connect/start',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Start Monzo OAuth connect flow',
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await monzoService.connectStart()),
  );

  app.get(
    '/connect/callback',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Monzo OAuth callback endpoint',
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await monzoService.callback()),
  );

  app.post(
    '/sync',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Run Monzo sync now',
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await monzoService.syncNow()),
  );

  app.get(
    '/status',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Monzo integration status',
        response: {
          200: successEnvelopeSchema({
            type: 'object',
            additionalProperties: false,
            required: ['status', 'mode'],
            properties: {
              status: { type: 'string' },
              mode: { type: 'string' },
            },
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () =>
      ok({
        status: 'not_implemented',
        mode: 'read-only import planned',
      }),
  );
};
