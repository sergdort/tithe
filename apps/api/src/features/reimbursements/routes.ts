import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

interface ReimbursementLinkBody {
  expenseOutId: string;
  expenseInId: string;
  amountMinor: number;
  idempotencyKey?: string | null;
}

interface ReimbursementCategoryRuleBody {
  expenseCategoryId: string;
  inboundCategoryId: string;
  enabled?: boolean;
}

interface ReimbursementCategoryRuleParams {
  id: string;
}

interface ReimbursementCategoryRuleDeleteQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

interface ReimbursementLinkParams {
  id: string;
}

interface ReimbursementLinkDeleteQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  approveOperationId?: string;
}

interface ReimbursementCloseParams {
  expenseOutId: string;
}

interface ReimbursementCloseBody {
  reason?: string | null;
  closeOutstandingMinor?: number;
}

interface ReimbursementAutoMatchQuery {
  from?: string;
  to?: string;
}

export const registerReimbursementRoutes = (app: FastifyInstance): void => {
  const { services, actorFromRequest, parseBoolean, docs } = app.tithe;
  const reimbursementsService = services.reimbursements;
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
      'expenseOutId',
      'expenseInId',
      'amountMinor',
      'idempotencyKey',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: uuidSchema,
      expenseOutId: { type: 'string', minLength: 1 },
      expenseInId: { type: 'string', minLength: 1 },
      amountMinor: { type: 'integer', minimum: 1 },
      idempotencyKey: {
        oneOf: [{ type: 'string' }, { type: 'null' }],
      },
      createdAt: isoDateTimeSchema,
      updatedAt: isoDateTimeSchema,
    },
  } as const;

  const categoryRuleSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'expenseCategoryId', 'inboundCategoryId', 'enabled', 'createdAt', 'updatedAt'],
    properties: {
      id: uuidSchema,
      expenseCategoryId: { type: 'string', minLength: 1 },
      inboundCategoryId: { type: 'string', minLength: 1 },
      enabled: { type: 'boolean' },
      createdAt: isoDateTimeSchema,
      updatedAt: isoDateTimeSchema,
    },
  } as const;

  app.get(
    '/category-rules',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'List reimbursement category auto-match rules',
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: categoryRuleSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await reimbursementsService.listCategoryRules()),
  );

  app.post<{ Body: ReimbursementCategoryRuleBody }>(
    '/category-rules',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Create or update a reimbursement category auto-match rule',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expenseCategoryId', 'inboundCategoryId'],
          properties: {
            expenseCategoryId: { type: 'string', minLength: 1 },
            inboundCategoryId: { type: 'string', minLength: 1 },
            enabled: { type: 'boolean' },
          },
        },
        response: {
          200: successEnvelopeSchema(categoryRuleSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await reimbursementsService.createCategoryRule(request.body, actorFromRequest(request))),
  );

  app.delete<{
    Params: ReimbursementCategoryRuleParams;
    Querystring: ReimbursementCategoryRuleDeleteQuery;
  }>(
    '/category-rules/:id',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Delete reimbursement category auto-match rule',
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
        const token = await reimbursementsService.createDeleteCategoryRuleApproval(
          request.params.id,
        );
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await reimbursementsService.deleteCategoryRule(
        request.params.id,
        request.query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: request.params.id });
    },
  );

  app.post<{ Body: ReimbursementLinkBody }>(
    '/link',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Create reimbursement allocation link',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expenseOutId', 'expenseInId', 'amountMinor'],
          properties: {
            expenseOutId: { type: 'string', minLength: 1 },
            expenseInId: { type: 'string', minLength: 1 },
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
    async (request) =>
      ok(await reimbursementsService.link(request.body, actorFromRequest(request))),
  );

  app.delete<{ Params: ReimbursementLinkParams; Querystring: ReimbursementLinkDeleteQuery }>(
    '/link/:id',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Delete reimbursement allocation link',
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
        const token = await reimbursementsService.createUnlinkApproval(request.params.id);
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await reimbursementsService.unlink(
        request.params.id,
        request.query.approveOperationId,
        actorFromRequest(request),
      );
      return ok({ deleted: true, id: request.params.id });
    },
  );

  app.post<{ Params: ReimbursementCloseParams; Body: ReimbursementCloseBody }>(
    '/:expenseOutId/close',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Close outstanding reimbursable remainder (write-off)',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['expenseOutId'],
          properties: {
            expenseOutId: { type: 'string', minLength: 1 },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            closeOutstandingMinor: { type: 'integer', minimum: 0 },
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
        await reimbursementsService.close(
          request.params.expenseOutId,
          {
            closeOutstandingMinor: request.body?.closeOutstandingMinor,
            reason: request.body?.reason ?? undefined,
          },
          actorFromRequest(request),
        ),
      ),
  );

  app.post<{ Params: ReimbursementCloseParams }>(
    '/:expenseOutId/reopen',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Reopen a manually closed reimbursable expense',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['expenseOutId'],
          properties: {
            expenseOutId: { type: 'string', minLength: 1 },
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
        await reimbursementsService.reopen(request.params.expenseOutId, actorFromRequest(request)),
      ),
  );

  app.post<{ Querystring: ReimbursementAutoMatchQuery }>(
    '/auto-match',
    {
      schema: {
        tags: ['Reimbursements'],
        summary: 'Auto-match reimbursement candidates (safe mode)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: isoDateTimeSchema,
            to: isoDateTimeSchema,
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) =>
      ok(await reimbursementsService.autoMatch(request.query, actorFromRequest(request))),
  );
};
