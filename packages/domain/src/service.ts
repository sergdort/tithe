import crypto from 'node:crypto';

import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import rrule from 'rrule';

import { type QuerySpec, fail, ok, querySpecSchema } from '@tithe/contracts';
import {
  categories,
  commitmentInstances,
  createDb,
  expenses,
  operationApprovals,
  recurringCommitments,
} from '@tithe/db';

import { AppError } from './errors.js';
import type {
  ActorContext,
  CreateCategoryInput,
  CreateCommitmentInput,
  CreateExpenseInput,
  ListExpensesInput,
  UpdateCategoryInput,
  UpdateCommitmentInput,
  UpdateExpenseInput,
} from './types.js';

type RRule = InstanceType<(typeof rrule)['RRule']>;

const DEFAULT_ACTOR: ActorContext = {
  actor: 'system',
  channel: 'system',
};

export interface ExpenseTrackerServiceOptions {
  dbPath?: string;
}

export interface ApprovalToken {
  operationId: string;
  action: string;
  hash: string;
  expiresAt: string;
}

const toIso = (date: Date): string => date.toISOString();

const normalizeCurrency = (currency: string): string => currency.trim().toUpperCase();

const assertDate = (value: string, field: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a valid ISO-8601 date`, 400, {
      field,
      value,
    });
  }
  return date.toISOString();
};

const toRruleDate = (value: string): string => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const operationHash = (action: string, payloadJson: string): string =>
  crypto.createHash('sha256').update(`${action}:${payloadJson}`).digest('hex');

export class ExpenseTrackerService {
  private readonly db = createDb;

  constructor(private readonly options: ExpenseTrackerServiceOptions = {}) {}

  private connect() {
    return this.db(this.options);
  }

  private async writeAudit(action: string, payload: unknown, context: ActorContext): Promise<void> {
    const { db, sqlite } = this.connect();
    try {
      const payloadJson = JSON.stringify(payload);
      await db.run(
        sql`INSERT INTO audit_log (id, actor, channel, action, payload_hash) VALUES (
            ${crypto.randomUUID()},
            ${context.actor},
            ${context.channel},
            ${action},
            ${operationHash(action, payloadJson)}
          )`,
      );
    } finally {
      sqlite.close();
    }
  }

  async listCategories() {
    const { db, sqlite } = this.connect();
    try {
      const rows = await db.select().from(categories).orderBy(categories.name);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        icon: row.icon,
        color: row.color,
        isSystem: row.isSystem,
        archivedAt: row.archivedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    } finally {
      sqlite.close();
    }
  }

  async createCategory(input: CreateCategoryInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const payload = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      icon: input.icon ?? 'receipt_long',
      color: input.color ?? '#2E7D32',
      isSystem: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const { db, sqlite } = this.connect();

    try {
      await db.insert(categories).values(payload);
    } catch (error) {
      throw new AppError('CATEGORY_CREATE_FAILED', 'Could not create category', 409, {
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sqlite.close();
    }

    await this.writeAudit('category.create', payload, context);
    return payload;
  }

  async updateCategory(
    id: string,
    input: UpdateCategoryInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { db, sqlite } = this.connect();

    try {
      const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      const patch = {
        name: input.name?.trim() ?? existing.name,
        kind: input.kind ?? (existing.kind as 'expense' | 'income' | 'transfer'),
        icon: input.icon ?? existing.icon,
        color: input.color ?? existing.color,
        archivedAt:
          input.archivedAt === undefined
            ? existing.archivedAt
            : input.archivedAt === null
              ? null
              : assertDate(input.archivedAt, 'archivedAt'),
        updatedAt: toIso(new Date()),
      };

      await db.update(categories).set(patch).where(eq(categories.id, id));

      const updated = await db.select().from(categories).where(eq(categories.id, id)).get();
      if (!updated) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      await this.writeAudit('category.update', { id, patch }, context);

      return {
        id: updated.id,
        name: updated.name,
        kind: updated.kind,
        icon: updated.icon,
        color: updated.color,
        isSystem: updated.isSystem,
        archivedAt: updated.archivedAt,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } finally {
      sqlite.close();
    }
  }

  async createDeleteCategoryApproval(
    id: string,
    reassignCategoryId?: string,
  ): Promise<ApprovalToken> {
    return this.createApproval('category.delete', { id, reassignCategoryId });
  }

  async deleteCategory(
    id: string,
    approveOperationId: string,
    reassignCategoryId?: string,
    context: ActorContext = DEFAULT_ACTOR,
  ): Promise<void> {
    await this.consumeApproval('category.delete', approveOperationId, { id, reassignCategoryId });

    const { db, sqlite } = this.connect();

    try {
      const target = await db.select().from(categories).where(eq(categories.id, id)).get();
      if (!target) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      if (reassignCategoryId) {
        const replacement = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, reassignCategoryId))
          .get();
        if (!replacement) {
          throw new AppError(
            'CATEGORY_REASSIGN_TARGET_NOT_FOUND',
            'Reassign category does not exist',
            404,
            {
              reassignCategoryId,
            },
          );
        }

        await db
          .update(expenses)
          .set({ categoryId: reassignCategoryId, updatedAt: toIso(new Date()) })
          .where(eq(expenses.categoryId, id));

        await db
          .update(recurringCommitments)
          .set({ categoryId: reassignCategoryId, updatedAt: toIso(new Date()) })
          .where(eq(recurringCommitments.categoryId, id));
      } else {
        const expenseRef = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(expenses)
          .where(eq(expenses.categoryId, id))
          .get();

        const commitmentRef = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(recurringCommitments)
          .where(eq(recurringCommitments.categoryId, id))
          .get();

        if ((expenseRef?.count ?? 0) > 0 || (commitmentRef?.count ?? 0) > 0) {
          throw new AppError(
            'CATEGORY_IN_USE',
            'Category has linked expenses or commitments. Pass reassign category.',
            409,
            {
              expenseCount: expenseRef?.count ?? 0,
              commitmentCount: commitmentRef?.count ?? 0,
            },
          );
        }
      }

      await db.delete(categories).where(eq(categories.id, id));
      await this.writeAudit('category.delete', { id, reassignCategoryId }, context);
    } finally {
      sqlite.close();
    }
  }

  async listExpenses(input: ListExpensesInput = {}) {
    const { db, sqlite } = this.connect();

    try {
      const filters = [];
      if (input.from) {
        filters.push(gte(expenses.occurredAt, assertDate(input.from, 'from')));
      }
      if (input.to) {
        filters.push(lte(expenses.occurredAt, assertDate(input.to, 'to')));
      }
      if (input.categoryId) {
        filters.push(eq(expenses.categoryId, input.categoryId));
      }

      const whereExpr = filters.length > 0 ? and(...filters) : undefined;

      const query = db
        .select()
        .from(expenses)
        .orderBy(desc(expenses.occurredAt))
        .limit(input.limit ?? 200);

      const rows = whereExpr ? await query.where(whereExpr) : await query;

      return rows.map((row) => this.mapExpense(row));
    } finally {
      sqlite.close();
    }
  }

  async getExpense(id: string) {
    const { db, sqlite } = this.connect();
    try {
      const row = await db.select().from(expenses).where(eq(expenses.id, id)).get();
      if (!row) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }
      return this.mapExpense(row);
    } finally {
      sqlite.close();
    }
  }

  private mapExpense(row: typeof expenses.$inferSelect) {
    return {
      id: row.id,
      occurredAt: row.occurredAt,
      postedAt: row.postedAt,
      money: {
        amountMinor: row.amountMinor,
        currency: row.currency,
        ...(row.amountBaseMinor !== null && row.amountBaseMinor !== undefined
          ? { amountBaseMinor: row.amountBaseMinor }
          : {}),
        ...(row.fxRate !== null && row.fxRate !== undefined ? { fxRate: row.fxRate } : {}),
      },
      categoryId: row.categoryId,
      source: row.source as 'manual' | 'monzo_import' | 'commitment',
      merchantName: row.merchantName,
      note: row.note,
      externalRef: row.externalRef,
      commitmentInstanceId: row.commitmentInstanceId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createExpense(input: CreateExpenseInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const payload = {
      id: crypto.randomUUID(),
      occurredAt: assertDate(input.occurredAt, 'occurredAt'),
      postedAt: input.postedAt ? assertDate(input.postedAt, 'postedAt') : null,
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      amountBaseMinor: input.amountBaseMinor,
      fxRate: input.fxRate,
      categoryId: input.categoryId,
      source: input.source ?? 'manual',
      merchantName: input.merchantName ?? null,
      note: input.note ?? null,
      externalRef: input.externalRef ?? null,
      commitmentInstanceId: input.commitmentInstanceId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const { db, sqlite } = this.connect();

    try {
      const category = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, payload.categoryId))
        .get();
      if (!category) {
        throw new AppError(
          'CATEGORY_NOT_FOUND',
          'Cannot create expense with unknown category',
          404,
          {
            categoryId: payload.categoryId,
          },
        );
      }

      await db.insert(expenses).values(payload);

      if (payload.commitmentInstanceId) {
        await db
          .update(commitmentInstances)
          .set({
            status: 'paid',
            expenseId: payload.id,
            resolvedAt: now,
          })
          .where(eq(commitmentInstances.id, payload.commitmentInstanceId));
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('EXPENSE_CREATE_FAILED', 'Could not create expense', 409, {
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sqlite.close();
    }

    await this.writeAudit('expense.create', payload, context);
    return this.getExpense(payload.id);
  }

  async updateExpense(
    id: string,
    input: UpdateExpenseInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { db, sqlite } = this.connect();

    try {
      const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      const patch = {
        occurredAt: input.occurredAt
          ? assertDate(input.occurredAt, 'occurredAt')
          : existing.occurredAt,
        postedAt:
          input.postedAt === undefined
            ? existing.postedAt
            : input.postedAt === null
              ? null
              : assertDate(input.postedAt, 'postedAt'),
        amountMinor: input.amountMinor ?? existing.amountMinor,
        currency: input.currency ? normalizeCurrency(input.currency) : existing.currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.amountBaseMinor,
        fxRate: input.fxRate ?? existing.fxRate,
        categoryId: input.categoryId ?? existing.categoryId,
        merchantName: input.merchantName ?? existing.merchantName,
        note: input.note ?? existing.note,
        updatedAt: toIso(new Date()),
      };

      await db.update(expenses).set(patch).where(eq(expenses.id, id));
      await this.writeAudit('expense.update', { id, patch }, context);

      return this.getExpense(id);
    } finally {
      sqlite.close();
    }
  }

  async createDeleteExpenseApproval(id: string): Promise<ApprovalToken> {
    return this.createApproval('expense.delete', { id });
  }

  async deleteExpense(
    id: string,
    approveOperationId: string,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    await this.consumeApproval('expense.delete', approveOperationId, { id });

    const { db, sqlite } = this.connect();

    try {
      const existing = await db.select().from(expenses).where(eq(expenses.id, id)).get();
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      if (existing.commitmentInstanceId) {
        await db
          .update(commitmentInstances)
          .set({ status: 'pending', expenseId: null, resolvedAt: null })
          .where(eq(commitmentInstances.id, existing.commitmentInstanceId));
      }

      await db.delete(expenses).where(eq(expenses.id, id));
      await this.writeAudit('expense.delete', { id }, context);
    } finally {
      sqlite.close();
    }
  }

  async listCommitments() {
    const { db, sqlite } = this.connect();
    try {
      const rows = await db.select().from(recurringCommitments).orderBy(recurringCommitments.name);
      return rows.map((row) => this.mapCommitment(row));
    } finally {
      sqlite.close();
    }
  }

  private mapCommitment(row: typeof recurringCommitments.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      rrule: row.rrule,
      startDate: row.startDate,
      defaultMoney: {
        amountMinor: row.defaultAmountMinor,
        currency: row.currency,
        ...(row.amountBaseMinor !== null && row.amountBaseMinor !== undefined
          ? { amountBaseMinor: row.amountBaseMinor }
          : {}),
        ...(row.fxRate !== null && row.fxRate !== undefined ? { fxRate: row.fxRate } : {}),
      },
      categoryId: row.categoryId,
      graceDays: row.graceDays,
      active: row.active,
      nextDueAt: row.nextDueAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createCommitment(input: CreateCommitmentInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const startDate = assertDate(input.startDate, 'startDate');

    this.assertRrule(input.rrule, startDate);

    const payload = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      rrule: input.rrule,
      startDate,
      defaultAmountMinor: input.defaultAmountMinor,
      currency: normalizeCurrency(input.currency),
      amountBaseMinor: input.amountBaseMinor,
      fxRate: input.fxRate,
      categoryId: input.categoryId,
      graceDays: input.graceDays ?? 0,
      active: input.active ?? true,
      nextDueAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const { db, sqlite } = this.connect();

    try {
      await db.insert(recurringCommitments).values(payload);
    } catch (error) {
      throw new AppError('COMMITMENT_CREATE_FAILED', 'Could not create recurring commitment', 409, {
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sqlite.close();
    }

    await this.writeAudit('commitment.create', payload, context);
    return this.getCommitment(payload.id);
  }

  async getCommitment(id: string) {
    const { db, sqlite } = this.connect();
    try {
      const row = await db
        .select()
        .from(recurringCommitments)
        .where(eq(recurringCommitments.id, id))
        .get();
      if (!row) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }
      return this.mapCommitment(row);
    } finally {
      sqlite.close();
    }
  }

  async updateCommitment(
    id: string,
    input: UpdateCommitmentInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { db, sqlite } = this.connect();

    try {
      const existing = await db
        .select()
        .from(recurringCommitments)
        .where(eq(recurringCommitments.id, id))
        .get();
      if (!existing) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }

      const nextStartDate = input.startDate
        ? assertDate(input.startDate, 'startDate')
        : existing.startDate;
      const nextRule = input.rrule ?? existing.rrule;
      this.assertRrule(nextRule, nextStartDate);

      const patch = {
        name: input.name?.trim() ?? existing.name,
        rrule: nextRule,
        startDate: nextStartDate,
        defaultAmountMinor: input.defaultAmountMinor ?? existing.defaultAmountMinor,
        currency: input.currency ? normalizeCurrency(input.currency) : existing.currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.amountBaseMinor,
        fxRate: input.fxRate ?? existing.fxRate,
        categoryId: input.categoryId ?? existing.categoryId,
        graceDays: input.graceDays ?? existing.graceDays,
        active: input.active ?? existing.active,
        updatedAt: toIso(new Date()),
      };

      await db.update(recurringCommitments).set(patch).where(eq(recurringCommitments.id, id));
      await this.writeAudit('commitment.update', { id, patch }, context);
      return this.getCommitment(id);
    } finally {
      sqlite.close();
    }
  }

  async createDeleteCommitmentApproval(id: string): Promise<ApprovalToken> {
    return this.createApproval('commitment.delete', { id });
  }

  async deleteCommitment(
    id: string,
    approveOperationId: string,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    await this.consumeApproval('commitment.delete', approveOperationId, { id });

    const { db, sqlite } = this.connect();
    try {
      const existing = await db
        .select({ id: recurringCommitments.id })
        .from(recurringCommitments)
        .where(eq(recurringCommitments.id, id))
        .get();
      if (!existing) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }

      await db.delete(recurringCommitments).where(eq(recurringCommitments.id, id));
      await this.writeAudit('commitment.delete', { id }, context);
    } finally {
      sqlite.close();
    }
  }

  private assertRrule(rruleExpr: string, startDate: string): void {
    try {
      this.buildRule(rruleExpr, startDate);
    } catch {
      throw new AppError('INVALID_RRULE', 'rrule is invalid', 400, { rrule: rruleExpr, startDate });
    }
  }

  private buildRule(rruleExpr: string, startDate: string): RRule {
    return rrule.rrulestr(`DTSTART:${toRruleDate(startDate)}\nRRULE:${rruleExpr}`) as RRule;
  }

  async runCommitmentDueGeneration(upTo?: string, context: ActorContext = DEFAULT_ACTOR) {
    const targetDate = upTo ? new Date(assertDate(upTo, 'upTo')) : new Date();

    const { db, sqlite } = this.connect();

    let created = 0;

    try {
      const commitments = await db
        .select()
        .from(recurringCommitments)
        .where(eq(recurringCommitments.active, true));

      for (const commitment of commitments) {
        const rule = this.buildRule(commitment.rrule, commitment.startDate);

        const lastInstance = await db
          .select()
          .from(commitmentInstances)
          .where(eq(commitmentInstances.commitmentId, commitment.id))
          .orderBy(desc(commitmentInstances.dueAt))
          .get();

        const fromDate = lastInstance
          ? new Date(new Date(lastInstance.dueAt).getTime() + 1000)
          : new Date(commitment.startDate);

        const dueDates = rule
          .between(fromDate, targetDate, true)
          .map((date) => toIso(date))
          .filter((date) => date >= commitment.startDate);

        for (const dueAt of dueDates) {
          try {
            await db.insert(commitmentInstances).values({
              id: crypto.randomUUID(),
              commitmentId: commitment.id,
              dueAt,
              expectedAmountMinor: commitment.defaultAmountMinor,
              currency: commitment.currency,
              amountBaseMinor: commitment.amountBaseMinor,
              fxRate: commitment.fxRate,
              status: 'pending',
              expenseId: null,
              resolvedAt: null,
              createdAt: toIso(new Date()),
            });
            created += 1;
          } catch {
            // Ignore duplicates due to unique(commitment_id, due_at).
          }
        }

        const nextDue = rule.after(targetDate, false);
        await db
          .update(recurringCommitments)
          .set({ nextDueAt: nextDue ? toIso(nextDue) : null, updatedAt: toIso(new Date()) })
          .where(eq(recurringCommitments.id, commitment.id));
      }

      await this.markOverdue(targetDate);
      await this.writeAudit(
        'commitment.generate_due',
        { upTo: targetDate.toISOString(), created },
        context,
      );
      return {
        upTo: targetDate.toISOString(),
        created,
      };
    } finally {
      sqlite.close();
    }
  }

  private async markOverdue(now: Date): Promise<void> {
    const { db, sqlite } = this.connect();
    try {
      const pendingRows = await db
        .select({
          id: commitmentInstances.id,
          dueAt: commitmentInstances.dueAt,
          graceDays: recurringCommitments.graceDays,
        })
        .from(commitmentInstances)
        .innerJoin(
          recurringCommitments,
          eq(commitmentInstances.commitmentId, recurringCommitments.id),
        )
        .where(eq(commitmentInstances.status, 'pending'));

      const overdueIds: string[] = [];
      for (const row of pendingRows) {
        const due = new Date(row.dueAt);
        const threshold = due.getTime() + row.graceDays * 24 * 60 * 60 * 1000;
        if (threshold < now.getTime()) {
          overdueIds.push(row.id);
        }
      }

      if (overdueIds.length > 0) {
        await db
          .update(commitmentInstances)
          .set({ status: 'overdue' })
          .where(inArray(commitmentInstances.id, overdueIds));
      }
    } finally {
      sqlite.close();
    }
  }

  async listCommitmentInstances(status?: 'pending' | 'paid' | 'overdue' | 'skipped') {
    const { db, sqlite } = this.connect();
    try {
      const query = db
        .select()
        .from(commitmentInstances)
        .orderBy(desc(commitmentInstances.dueAt))
        .limit(200);

      const rows = status ? await query.where(eq(commitmentInstances.status, status)) : await query;

      return rows.map((row) => ({
        id: row.id,
        commitmentId: row.commitmentId,
        dueAt: row.dueAt,
        expectedMoney: {
          amountMinor: row.expectedAmountMinor,
          currency: row.currency,
          ...(row.amountBaseMinor !== null && row.amountBaseMinor !== undefined
            ? { amountBaseMinor: row.amountBaseMinor }
            : {}),
          ...(row.fxRate !== null && row.fxRate !== undefined ? { fxRate: row.fxRate } : {}),
        },
        status: row.status as 'pending' | 'paid' | 'overdue' | 'skipped',
        expenseId: row.expenseId,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
      }));
    } finally {
      sqlite.close();
    }
  }

  async reportMonthlyTrends(months = 6) {
    const { db, sqlite } = this.connect();
    try {
      const rows = await db
        .select({
          month: sql<string>`substr(${expenses.occurredAt}, 1, 7)`,
          spendMinor: sql<number>`SUM(${expenses.amountMinor})`,
          spendBaseMinor: sql<number>`SUM(COALESCE(${expenses.amountBaseMinor}, ${expenses.amountMinor}))`,
          txCount: sql<number>`COUNT(*)`,
        })
        .from(expenses)
        .groupBy(sql`substr(${expenses.occurredAt}, 1, 7)`)
        .orderBy(sql`substr(${expenses.occurredAt}, 1, 7) DESC`)
        .limit(months);

      return rows.map((row) => ({
        month: row.month,
        spendMinor: Number(row.spendMinor ?? 0),
        spendBaseMinor: Number(row.spendBaseMinor ?? 0),
        txCount: Number(row.txCount ?? 0),
      }));
    } finally {
      sqlite.close();
    }
  }

  async reportCategoryBreakdown(from?: string, to?: string) {
    const { db, sqlite } = this.connect();

    const filters = [];
    if (from) {
      filters.push(gte(expenses.occurredAt, assertDate(from, 'from')));
    }
    if (to) {
      filters.push(lte(expenses.occurredAt, assertDate(to, 'to')));
    }

    try {
      const query = db
        .select({
          categoryId: expenses.categoryId,
          categoryName: categories.name,
          totalMinor: sql<number>`SUM(${expenses.amountMinor})`,
          txCount: sql<number>`COUNT(*)`,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .groupBy(expenses.categoryId, categories.name)
        .orderBy(sql`SUM(${expenses.amountMinor}) DESC`);

      const rows = filters.length > 0 ? await query.where(and(...filters)) : await query;
      return rows.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        totalMinor: Number(row.totalMinor ?? 0),
        txCount: Number(row.txCount ?? 0),
      }));
    } finally {
      sqlite.close();
    }
  }

  async reportCommitmentForecast(days = 30) {
    const now = new Date();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const { db, sqlite } = this.connect();

    try {
      const rows = await db
        .select({
          id: commitmentInstances.id,
          commitmentId: commitmentInstances.commitmentId,
          commitmentName: recurringCommitments.name,
          dueAt: commitmentInstances.dueAt,
          expectedAmountMinor: commitmentInstances.expectedAmountMinor,
          currency: commitmentInstances.currency,
          status: commitmentInstances.status,
        })
        .from(commitmentInstances)
        .innerJoin(
          recurringCommitments,
          eq(commitmentInstances.commitmentId, recurringCommitments.id),
        )
        .where(
          and(
            gte(commitmentInstances.dueAt, now.toISOString()),
            lte(commitmentInstances.dueAt, to),
            inArray(commitmentInstances.status, ['pending', 'overdue']),
          ),
        )
        .orderBy(commitmentInstances.dueAt);

      return rows;
    } finally {
      sqlite.close();
    }
  }

  async runQuery(specInput: QuerySpec) {
    const parsed = querySpecSchema.safeParse(specInput);
    if (!parsed.success) {
      return fail('INVALID_QUERY_SPEC', 'Query specification is invalid', {
        issues: parsed.error.issues,
      });
    }

    const spec = parsed.data;

    const entityConfig: Record<
      QuerySpec['entity'],
      { table: string; allowedFields: Set<string>; defaultSort: string }
    > = {
      expenses: {
        table: 'expenses',
        allowedFields: new Set([
          'id',
          'occurred_at',
          'posted_at',
          'amount_minor',
          'currency',
          'category_id',
          'source',
          'merchant_name',
          'note',
          'created_at',
          'updated_at',
        ]),
        defaultSort: 'created_at',
      },
      categories: {
        table: 'categories',
        allowedFields: new Set([
          'id',
          'name',
          'kind',
          'icon',
          'color',
          'is_system',
          'archived_at',
          'created_at',
          'updated_at',
        ]),
        defaultSort: 'name',
      },
      commitment_instances: {
        table: 'commitment_instances',
        allowedFields: new Set([
          'id',
          'commitment_id',
          'due_at',
          'expected_amount_minor',
          'currency',
          'status',
          'expense_id',
          'resolved_at',
          'created_at',
        ]),
        defaultSort: 'due_at',
      },
      recurring_commitments: {
        table: 'recurring_commitments',
        allowedFields: new Set([
          'id',
          'name',
          'rrule',
          'start_date',
          'default_amount_minor',
          'currency',
          'category_id',
          'grace_days',
          'active',
          'next_due_at',
          'created_at',
          'updated_at',
        ]),
        defaultSort: 'name',
      },
    };

    const config = entityConfig[spec.entity];

    const params: Array<string | number | boolean> = [];
    const whereParts: string[] = [];

    for (const filter of spec.filters) {
      if (!config.allowedFields.has(filter.field)) {
        return fail('INVALID_FILTER_FIELD', 'Filter contains unsupported field', {
          field: filter.field,
          entity: spec.entity,
        });
      }

      switch (filter.op) {
        case 'eq':
        case 'neq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          const sqlOp = {
            eq: '=',
            neq: '!=',
            gt: '>',
            gte: '>=',
            lt: '<',
            lte: '<=',
          }[filter.op];
          whereParts.push(`${filter.field} ${sqlOp} ?`);
          params.push(filter.value as string | number | boolean);
          break;
        }
        case 'like':
          whereParts.push(`${filter.field} LIKE ?`);
          params.push(filter.value as string);
          break;
        case 'in': {
          const values = filter.value as Array<string | number>;
          const placeholders = values.map(() => '?').join(',');
          whereParts.push(`${filter.field} IN (${placeholders})`);
          params.push(...values);
          break;
        }
      }
    }

    const sortBy = config.allowedFields.has(spec.sortBy) ? spec.sortBy : config.defaultSort;
    const sortDir = spec.sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const query = `SELECT * FROM ${config.table} ${whereClause} ORDER BY ${sortBy} ${sortDir} LIMIT ?`;
    params.push(spec.limit);

    const { sqlite } = this.connect();
    try {
      const rows = sqlite.prepare(query).all(...params);
      return ok(rows, { entity: spec.entity, count: rows.length });
    } finally {
      sqlite.close();
    }
  }

  async monzoConnectStart() {
    return {
      status: 'not_configured',
      message:
        'Monzo integration scaffolded. Configure MONZO_CLIENT_ID, MONZO_CLIENT_SECRET and redirect URI to enable OAuth.',
    };
  }

  async monzoCallback() {
    return {
      status: 'not_implemented',
      message: 'OAuth callback handling is planned for Milestone 3.',
    };
  }

  async monzoSyncNow() {
    return {
      status: 'not_implemented',
      message: 'Monzo sync engine is planned for Milestone 3.',
    };
  }

  private async createApproval(action: string, payload: unknown): Promise<ApprovalToken> {
    const payloadJson = JSON.stringify(payload);
    const approval: ApprovalToken = {
      operationId: crypto.randomUUID(),
      action,
      hash: operationHash(action, payloadJson),
      expiresAt: toIso(new Date(Date.now() + 15 * 60 * 1000)),
    };

    const { db, sqlite } = this.connect();
    try {
      await db.insert(operationApprovals).values({
        id: approval.operationId,
        action,
        payloadJson,
        payloadHash: approval.hash,
        expiresAt: approval.expiresAt,
        approvedAt: null,
        createdAt: toIso(new Date()),
      });
      return approval;
    } finally {
      sqlite.close();
    }
  }

  private async consumeApproval(
    action: string,
    operationId: string,
    payload: unknown,
  ): Promise<void> {
    const payloadJson = JSON.stringify(payload);
    const hash = operationHash(action, payloadJson);

    const { db, sqlite } = this.connect();
    try {
      const existing = await db
        .select()
        .from(operationApprovals)
        .where(eq(operationApprovals.id, operationId))
        .get();

      if (!existing) {
        throw new AppError('APPROVAL_NOT_FOUND', 'Approval token is invalid', 403, { operationId });
      }
      if (existing.action !== action) {
        throw new AppError('APPROVAL_ACTION_MISMATCH', 'Approval token action mismatch', 403, {
          expectedAction: action,
          actualAction: existing.action,
        });
      }
      if (existing.payloadHash !== hash) {
        throw new AppError('APPROVAL_PAYLOAD_MISMATCH', 'Approval token payload mismatch', 403);
      }
      if (existing.approvedAt) {
        throw new AppError('APPROVAL_ALREADY_USED', 'Approval token already used', 403);
      }
      if (new Date(existing.expiresAt).getTime() < Date.now()) {
        throw new AppError('APPROVAL_EXPIRED', 'Approval token has expired', 403, {
          expiresAt: existing.expiresAt,
        });
      }

      await db
        .update(operationApprovals)
        .set({ approvedAt: toIso(new Date()) })
        .where(eq(operationApprovals.id, operationId));
    } finally {
      sqlite.close();
    }
  }
}
