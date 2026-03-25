import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

interface FundingLinkBody {
  incomeExpenseId: string;
  transferExpenseId: string;
  amountMinor: number;
  idempotencyKey?: string | null;
}

interface FundingLinkParams {
  id: string;
}

interface FundingLinkDeleteQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

export const registerFundingLinkRoutes = (app: FastifyInstance): void => {
  const { services, actorFromRequest, parseBoolean, docs } = app.tithe;
  const fundingLinksService = services.fundingLinks;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = docs;

  const linkSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'incomeExpenseId',
      'transferExpenseId',
      'amountMinor',
      'idempotencyKey',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: uuidSchema,
      incomeExpenseId: { type: 'string', minLength: 1 },
      transferExpenseId: { type: 'string', minLength: 1 },
      amountMinor: { type: 'integer', minimum: 1 },
      idempotencyKey: {
        oneOf: [{ type: 'string' }, { type: 'null' }],
      },
      createdAt: isoDateTimeSchema,
      updatedAt: isoDateTimeSchema,
    },
  } as const;

  app.get<{ Params: { transferExpenseId: string } }>(
    '/by-transfer/:transferExpenseId',
    {
      schema: {
        tags: ['Funding Links'],
        summary: 'List funding links for a transfer expense',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['transferExpenseId'],
          properties: {
            transferExpenseId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: successEnvelopeSchema({ type: 'array', items: linkSchema }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await fundingLinksService.listByTransferExpenseId(request.params.transferExpenseId)),
  );

  app.get<{ Params: { incomeExpenseId: string } }>(
    '/by-income/:incomeExpenseId',
    {
      schema: {
        tags: ['Funding Links'],
        summary: 'List funding links for an income expense',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['incomeExpenseId'],
          properties: {
            incomeExpenseId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: successEnvelopeSchema({ type: 'array', items: linkSchema }),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await fundingLinksService.listByIncomeExpenseId(request.params.incomeExpenseId)),
  );

  app.post<{ Body: FundingLinkBody }>(
    '/link',
    {
      schema: {
        tags: ['Funding Links'],
        summary: 'Create funding allocation link (income → transfer)',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['incomeExpenseId', 'transferExpenseId', 'amountMinor'],
          properties: {
            incomeExpenseId: { type: 'string', minLength: 1 },
            transferExpenseId: { type: 'string', minLength: 1 },
            amountMinor: { type: 'integer', minimum: 1 },
            idempotencyKey: {
              oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(linkSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => ok(await fundingLinksService.link(request.body, actorFromRequest(request))),
  );

  app.delete<{ Params: FundingLinkParams; Querystring: FundingLinkDeleteQuery }>(
    '/link/:id',
    {
      schema: {
        tags: ['Funding Links'],
        summary: 'Delete funding allocation link',
        description:
          'Use `dryRun=true` first to obtain an approval token, then confirm with `approveOperationId`.',
        params: docs.idParamsSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dryRun: {
              anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['true', 'false', '1', '0'] }],
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
        const token = await fundingLinksService.createUnlinkApproval(request.params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await fundingLinksService.unlink(
        request.params.id,
        request.query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: request.params.id });
    },
  );
};
