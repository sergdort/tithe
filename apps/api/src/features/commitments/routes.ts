import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../../http/app-context.js';

interface CommitmentParams {
  id: string;
}

interface CommitmentBody {
  name: string;
  rrule: string;
  startDate: string;
  defaultAmountMinor: number;
  currency: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId: string;
  graceDays?: number;
  active?: boolean;
}

interface CommitmentUpdateBody {
  name?: string;
  rrule?: string;
  startDate?: string;
  defaultAmountMinor?: number;
  currency?: string;
  amountBaseMinor?: number;
  fxRate?: number;
  categoryId?: string;
  graceDays?: number;
  active?: boolean;
}

interface DeleteCommitmentQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

interface RunDueBody {
  upTo?: string;
}

interface CommitmentInstanceQuery {
  status?: 'pending' | 'paid' | 'overdue' | 'skipped';
}

export const registerCommitmentRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { services, actorFromRequest, parseBoolean } = ctx;
  const commitmentsService = services.commitments;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    idParamsSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = ctx.docs;

  app.get(
    '/commitments',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'List recurring commitments',
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await commitmentsService.list()),
  );

  app.post<{ Body: CommitmentBody }>(
    '/commitments',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Create recurring commitment',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'rrule', 'startDate', 'defaultAmountMinor', 'currency', 'categoryId'],
          properties: {
            name: { type: 'string', minLength: 1 },
            rrule: { type: 'string', minLength: 1 },
            startDate: isoDateTimeSchema,
            defaultAmountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            graceDays: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await commitmentsService.create(request.body, actorFromRequest(request))),
  );

  app.patch<{ Params: CommitmentParams; Body: CommitmentUpdateBody }>(
    '/commitments/:id',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Update recurring commitment',
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            rrule: { type: 'string', minLength: 1 },
            startDate: isoDateTimeSchema,
            defaultAmountMinor: { type: 'integer' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            amountBaseMinor: { type: 'integer' },
            fxRate: { type: 'number', exclusiveMinimum: 0 },
            categoryId: uuidSchema,
            graceDays: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(
        await commitmentsService.update(request.params.id, request.body, actorFromRequest(request)),
      ),
  );

  app.delete<{ Params: CommitmentParams; Querystring: DeleteCommitmentQuery }>(
    '/commitments/:id',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Delete recurring commitment',
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
      if (parseBoolean(request.query.dryRun)) {
        const token = await commitmentsService.createDeleteApproval(request.params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await commitmentsService.delete(
        request.params.id,
        request.query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: request.params.id });
    },
  );

  app.post<{ Body: RunDueBody }>(
    '/commitments/run-due',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'Generate due commitment instances',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            upTo: isoDateTimeSchema,
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
      return ok(
        await commitmentsService.runDueGeneration(request.body?.upTo, actorFromRequest(request)),
      );
    },
  );

  app.get<{ Querystring: CommitmentInstanceQuery }>(
    '/commitment-instances',
    {
      schema: {
        tags: ['Commitments'],
        summary: 'List commitment instances',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'paid', 'overdue', 'skipped'],
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
    async (request) => ok(await commitmentsService.listInstances(request.query.status)),
  );
};
