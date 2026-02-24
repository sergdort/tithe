import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';
import type { FastifyInstance } from 'fastify';

type CategoryKind = 'expense' | 'income' | 'transfer';

interface CategoryParams {
  id: string;
}

interface CreateCategoryBody {
  name: string;
  kind: CategoryKind;
  icon?: string;
  color?: string;
  reimbursementMode?: 'none' | 'optional' | 'always';
  defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays?: number | null;
  defaultMyShareMode?: 'fixed' | 'percent' | null;
  defaultMyShareValue?: number | null;
}

interface UpdateCategoryBody {
  name?: string;
  kind?: CategoryKind;
  icon?: string;
  color?: string;
  archivedAt?: string | null;
  reimbursementMode?: 'none' | 'optional' | 'always';
  defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays?: number | null;
  defaultMyShareMode?: 'fixed' | 'percent' | null;
  defaultMyShareValue?: number | null;
}

interface DeleteCategoryQuery {
  dryRun?: boolean | 'true' | 'false' | '1' | '0';
  reassignCategoryId?: string;
  approveOperationId?: string;
}

export const registerCategoryRoutes = (app: FastifyInstance): void => {
  const { services, actorFromRequest, parseBoolean, docs } = app.tithe;
  const categoriesService = services.categories;
  const {
    defaultErrorResponses,
    genericObjectSchema,
    idParamsSchema,
    isoDateTimeSchema,
    successEnvelopeSchema,
    uuidSchema,
  } = docs;

  app.get(
    '',
    {
      schema: {
        tags: ['Categories'],
        summary: 'List categories',
        response: {
          200: successEnvelopeSchema({
            type: 'array',
            items: genericObjectSchema,
          }),
          ...defaultErrorResponses,
        },
      },
    },
    async () => ok(await categoriesService.list()),
  );

  app.post<{ Body: CreateCategoryBody }>(
    '',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Create category',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kind'],
          properties: {
            name: { type: 'string', minLength: 1 },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            icon: { type: 'string' },
            color: { type: 'string' },
            reimbursementMode: { type: 'string', enum: ['none', 'optional', 'always'] },
            defaultCounterpartyType: {
              oneOf: [
                { type: 'string', enum: ['self', 'partner', 'team', 'other'] },
                { type: 'null' },
              ],
            },
            defaultRecoveryWindowDays: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
            defaultMyShareMode: {
              oneOf: [{ type: 'string', enum: ['fixed', 'percent'] }, { type: 'null' }],
            },
            defaultMyShareValue: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      const category = await categoriesService.create(request.body, actorFromRequest(request));
      return ok(category);
    },
  );

  app.patch<{ Params: CategoryParams; Body: UpdateCategoryBody }>(
    '/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Update category',
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
            icon: { type: 'string' },
            color: { type: 'string' },
            archivedAt: {
              oneOf: [isoDateTimeSchema, { type: 'null' }],
            },
            reimbursementMode: { type: 'string', enum: ['none', 'optional', 'always'] },
            defaultCounterpartyType: {
              oneOf: [
                { type: 'string', enum: ['self', 'partner', 'team', 'other'] },
                { type: 'null' },
              ],
            },
            defaultRecoveryWindowDays: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
            defaultMyShareMode: {
              oneOf: [{ type: 'string', enum: ['fixed', 'percent'] }, { type: 'null' }],
            },
            defaultMyShareValue: {
              oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
          },
        },
        response: {
          200: successEnvelopeSchema(genericObjectSchema),
          ...defaultErrorResponses,
        },
      },
    },
    async (request) => {
      const category = await categoriesService.update(
        request.params.id,
        request.body,
        actorFromRequest(request),
      );
      return ok(category);
    },
  );

  app.delete<{ Params: CategoryParams; Querystring: DeleteCategoryQuery }>(
    '/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Delete category',
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
            reassignCategoryId: uuidSchema,
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
        const token = await categoriesService.createDeleteApproval(
          request.params.id,
          request.query.reassignCategoryId,
        );
        return ok(token, { mode: 'dry-run' });
      }

      if (!request.query.approveOperationId) {
        throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
      }

      await categoriesService.delete(
        request.params.id,
        request.query.approveOperationId,
        request.query.reassignCategoryId,
        actorFromRequest(request),
      );

      return ok({ deleted: true, id: request.params.id });
    },
  );
};
