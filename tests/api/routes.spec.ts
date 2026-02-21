import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildServer } from '@tithe/api/server';
import { runMigrations } from '@tithe/db';

describe('API routes', () => {
  it('exposes OpenAPI operations at /docs/json', async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.openapi).toBeDefined();
      expect(body.paths).toBeDefined();

      const expectedPaths = [
        '/health',
        '/v1/categories',
        '/v1/categories/{id}',
        '/v1/expenses',
        '/v1/expenses/{id}',
        '/v1/commitments',
        '/v1/commitments/{id}',
        '/v1/commitments/run-due',
        '/v1/commitment-instances',
        '/v1/reports/trends',
        '/v1/reports/category-breakdown',
        '/v1/reports/commitment-forecast',
        '/v1/query/run',
        '/v1/integrations/monzo/connect/start',
        '/v1/integrations/monzo/connect/callback',
        '/v1/integrations/monzo/sync',
        '/v1/integrations/monzo/status',
      ];

      const actualPaths = Object.keys(body.paths as Record<string, unknown>).sort();
      expect(actualPaths).toEqual(expectedPaths.sort());

      const tags = (body.tags as Array<{ name: string }>).map((tag) => tag.name);
      expect(tags).toEqual([
        'System',
        'Categories',
        'Expenses',
        'Commitments',
        'Reports',
        'Query',
        'Monzo',
      ]);
    } finally {
      await app.close();
    }
  });

  it('creates category and expense through HTTP', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tithe-api-test-'));
    const dbPath = path.join(dir, 'api.sqlite');
    process.env.DB_PATH = dbPath;
    runMigrations(dbPath);

    const app = buildServer();

    try {
      const categoryResponse = await app.inject({
        method: 'POST',
        url: '/v1/categories',
        payload: {
          name: 'Transport',
          kind: 'expense',
        },
      });
      const categoryBody = categoryResponse.json();

      expect(categoryResponse.statusCode).toBe(200);
      expect(categoryBody.ok).toBe(true);

      const categoryId = categoryBody.data.id as string;

      const expenseResponse = await app.inject({
        method: 'POST',
        url: '/v1/expenses',
        payload: {
          occurredAt: new Date('2026-02-05T10:00:00.000Z').toISOString(),
          amountMinor: 700,
          currency: 'GBP',
          categoryId,
        },
      });
      const expenseBody = expenseResponse.json();

      expect(expenseResponse.statusCode).toBe(200);
      expect(expenseBody.ok).toBe(true);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/v1/expenses',
      });
      const listBody = listResponse.json();
      expect(listResponse.statusCode).toBe(200);
      expect(listBody.data.length).toBe(1);
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
