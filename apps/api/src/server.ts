import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fail } from '@tithe/contracts';
import { AppError, type ExpenseTrackerService } from '@tithe/domain';
import Fastify, { type FastifyInstance } from 'fastify';

import { openApiTags } from './http/api-docs.js';
import { createAppContext } from './http/app-context.js';
import { registerFeatureRoutes } from './http/register-feature-routes.js';

export interface BuildServerOptions {
  service?: ExpenseTrackerService;
}

export const buildServer = (options: BuildServerOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Tithe API',
        version: '0.1.0',
      },
      tags: openApiTags,
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

  const ctx = createAppContext({ service: options.service });
  registerFeatureRoutes(app, ctx);

  return app;
};

const requestLogError = (app: FastifyInstance, error: unknown): void => {
  app.log.error({ err: error }, 'Unhandled error');
};
