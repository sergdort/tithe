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

  it('reassigns linked records before deleting a category', async () => {
    const { service, dir } = setupService();

    try {
      const sourceCategory = await service.createCategory(
        { name: 'Old Utilities', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );
      const targetCategory = await service.createCategory(
        { name: 'New Utilities', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await service.createExpense(
        {
          occurredAt: new Date('2026-02-02T10:00:00.000Z').toISOString(),
          amountMinor: 999,
          currency: 'GBP',
          categoryId: sourceCategory.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const commitment = await service.createCommitment(
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

      const approval = await service.createDeleteCategoryApproval(
        sourceCategory.id,
        targetCategory.id,
      );

      await service.deleteCategory(
        sourceCategory.id,
        approval.operationId,
        targetCategory.id,
        { actor: 'test', channel: 'system' },
      );

      const categories = await service.listCategories();
      const expenses = await service.listExpenses();
      const updatedCommitment = await service.getCommitment(commitment.id);

      expect(categories.find((item) => item.id === sourceCategory.id)).toBeUndefined();
      expect(expenses[0]?.categoryId).toBe(targetCategory.id);
      expect(updatedCommitment.categoryId).toBe(targetCategory.id);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks commitment instance paid on linked expense create and resets on delete', async () => {
    const { service, dir } = setupService();

    try {
      const category = await service.createCategory(
        { name: 'Housing', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      await service.createCommitment(
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

      await service.runCommitmentDueGeneration(
        new Date('2026-02-10T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );

      const instancesBefore = await service.listCommitmentInstances();
      const instanceId = instancesBefore[0]?.id;
      expect(instanceId).toBeDefined();

      const expense = await service.createExpense(
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

      const paidAfterCreate = await service.listCommitmentInstances('paid');
      expect(paidAfterCreate.find((item) => item.id === instanceId)?.expenseId).toBe(expense.id);

      const approval = await service.createDeleteExpenseApproval(expense.id);
      await service.deleteExpense(expense.id, approval.operationId, { actor: 'test', channel: 'system' });

      const pendingAfterDelete = await service.listCommitmentInstances('pending');
      const resetInstance = pendingAfterDelete.find((item) => item.id === instanceId);
      expect(resetInstance?.expenseId).toBeNull();
      expect(resetInstance?.status).toBe('pending');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates due instances once and updates commitment nextDueAt', async () => {
    const { service, dir } = setupService();

    try {
      const category = await service.createCategory(
        { name: 'Subscriptions', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const commitment = await service.createCommitment(
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

      const firstRun = await service.runCommitmentDueGeneration(
        new Date('2026-03-01T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );
      const secondRun = await service.runCommitmentDueGeneration(
        new Date('2026-03-01T00:00:00.000Z').toISOString(),
        { actor: 'test', channel: 'system' },
      );
      const refreshedCommitment = await service.getCommitment(commitment.id);

      expect(firstRun.created).toBeGreaterThan(0);
      expect(secondRun.created).toBe(0);
      expect(refreshedCommitment.nextDueAt).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces approval token payload integrity and single-use semantics', async () => {
    const { service, dir } = setupService();

    try {
      const first = await service.createCategory(
        { name: 'One', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );
      const second = await service.createCategory(
        { name: 'Two', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const mismatchApproval = await service.createDeleteCategoryApproval(first.id);
      await expect(
        service.deleteCategory(first.id, mismatchApproval.operationId, second.id, {
          actor: 'test',
          channel: 'system',
        }),
      ).rejects.toMatchObject({
        code: 'APPROVAL_PAYLOAD_MISMATCH',
      });

      const validApproval = await service.createDeleteCategoryApproval(first.id);
      await service.deleteCategory(first.id, validApproval.operationId, undefined, {
        actor: 'test',
        channel: 'system',
      });

      await expect(
        service.deleteCategory(first.id, validApproval.operationId, undefined, {
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
