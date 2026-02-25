import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

interface MonzoCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface MonzoSyncBody {
  from?: string;
  to?: string;
  overrideExisting?: boolean;
}

const normalizeMonzoSyncBody = (value: unknown): MonzoSyncBody => {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as MonzoSyncBody;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as MonzoSyncBody;
      }
    } catch {
      // Let downstream validation surface a deterministic API error.
    }
  }

  throw new AppError('VALIDATION_ERROR', 'Monzo sync body must be a JSON object', 400);
};

export const registerMonzoRoutes = (app: FastifyInstance): void => {
  const { services, docs } = app.tithe;
  const monzoService = services.monzo;
  const { defaultErrorResponses, genericObjectSchema, isoDateTimeSchema, successEnvelopeSchema } =
    docs;
  const monzoSyncBodySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      overrideExisting: { type: 'boolean' },
    },
  } as const;
  const monzoSyncSummarySchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'message',
      'imported',
      'updated',
      'skipped',
      'accountId',
      'from',
      'to',
      'cursor',
    ],
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      imported: { type: 'integer', minimum: 0 },
      updated: { type: 'integer', minimum: 0 },
      skipped: { type: 'integer', minimum: 0 },
      accountId: { type: 'string' },
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      cursor: { oneOf: [isoDateTimeSchema, { type: 'null' }] },
    },
  } as const;

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

  app.post<{ Body: unknown }>(
    '/sync',
    {
      schema: {
        tags: ['Monzo'],
        summary: 'Run Monzo sync',
        body: monzoSyncBodySchema,
        response: {
          200: successEnvelopeSchema(monzoSyncSummarySchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      const body = normalizeMonzoSyncBody(request.body);
      if (body.overrideExisting !== undefined && typeof body.overrideExisting !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'overrideExisting must be boolean', 400);
      }
      if ((body.from && !body.to) || (!body.from && body.to)) {
        throw new AppError('VALIDATION_ERROR', 'Pass both from and to for Monzo sync range', 400);
      }

      return ok(
        await monzoService.sync({
          from: body.from,
          to: body.to,
          overrideExisting: body.overrideExisting,
        }),
      );
    },
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
