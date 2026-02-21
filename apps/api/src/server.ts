import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fail } from '@tithe/contracts';
import { AppError, type DomainServices } from '@tithe/domain';
import Fastify, { type FastifyInstance } from 'fastify';

import { type ApiRuntimeConfig, loadApiRuntimeConfig, resolveCorsOrigin } from './config.js';
import { openApiTags } from './http/api-docs.js';
import { createAppContext } from './http/app-context.js';
import {
  featureRouteRegistrations,
  registerFeatureRoutes,
} from './http/register-feature-routes.js';

export interface BuildServerOptions {
  services?: DomainServices;
  config?: ApiRuntimeConfig;
}

export const buildServer = (options: BuildServerOptions = {}): FastifyInstance => {
  const config = options.config ?? loadApiRuntimeConfig();
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  app.register(cors, {
    origin: resolveCorsOrigin(config.corsAllowedOrigins),
  });

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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
    }

    if (isValidationError(error)) {
      return reply.status(400).send(
        fail('VALIDATION_ERROR', 'Request validation failed', {
          message: error.message,
          context: error.validationContext,
          issues: error.validation,
        }),
      );
    }

    requestLogError(request, error);
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Unexpected internal error'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(fail('NOT_FOUND', `Route ${request.method} ${request.url} not found`)),
  );

  const ctx = createAppContext({ services: options.services });
  registerFeatureRoutes(app, ctx);

  return app;
};

interface ValidationError {
  message: string;
  validation?: unknown[];
  validationContext?: string;
}

const isValidationError = (error: unknown): error is ValidationError =>
  typeof error === 'object' &&
  error !== null &&
  'validation' in error &&
  Array.isArray((error as { validation?: unknown }).validation);

const requestLogError = (
  request: { log: FastifyInstance['log']; method: string; url: string },
  error: unknown,
): void => {
  request.log.error(
    { err: error, method: request.method, url: request.url },
    'Unhandled request error',
  );
};

export { loadApiRuntimeConfig, resolveCorsOrigin, featureRouteRegistrations };
export type { ApiRuntimeConfig };
