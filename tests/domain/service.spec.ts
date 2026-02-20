import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runMigrations } from '@tithe/db';
import { ExpenseTrackerService } from '@tithe/domain';

const setupService = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tithe-domain-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  runMigrations(dbPath);
  const service = new ExpenseTrackerService({ dbPath });
  return { service, dir };
};

describe('ExpenseTrackerService', () => {
  it('creates categories and expenses then returns monthly trends', async () => {
    const { service, dir } = setupService();

    try {
      const category = await service.createCategory(
        { name: 'Food', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await service.createExpense(
        {
          occurredAt: new Date('2026-02-01T10:00:00.000Z').toISOString(),
          amountMinor: 1234,
          currency: 'GBP',
          categoryId: category.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const trends = await service.reportMonthlyTrends(6);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0]?.spendMinor).toBe(1234);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires approval token for destructive deletes', async () => {
    const { service, dir } = setupService();

    try {
      const category = await service.createCategory(
        { name: 'Rent', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const approval = await service.createDeleteCategoryApproval(category.id);
      await service.deleteCategory(category.id, approval.operationId, undefined, {
        actor: 'test',
        channel: 'system',
      });

      const categories = await service.listCategories();
      expect(categories.find((item) => item.id === category.id)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
