import { ok } from '@tithe/contracts';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

interface MonzoCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

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

  app.get<{ Querystring: MonzoCallbackQuery }>(
    '/connect/callback',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Monzo OAuth callback endpoint',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string' },
            state: { type: 'string' },
            error: { type: 'string' },
            error_description: { type: 'string' },
          },
          oneOf: [
            {
              required: ['code', 'state'],
            },
            {
              required: ['error'],
            },
          ],
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(
        await monzoService.callback({
          code: request.query.code,
          state: request.query.state,
          error: request.query.error,
          errorDescription: request.query.error_description,
        }),
      ),
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
            required: [
              'status',
              'mode',
              'configured',
              'connected',
              'accountId',
              'lastSyncAt',
              'lastCursor',
              'mappingCount',
              'lastError',
            ],
            properties: {
              status: { type: 'string' },
              mode: { type: 'string' },
              configured: { type: 'boolean' },
              connected: { type: 'boolean' },
              accountId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
              lastSyncAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
              lastCursor: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
              mappingCount: { type: 'integer' },
              lastError: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            },
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await monzoService.status()),
  );
};
