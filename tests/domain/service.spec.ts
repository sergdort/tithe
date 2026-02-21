import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runMigrations } from '@tithe/db';
import { createDomainServices } from '@tithe/domain';

const setupService = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tithe-domain-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  runMigrations(dbPath);
  const services = createDomainServices({ dbPath });
  return { services, dir };
};

describe('Domain services', () => {
  it('creates categories and expenses then returns monthly trends', async () => {
    const { services, dir } = setupService();

    try {
      const category = await services.categories.create(
        { name: 'Food', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await services.expenses.create(
        {
          occurredAt: new Date('2026-02-01T10:00:00.000Z').toISOString(),
          amountMinor: 1234,
          currency: 'GBP',
          categoryId: category.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const trends = await services.reports.monthlyTrends(6);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0]?.spendMinor).toBe(1234);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires approval token for destructive deletes', async () => {
    const { services, dir } = setupService();

    try {
      const category = await services.categories.create(
        { name: 'Rent', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const approval = await services.categories.createDeleteApproval(category.id);
      await services.categories.delete(category.id, approval.operationId, undefined, {
        actor: 'test',
        channel: 'system',
      });

      const categories = await services.categories.list();
      expect(categories.find((item) => item.id === category.id)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reassigns linked records before deleting a category', async () => {
    const { services, dir } = setupService();

    try {
      const sourceCategory = await services.categories.create(
        { name: 'Old Utilities', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );
      const targetCategory = await services.categories.create(
        { name: 'New Utilities', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await services.expenses.create(
        {
          occurredAt: new Date('2026-02-02T10:00:00.000Z').toISOString(),
          amountMinor: 999,
          currency: 'GBP',
          categoryId: sourceCategory.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const commitment = await services.commitments.create(
        {
          name: 'Internet',
          rrule: 'FREQ=MONTHLY;INTERVAL=1',
          startDate: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          defaultAmountMinor: 4500,
          currency: 'GBP',
          categoryId: sourceCategory.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const approval = await services.categories.createDeleteApproval(
        sourceCategory.id,
        targetCategory.id,
      );

      await services.categories.delete(sourceCategory.id, approval.operationId, targetCategory.id, {
        actor: 'test',
        channel: 'system',
      });

      const categories = await services.categories.list();
      const expenses = await services.expenses.list();
      const updatedCommitment = await services.commitments.get(commitment.id);

      expect(categories.find((item) => item.id === sourceCategory.id)).toBeUndefined();
      expect(expenses[0]?.categoryId).toBe(targetCategory.id);
      expect(updatedCommitment.categoryId).toBe(targetCategory.id);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks commitment instance paid on linked expense create and resets on delete', async () => {
    const { services, dir } = setupService();

    try {
      const category = await services.categories.create(
        { name: 'Housing', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await services.commitments.create(
        {
          name: 'Rent',
          rrule: 'FREQ=MONTHLY;INTERVAL=1',
          startDate: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          defaultAmountMinor: 100000,
          currency: 'GBP',
          categoryId: category.id,
        },
        { actor: 'test', channel: 'system' },
      );

      await services.commitments.runDueGeneration(
        new Date('2026-02-10T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );

      const instancesBefore = await services.commitments.listInstances();
      const instanceId = instancesBefore[0]?.id;
      expect(instanceId).toBeDefined();

      const expense = await services.expenses.create(
        {
          occurredAt: new Date('2026-02-09T10:00:00.000Z').toISOString(),
          amountMinor: 100000,
          currency: 'GBP',
          categoryId: category.id,
          source: 'commitment',
          commitmentInstanceId: instanceId,
        },
        { actor: 'test', channel: 'system' },
      );

      const paidAfterCreate = await services.commitments.listInstances('paid');
      expect(paidAfterCreate.find((item) => item.id === instanceId)?.expenseId).toBe(expense.id);

      const approval = await services.expenses.createDeleteApproval(expense.id);
      await services.expenses.delete(expense.id, approval.operationId, {
        actor: 'test',
        channel: 'system',
      });

      const pendingAfterDelete = await services.commitments.listInstances('pending');
      const resetInstance = pendingAfterDelete.find((item) => item.id === instanceId);
      expect(resetInstance?.expenseId).toBeNull();
      expect(resetInstance?.status).toBe('pending');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates due instances once and updates commitment nextDueAt', async () => {
    const { services, dir } = setupService();

    try {
      const category = await services.categories.create(
        { name: 'Subscriptions', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const commitment = await services.commitments.create(
        {
          name: 'Music Service',
          rrule: 'FREQ=MONTHLY;INTERVAL=1',
          startDate: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          defaultAmountMinor: 999,
          currency: 'GBP',
          categoryId: category.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const firstRun = await services.commitments.runDueGeneration(
        new Date('2026-03-01T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );
      const secondRun = await services.commitments.runDueGeneration(
        new Date('2026-03-01T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );
      const refreshedCommitment = await services.commitments.get(commitment.id);

      expect(firstRun.created).toBeGreaterThan(0);
      expect(secondRun.created).toBe(0);
      expect(refreshedCommitment.nextDueAt).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces approval token payload integrity and single-use semantics', async () => {
    const { services, dir } = setupService();

    try {
      const first = await services.categories.create(
        { name: 'One', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );
      const second = await services.categories.create(
        { name: 'Two', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const mismatchApproval = await services.categories.createDeleteApproval(first.id);
      await expect(
        services.categories.delete(first.id, mismatchApproval.operationId, second.id, {
          actor: 'test',
          channel: 'system',
        }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_PAYLOAD_MISMATCH',
      });

      const validApproval = await services.categories.createDeleteApproval(first.id);
      await services.categories.delete(first.id, validApproval.operationId, undefined, {
        actor: 'test',
        channel: 'system',
      });

      await expect(
        services.categories.delete(first.id, validApproval.operationId, undefined, {
          actor: 'test',
          channel: 'system',
        }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_ALREADY_USED',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
