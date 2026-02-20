import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fail, ok } from '@tithe/contracts';
import { AppError, ExpenseTrackerService } from '@tithe/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

const actorFromRequest = (request: { ip: string; headers: Record<string, unknown> }) => {
  const actorHeader = request.headers['x-actor'];
  const actor = typeof actorHeader === 'string' ? actorHeader : request.ip;
  return {
    actor,
    channel: 'api' as const,
  };
};

const parseBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === '1';

export const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true });
  const service = new ExpenseTrackerService();

  app.register(cors, { origin: true });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Tithe API',
        version: '0.1.0',
      },
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
    }

    requestLogError(app, error);
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Unexpected internal error'));
  });

  app.get('/health', async () => ok({ status: 'ok' }));

  app.get('/v1/categories', async () => ok(await service.listCategories()));

  app.post('/v1/categories', async (request) => {
    const payload = z
      .object({
        name: z.string().min(1),
        kind: z.enum(['expense', 'income', 'transfer']),
        icon: z.string().optional(),
        color: z.string().optional(),
      })
      .parse(request.body);

    const category = await service.createCategory(payload, actorFromRequest(request));
    return ok(category);
  });

  app.patch('/v1/categories/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        name: z.string().min(1).optional(),
        kind: z.enum(['expense', 'income', 'transfer']).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(request.body);

    const category = await service.updateCategory(params.id, payload, actorFromRequest(request));
    return ok(category);
  });

  app.delete('/v1/categories/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        dryRun: z.union([z.string(), z.boolean()]).optional(),
        reassignCategoryId: z.string().uuid().optional(),
        approveOperationId: z.string().uuid().optional(),
      })
      .parse(request.query);

    if (parseBoolean(query.dryRun)) {
      const token = await service.createDeleteCategoryApproval(params.id, query.reassignCategoryId);
      return ok(token, { mode: 'dry-run' });
    }

    if (!query.approveOperationId) {
      throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
    }

    await service.deleteCategory(
      params.id,
      query.approveOperationId,
      query.reassignCategoryId,
      actorFromRequest(request),
    );

    return ok({ deleted: true, id: params.id });
  });

  app.get('/v1/expenses', async (request) => {
    const query = z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        categoryId: z.string().uuid().optional(),
        limit: z.coerce.number().int().positive().max(1000).optional(),
      })
      .parse(request.query);

    return ok(await service.listExpenses(query));
  });

  app.get('/v1/expenses/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return ok(await service.getExpense(params.id));
  });

  app.post('/v1/expenses', async (request) => {
    const payload = z
      .object({
        occurredAt: z.string().datetime({ offset: true }),
        postedAt: z.string().datetime({ offset: true }).nullable().optional(),
        amountMinor: z.number().int(),
        currency: z.string().length(3),
        amountBaseMinor: z.number().int().optional(),
        fxRate: z.number().positive().optional(),
        categoryId: z.string().uuid(),
        source: z.enum(['manual', 'monzo_import', 'commitment']).optional(),
        merchantName: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        externalRef: z.string().nullable().optional(),
        commitmentInstanceId: z.string().uuid().nullable().optional(),
      })
      .parse(request.body);

    return ok(await service.createExpense(payload, actorFromRequest(request)));
  });

  app.patch('/v1/expenses/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        occurredAt: z.string().datetime({ offset: true }).optional(),
        postedAt: z.string().datetime({ offset: true }).nullable().optional(),
        amountMinor: z.number().int().optional(),
        currency: z.string().length(3).optional(),
        amountBaseMinor: z.number().int().optional(),
        fxRate: z.number().positive().optional(),
        categoryId: z.string().uuid().optional(),
        merchantName: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
      .parse(request.body);

    return ok(await service.updateExpense(params.id, payload, actorFromRequest(request)));
  });

  app.delete('/v1/expenses/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        dryRun: z.union([z.string(), z.boolean()]).optional(),
        approveOperationId: z.string().uuid().optional(),
      })
      .parse(request.query);

    if (parseBoolean(query.dryRun)) {
      const token = await service.createDeleteExpenseApproval(params.id);
      return ok(token, { mode: 'dry-run' });
    }

    if (!query.approveOperationId) {
      throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
    }

    await service.deleteExpense(params.id, query.approveOperationId, actorFromRequest(request));
    return ok({ deleted: true, id: params.id });
  });

  app.get('/v1/commitments', async () => ok(await service.listCommitments()));

  app.post('/v1/commitments', async (request) => {
    const payload = z
      .object({
        name: z.string().min(1),
        rrule: z.string().min(1),
        startDate: z.string().datetime({ offset: true }),
        defaultAmountMinor: z.number().int(),
        currency: z.string().length(3),
        amountBaseMinor: z.number().int().optional(),
        fxRate: z.number().positive().optional(),
        categoryId: z.string().uuid(),
        graceDays: z.number().int().nonnegative().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    return ok(await service.createCommitment(payload, actorFromRequest(request)));
  });

  app.patch('/v1/commitments/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        name: z.string().min(1).optional(),
        rrule: z.string().min(1).optional(),
        startDate: z.string().datetime({ offset: true }).optional(),
        defaultAmountMinor: z.number().int().optional(),
        currency: z.string().length(3).optional(),
        amountBaseMinor: z.number().int().optional(),
        fxRate: z.number().positive().optional(),
        categoryId: z.string().uuid().optional(),
        graceDays: z.number().int().nonnegative().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    return ok(await service.updateCommitment(params.id, payload, actorFromRequest(request)));
  });

  app.delete('/v1/commitments/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        dryRun: z.union([z.string(), z.boolean()]).optional(),
        approveOperationId: z.string().uuid().optional(),
      })
      .parse(request.query);

    if (parseBoolean(query.dryRun)) {
      const token = await service.createDeleteCommitmentApproval(params.id);
      return ok(token, { mode: 'dry-run' });
    }

    if (!query.approveOperationId) {
      throw new AppError('APPROVAL_REQUIRED', 'approveOperationId is required for delete', 400);
    }

    await service.deleteCommitment(params.id, query.approveOperationId, actorFromRequest(request));
    return ok({ deleted: true, id: params.id });
  });

  app.post('/v1/commitments/run-due', async (request) => {
    const payload = z
      .object({
        upTo: z.string().datetime({ offset: true }).optional(),
      })
      .parse(request.body ?? {});

    return ok(await service.runCommitmentDueGeneration(payload.upTo, actorFromRequest(request)));
  });

  app.get('/v1/commitment-instances', async (request) => {
    const query = z
      .object({
        status: z.enum(['pending', 'paid', 'overdue', 'skipped']).optional(),
      })
      .parse(request.query);

    return ok(await service.listCommitmentInstances(query.status));
  });

  app.get('/v1/reports/trends', async (request) => {
    const query = z
      .object({
        months: z.coerce.number().int().positive().max(24).optional(),
      })
      .parse(request.query);

    return ok(await service.reportMonthlyTrends(query.months ?? 6));
  });

  app.get('/v1/reports/category-breakdown', async (request) => {
    const query = z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
      })
      .parse(request.query);

    return ok(await service.reportCategoryBreakdown(query.from, query.to));
  });

  app.get('/v1/reports/commitment-forecast', async (request) => {
    const query = z
      .object({
        days: z.coerce.number().int().positive().max(365).optional(),
      })
      .parse(request.query);

    return ok(await service.reportCommitmentForecast(query.days ?? 30));
  });

  app.post('/v1/query/run', async (request) => {
    const payload = z
      .object({
        entity: z.enum(['expenses', 'categories', 'commitment_instances', 'recurring_commitments']),
        filters: z
          .array(
            z.object({
              field: z.string(),
              op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like']),
              value: z.union([
                z.string(),
                z.number(),
                z.boolean(),
                z.array(z.union([z.string(), z.number()])),
              ]),
            }),
          )
          .optional(),
        sortBy: z.string().optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
      .parse(request.body);

    const result = await service.runQuery({
      entity: payload.entity,
      filters: payload.filters ?? [],
      sortBy: payload.sortBy ?? 'created_at',
      sortDir: payload.sortDir ?? 'desc',
      limit: payload.limit ?? 100,
    });

    return result;
  });

  app.post('/v1/integrations/monzo/connect/start', async () =>
    ok(await service.monzoConnectStart()),
  );

  app.get('/v1/integrations/monzo/connect/callback', async () => ok(await service.monzoCallback()));

  app.post('/v1/integrations/monzo/sync', async () => ok(await service.monzoSyncNow()));

  app.get('/v1/integrations/monzo/status', async () =>
    ok({
      status: 'not_implemented',
      mode: 'read-only import planned',
    }),
  );

  return app;
};

const requestLogError = (app: FastifyInstance, error: unknown): void => {
  app.log.error({ err: error }, 'Unhandled error');
};
