import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type ApiRuntimeConfig,
  buildServer,
  featureRouteRegistrations,
  loadApiRuntimeConfig,
  resolveCorsOrigin,
  tithePlugin,
} from '@tithe/api/server';
import { AppError, type DomainServices } from '@tithe/domain';
import Fastify from 'fastify';
import { vi } from 'vitest';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

const baseConfig: ApiRuntimeConfig = {
  host: '127.0.0.1',
  port: 8787,
  logLevel: 'error',
  corsAllowedOrigins: ['*'],
};

const featureRouteFiles = [
  'apps/api/src/features/categories/routes.ts',
  'apps/api/src/features/commitments/routes.ts',
  'apps/api/src/features/expenses/routes.ts',
  'apps/api/src/features/reports/routes.ts',
  'apps/api/src/features/query/routes.ts',
  'apps/api/src/features/system/routes.ts',
  'apps/api/src/features/monzo/routes.ts',
] as const;

describe('API Fastify enforcement', () => {
  it('returns contract envelope for Fastify validation errors', async () => {
    const app = buildServer({ config: baseConfig });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/categories',
        payload: {
          kind: 'expense',
        },
      });
      const body = response.json();

      expect(response.statusCode).toBe(400);
      expect(body).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        }),
      });
      expect(body.error.details).toEqual(
        expect.objectContaining({
          context: 'body',
          issues: expect.any(Array),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('returns contract envelope for unknown routes', async () => {
    const app = buildServer({ config: baseConfig });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/not-a-route',
      });
      const body = response.json();

      expect(response.statusCode).toBe(404);
      expect(body).toEqual({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /v1/not-a-route not found',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('preserves AppError code/status in error envelope', async () => {
    const services = {
      categories: {
        list: async () => {
          throw new AppError('CATEGORY_NOT_FOUND', 'Category missing', 404);
        },
      },
    } as unknown as DomainServices;

    const app = buildServer({ services, config: baseConfig });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/categories',
      });
      const body = response.json();

      expect(response.statusCode).toBe(404);
      expect(body).toEqual({
        ok: false,
        error: {
          code: 'CATEGORY_NOT_FOUND',
          message: 'Category missing',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('maps unexpected errors to INTERNAL_ERROR envelope', async () => {
    const services = {
      categories: {
        list: async () => {
          throw new Error('boom');
        },
      },
    } as unknown as DomainServices;

    const app = buildServer({ services, config: baseConfig });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/categories',
      });
      const body = response.json();

      expect(response.statusCode).toBe(500);
      expect(body).toEqual({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected internal error',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('does not close externally injected services on app.close', async () => {
    const close = vi.fn();
    const services = {
      categories: { list: async () => [] },
      close,
    } as unknown as DomainServices;

    const app = buildServer({ services, config: baseConfig });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/categories',
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }

    expect(close).not.toHaveBeenCalled();
  });

  it('closes plugin-owned services on app.close', async () => {
    const close = vi.fn();
    const app = Fastify({ logger: false });

    app.register(tithePlugin, {
      createServices: () =>
        ({
          close,
        }) as unknown as DomainServices & { close: () => void },
    });

    await app.ready();
    await app.close();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('enforces explicit CORS allow-list behavior', async () => {
    const allowedOrigin = 'https://app.example.com';
    const app = buildServer({
      config: {
        ...baseConfig,
        corsAllowedOrigins: [allowedOrigin],
      },
    });

    try {
      const allowed = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: allowedOrigin,
        },
      });
      const denied = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://denied.example.com',
        },
      });

      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(denied.statusCode).toBe(200);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('validates API runtime configuration defaults and constraints', () => {
    expect(loadApiRuntimeConfig({})).toEqual({
      host: '0.0.0.0',
      port: 8787,
      logLevel: 'info',
      corsAllowedOrigins: ['*'],
    });

    expect(
      loadApiRuntimeConfig({
        HOST: '127.0.0.1',
        PORT: '9999',
        LOG_LEVEL: 'debug',
        CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      }),
    ).toEqual({
      host: '127.0.0.1',
      port: 9999,
      logLevel: 'debug',
      corsAllowedOrigins: ['https://a.example', 'https://b.example'],
    });

    expect(() => loadApiRuntimeConfig({ PORT: '99999' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
    expect(() => loadApiRuntimeConfig({ LOG_LEVEL: 'verbose' })).toThrow(
      'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace',
    );
  });

  it('resolves CORS wildcard and allow-list options deterministically', () => {
    expect(resolveCorsOrigin(['*'])).toBe(true);
    expect(resolveCorsOrigin(['https://a.example'])).toEqual(['https://a.example']);
  });

  it('enforces policy: no direct request parsing in feature routes', () => {
    for (const relativePath of featureRouteFiles) {
      const absolutePath = path.join(workspaceRoot, relativePath);
      const source = fs.readFileSync(absolutePath, 'utf8');

      expect(source).not.toMatch(/\.parse\(request\.(body|query|params)\)/);
      expect(source).not.toMatch(/from 'zod'/);
    }
  });

  it('keeps feature registration order stable', () => {
    expect(
      featureRouteRegistrations.map((feature) => [feature.name, feature.prefix ?? '']),
    ).toEqual([
      ['system', ''],
      ['categories', '/v1/categories'],
      ['expenses', '/v1/expenses'],
      ['reimbursements', '/v1/reimbursements'],
      ['commitments', '/v1'],
      ['reports', '/v1/reports'],
      ['query', '/v1/query'],
      ['monzo', '/v1/integrations/monzo'],
    ]);
  });
});
