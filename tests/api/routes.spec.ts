import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildServer } from '@tithe/api/server';
import { runMigrations } from '@tithe/db';

describe('API routes', () => {
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
