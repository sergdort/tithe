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

const closeServices = (services: unknown): void => {
  (services as { close?: () => void }).close?.();
};

describe('Domain services', () => {
  it('creates categories and expenses then returns monthly trends', async () => {
    const { services, dir } = setupService();

    try {
      const category = await services.categories.create(
        { name: 'Food', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );

      const expense = await services.expenses.create(
        {
          occurredAt: new Date('2026-02-01T10:00:00.000Z').toISOString(),
          amountMinor: 1234,
          currency: 'GBP',
          categoryId: category.id,
        },
        { actor: 'test', channel: 'system' },
      );

      expect(expense.merchantLogoUrl).toBeNull();
      expect(expense.merchantEmoji).toBeNull();

      const trends = await services.reports.monthlyTrends(6);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0]?.spendMinor).toBe(1234);
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds monthly ledger totals and enforces transfer direction for transfer categories', async () => {
    const { services, dir } = setupService();

    try {
      const incomeCategory = await services.categories.create(
        { name: 'Salary', kind: 'income' },
        { actor: 'test', channel: 'system' },
      );
      const expenseCategory = await services.categories.create(
        { name: 'Sports', kind: 'expense' },
        { actor: 'test', channel: 'system' },
      );
      const transferCategory = await services.categories.create(
        { name: 'ISA', kind: 'transfer' },
        { actor: 'test', channel: 'system' },
      );

      await services.expenses.create(
        {
          occurredAt: '2026-02-01T09:00:00.000Z',
          amountMinor: 250000,
          currency: 'GBP',
          categoryId: incomeCategory.id,
          merchantName: 'Salary',
        },
        { actor: 'test', channel: 'system' },
      );
      await services.expenses.create(
        {
          occurredAt: '2026-02-03T09:00:00.000Z',
          amountMinor: 10000,
          currency: 'GBP',
          categoryId: expenseCategory.id,
          merchantName: 'Pitch booking',
        },
        { actor: 'test', channel: 'system' },
      );
      await services.expenses.create(
        {
          occurredAt: '2026-02-04T09:00:00.000Z',
          amountMinor: 4500,
          currency: 'GBP',
          categoryId: incomeCategory.id,
          merchantName: 'Football reimbursements',
        },
        { actor: 'test', channel: 'system' },
      );
      await services.expenses.create(
        {
          occurredAt: '2026-02-10T09:00:00.000Z',
          amountMinor: 50000,
          currency: 'GBP',
          categoryId: transferCategory.id,
          transferDirection: 'out',
          merchantName: 'ISA contribution',
        },
        { actor: 'test', channel: 'system' },
      );
      await services.expenses.create(
        {
          occurredAt: '2026-02-12T09:00:00.000Z',
          amountMinor: 12500,
          currency: 'GBP',
          categoryId: transferCategory.id,
          transferDirection: 'in',
          merchantName: 'ISA withdrawal',
        },
        { actor: 'test', channel: 'system' },
      );

      const ledger = await services.reports.monthlyLedger({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      });

      expect(ledger.month).toBe('2026-02');
      expect(ledger.totals).toMatchObject({
        incomeMinor: 254500,
        expenseMinor: 10000,
        transferInMinor: 12500,
        transferOutMinor: 50000,
        operatingSurplusMinor: 244500,
        netCashMovementMinor: 207000,
        txCount: 5,
      });
      expect(ledger.sections.transfer).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ categoryName: 'ISA', direction: 'out', totalMinor: 50000 }),
          expect.objectContaining({ categoryName: 'ISA', direction: 'in', totalMinor: 12500 }),
        ]),
      );

      await expect(
        services.expenses.create(
          {
            occurredAt: '2026-02-15T09:00:00.000Z',
            amountMinor: 2000,
            currency: 'GBP',
            categoryId: transferCategory.id,
            merchantName: 'Missing direction',
          },
          { actor: 'test', channel: 'system' },
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tracks reimbursable expenses with links, idempotency, close, and reopen', async () => {
    const { services, dir } = setupService();

    try {
      const sports = await services.categories.create(
        { name: 'Sports', kind: 'expense', reimbursementMode: 'optional' },
        { actor: 'test', channel: 'system' },
      );
      const reimbursementsIncome = await services.categories.create(
        { name: 'Reimbursements', kind: 'income' },
        { actor: 'test', channel: 'system' },
      );

      const out = await services.expenses.create(
        {
          occurredAt: '2026-02-01T10:00:00.000Z',
          amountMinor: 10000,
          currency: 'GBP',
          categoryId: sports.id,
          reimbursable: true,
          myShareMinor: 2000,
          merchantName: 'Pitch booking',
        },
        { actor: 'test', channel: 'system' },
      );

      expect(out.kind).toBe('expense');
      expect(out.recoverableMinor).toBe(8000);
      expect(out.recoveredMinor).toBe(0);
      expect(out.outstandingMinor).toBe(8000);
      expect(out.reimbursementStatus).toBe('expected');

      const inbound = await services.expenses.create(
        {
          occurredAt: '2026-02-05T10:00:00.000Z',
          amountMinor: 5000,
          currency: 'GBP',
          categoryId: reimbursementsIncome.id,
          merchantName: 'Teammate repayment',
        },
        { actor: 'test', channel: 'system' },
      );

      const idempotencyKey = '11111111-1111-1111-1111-111111111111';
      const firstLink = await services.reimbursements.link(
        {
          expenseOutId: out.id,
          expenseInId: inbound.id,
          amountMinor: 3000,
          idempotencyKey,
        },
        { actor: 'test', channel: 'system' },
      );
      const retriedLink = await services.reimbursements.link(
        {
          expenseOutId: out.id,
          expenseInId: inbound.id,
          amountMinor: 3000,
          idempotencyKey,
        },
        { actor: 'test', channel: 'system' },
      );

      expect(retriedLink.id).toBe(firstLink.id);

      const afterLink = await services.expenses.get(out.id);
      expect(afterLink.recoveredMinor).toBe(3000);
      expect(afterLink.outstandingMinor).toBe(5000);
      expect(afterLink.reimbursementStatus).toBe('partial');

      const afterClose = await services.reimbursements.close(
        out.id,
        { closeOutstandingMinor: 2000, reason: 'Uncollectible' },
        { actor: 'test', channel: 'system' },
      );
      expect(afterClose.closedOutstandingMinor).toBe(2000);
      expect(afterClose.reimbursementStatus).toBe('written_off');
      expect(afterClose.outstandingMinor).toBe(3000);

      const afterReopen = await services.reimbursements.reopen(out.id, {
        actor: 'test',
        channel: 'system',
      });
      expect(afterReopen.closedOutstandingMinor).toBeNull();
      expect(afterReopen.reimbursementStatus).toBe('partial');
      expect(afterReopen.outstandingMinor).toBe(5000);
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auto-matches reimbursements using explicit category rules across different categories', async () => {
    const { services, dir } = setupService();

    try {
      const sportsExpense = await services.categories.create(
        { name: 'Sunday League', kind: 'expense', reimbursementMode: 'always', defaultRecoveryWindowDays: 14 },
        { actor: 'test', channel: 'system' },
      );
      const sportsIncome = await services.categories.create(
        { name: 'Sunday League Repayments', kind: 'income' },
        { actor: 'test', channel: 'system' },
      );
      const transferCategory = await services.categories.create(
        { name: 'Bank Transfer', kind: 'transfer' },
        { actor: 'test', channel: 'system' },
      );

      await expect(
        services.reimbursements.createCategoryRule(
          {
            expenseCategoryId: sportsIncome.id,
            inboundCategoryId: sportsExpense.id,
          },
          { actor: 'test', channel: 'system' },
        ),
      ).rejects.toMatchObject({
        code: 'REIMBURSEMENT_CATEGORY_RULE_INVALID_EXPENSE_CATEGORY',
      });

      const rule = await services.reimbursements.createCategoryRule(
        {
          expenseCategoryId: sportsExpense.id,
          inboundCategoryId: sportsIncome.id,
        },
        { actor: 'test', channel: 'system' },
      );
      expect(rule.enabled).toBe(true);

      const duplicate = await services.reimbursements.createCategoryRule(
        {
          expenseCategoryId: sportsExpense.id,
          inboundCategoryId: sportsIncome.id,
        },
        { actor: 'test', channel: 'system' },
      );
      expect(duplicate.id).toBe(rule.id);

      await services.reimbursements.createCategoryRule(
        {
          expenseCategoryId: sportsExpense.id,
          inboundCategoryId: transferCategory.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const out = await services.expenses.create(
        {
          occurredAt: '2026-02-01T10:00:00.000Z',
          amountMinor: 9000,
          currency: 'GBP',
          categoryId: sportsExpense.id,
          myShareMinor: 3000,
        },
        { actor: 'test', channel: 'system' },
      );
      expect(out.reimbursementStatus).toBe('expected');
      expect(out.outstandingMinor).toBe(6000);

      await services.expenses.create(
        {
          occurredAt: '2026-02-02T10:00:00.000Z',
          amountMinor: 6000,
          currency: 'GBP',
          categoryId: sportsIncome.id,
        },
        { actor: 'test', channel: 'system' },
      );

      const autoMatchSummary = await services.reimbursements.autoMatch(
        {
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-02-28T23:59:59.000Z',
        },
        { actor: 'test', channel: 'system' },
      );
      expect(autoMatchSummary.linksCreated).toBe(1);

      const afterAutoMatch = await services.expenses.get(out.id);
      expect(afterAutoMatch.recoveredMinor).toBe(6000);
      expect(afterAutoMatch.outstandingMinor).toBe(0);
      expect(afterAutoMatch.reimbursementStatus).toBe('settled');

      const renamedIncome = await services.categories.update(
        sportsIncome.id,
        { name: 'League repayments (renamed)' },
        { actor: 'test', channel: 'system' },
      );
      expect(renamedIncome.name).toBe('League repayments (renamed)');

      const deleteApproval = await services.reimbursements.createDeleteCategoryRuleApproval(rule.id);
      await services.reimbursements.deleteCategoryRule(rule.id, deleteApproval.operationId, {
        actor: 'test',
        channel: 'system',
      });

      const rules = await services.reimbursements.listCategoryRules();
      expect(rules.find((item) => item.id === rule.id)).toBeUndefined();
    } finally {
      closeServices(services);
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
      closeServices(services);
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
      closeServices(services);
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
      closeServices(services);
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
      closeServices(services);
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
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes domain services idempotently', () => {
    const { services, dir } = setupService();

    try {
      closeServices(services);
      closeServices(services);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
