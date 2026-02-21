import crypto from 'node:crypto';

import rrule from 'rrule';

import { type QuerySpec, fail, ok, querySpecSchema } from '@tithe/contracts';

import { AppError } from './errors.js';
import {
  type ApprovalsRepository,
  SqliteApprovalsRepository,
} from './repositories/approvals.repository.js';
import { type AuditRepository, SqliteAuditRepository } from './repositories/audit.repository.js';
import {
  type CategoriesRepository,
  SqliteCategoriesRepository,
} from './repositories/categories.repository.js';
import {
  type CommitmentsRepository,
  SqliteCommitmentsRepository,
} from './repositories/commitments.repository.js';
import {
  type ExpensesRepository,
  SqliteExpensesRepository,
} from './repositories/expenses.repository.js';
import { type QueryRepository, SqliteQueryRepository } from './repositories/query.repository.js';
import {
  type ReportsRepository,
  SqliteReportsRepository,
} from './repositories/reports.repository.js';
import {
  type RepositoryDb,
  type SessionContext,
  withSession,
  withTransaction,
} from './repositories/shared.js';
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
  constructor(private readonly options: ExpenseTrackerServiceOptions = {}) {}

  private withDb<T>(run: (ctx: SessionContext) => Promise<T> | T): Promise<T> {
    return withSession(this.options, run);
  }

  private categoriesRepository(db: RepositoryDb): CategoriesRepository {
    return new SqliteCategoriesRepository(db);
  }

  private expensesRepository(db: RepositoryDb): ExpensesRepository {
    return new SqliteExpensesRepository(db);
  }

  private commitmentsRepository(db: RepositoryDb): CommitmentsRepository {
    return new SqliteCommitmentsRepository(db);
  }

  private reportsRepository(db: RepositoryDb): ReportsRepository {
    return new SqliteReportsRepository(db);
  }

  private queryRepository(sqlite: SessionContext['sqlite']): QueryRepository {
    return new SqliteQueryRepository(sqlite);
  }

  private approvalsRepository(db: RepositoryDb): ApprovalsRepository {
    return new SqliteApprovalsRepository(db);
  }

  private auditRepository(db: RepositoryDb): AuditRepository {
    return new SqliteAuditRepository(db);
  }

  private async writeAudit(action: string, payload: unknown, context: ActorContext): Promise<void> {
    const payloadJson = JSON.stringify(payload);

    await this.withDb(({ db }) => {
      this.auditRepository(db).append({
        id: crypto.randomUUID(),
        actor: context.actor,
        channel: context.channel,
        action,
        payloadHash: operationHash(action, payloadJson),
      });
    });
  }

  async listCategories() {
    return this.withDb(({ db }) => this.categoriesRepository(db).list({}).categories);
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

    const category = await this.withDb(({ db }) => {
      try {
        return this.categoriesRepository(db).create(payload).category;
      } catch (error) {
        throw new AppError('CATEGORY_CREATE_FAILED', 'Could not create category', 409, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await this.writeAudit('category.create', payload, context);
    return category;
  }

  async updateCategory(
    id: string,
    input: UpdateCategoryInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { category, patch } = await this.withDb(({ db }) => {
      const existing = this.categoriesRepository(db).findById({ id }).category;
      if (!existing) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      const nextPatch = {
        name: input.name?.trim() ?? existing.name,
        kind: input.kind ?? existing.kind,
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

      const updated = this.categoriesRepository(db).update({ id, ...nextPatch }).category;

      if (!updated) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      return {
        category: updated,
        patch: nextPatch,
      };
    });

    await this.writeAudit('category.update', { id, patch }, context);

    return category;
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

    await this.withDb(({ db }) => {
      const target = this.categoriesRepository(db).findById({ id }).category;
      if (!target) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      if (reassignCategoryId) {
        const replacement = this.categoriesRepository(db).findById({
          id: reassignCategoryId,
        }).category;

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

        withTransaction(db, (tx) => {
          this.categoriesRepository(tx).reassignReferences({
            fromCategoryId: id,
            toCategoryId: reassignCategoryId,
            updatedAt: toIso(new Date()),
          });

          this.categoriesRepository(tx).deleteById({ id });
        });
      } else {
        const refs = this.categoriesRepository(db).countReferences({ categoryId: id });

        if (refs.expenseCount > 0 || refs.commitmentCount > 0) {
          throw new AppError(
            'CATEGORY_IN_USE',
            'Category has linked expenses or commitments. Pass reassign category.',
            409,
            {
              expenseCount: refs.expenseCount,
              commitmentCount: refs.commitmentCount,
            },
          );
        }

        this.categoriesRepository(db).deleteById({ id });
      }
    });

    await this.writeAudit('category.delete', { id, reassignCategoryId }, context);
  }

  async listExpenses(input: ListExpensesInput = {}) {
    return this.withDb(({ db }) => {
      const from = input.from ? assertDate(input.from, 'from') : undefined;
      const to = input.to ? assertDate(input.to, 'to') : undefined;

      return this.expensesRepository(db).list({
        from,
        to,
        categoryId: input.categoryId,
        limit: input.limit ?? 200,
      }).expenses;
    });
  }

  async getExpense(id: string) {
    return this.withDb(({ db }) => {
      const expense = this.expensesRepository(db).findById({ id }).expense;
      if (!expense) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }
      return expense;
    });
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

    const createdExpense = await this.withDb(({ db }) => {
      const category = this.categoriesRepository(db).findById({ id: payload.categoryId }).category;

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

      try {
        return withTransaction(db, (tx) => {
          const created = this.expensesRepository(tx).create(payload).expense;

          if (payload.commitmentInstanceId) {
            this.commitmentsRepository(tx).markInstancePaid({
              instanceId: payload.commitmentInstanceId,
              expenseId: payload.id,
              resolvedAt: now,
            });
          }

          return created;
        });
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        throw new AppError('EXPENSE_CREATE_FAILED', 'Could not create expense', 409, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await this.writeAudit('expense.create', payload, context);
    return createdExpense;
  }

  async updateExpense(
    id: string,
    input: UpdateExpenseInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { expense, patch } = await this.withDb(({ db }) => {
      const existing = this.expensesRepository(db).findById({ id }).expense;
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      const nextPatch = {
        occurredAt: input.occurredAt
          ? assertDate(input.occurredAt, 'occurredAt')
          : existing.occurredAt,
        postedAt:
          input.postedAt === undefined
            ? existing.postedAt
            : input.postedAt === null
              ? null
              : assertDate(input.postedAt, 'postedAt'),
        amountMinor: input.amountMinor ?? existing.money.amountMinor,
        currency: input.currency ? normalizeCurrency(input.currency) : existing.money.currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.money.amountBaseMinor,
        fxRate: input.fxRate ?? existing.money.fxRate,
        categoryId: input.categoryId ?? existing.categoryId,
        merchantName: input.merchantName ?? existing.merchantName,
        note: input.note ?? existing.note,
        updatedAt: toIso(new Date()),
      };

      const updated = this.expensesRepository(db).update({ id, ...nextPatch }).expense;

      if (!updated) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      return {
        expense: updated,
        patch: nextPatch,
      };
    });

    await this.writeAudit('expense.update', { id, patch }, context);

    return expense;
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

    await this.withDb(({ db }) => {
      const existing = this.expensesRepository(db).findById({ id }).expense;
      if (!existing) {
        throw new AppError('EXPENSE_NOT_FOUND', `Expense ${id} does not exist`, 404);
      }

      withTransaction(db, (tx) => {
        if (existing.commitmentInstanceId) {
          this.commitmentsRepository(tx).resetInstanceToPending({
            instanceId: existing.commitmentInstanceId,
          });
        }

        this.expensesRepository(tx).deleteById({ id });
      });
    });

    await this.writeAudit('expense.delete', { id }, context);
  }

  async listCommitments() {
    return this.withDb(({ db }) => this.commitmentsRepository(db).listCommitments({}).commitments);
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

    const commitment = await this.withDb(({ db }) => {
      try {
        return this.commitmentsRepository(db).createCommitment(payload).commitment;
      } catch (error) {
        throw new AppError(
          'COMMITMENT_CREATE_FAILED',
          'Could not create recurring commitment',
          409,
          {
            reason: error instanceof Error ? error.message : String(error),
          },
        );
      }
    });

    await this.writeAudit('commitment.create', payload, context);
    return commitment;
  }

  async getCommitment(id: string) {
    return this.withDb(({ db }) => {
      const commitment = this.commitmentsRepository(db).findCommitmentById({ id }).commitment;
      if (!commitment) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }
      return commitment;
    });
  }

  async updateCommitment(
    id: string,
    input: UpdateCommitmentInput,
    context: ActorContext = DEFAULT_ACTOR,
  ) {
    const { commitment, patch } = await this.withDb(({ db }) => {
      const existing = this.commitmentsRepository(db).findCommitmentById({ id }).commitment;
      if (!existing) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }

      const nextStartDate = input.startDate
        ? assertDate(input.startDate, 'startDate')
        : existing.startDate;
      const nextRule = input.rrule ?? existing.rrule;
      this.assertRrule(nextRule, nextStartDate);

      const nextPatch = {
        name: input.name?.trim() ?? existing.name,
        rrule: nextRule,
        startDate: nextStartDate,
        defaultAmountMinor: input.defaultAmountMinor ?? existing.defaultMoney.amountMinor,
        currency: input.currency
          ? normalizeCurrency(input.currency)
          : existing.defaultMoney.currency,
        amountBaseMinor: input.amountBaseMinor ?? existing.defaultMoney.amountBaseMinor,
        fxRate: input.fxRate ?? existing.defaultMoney.fxRate,
        categoryId: input.categoryId ?? existing.categoryId,
        graceDays: input.graceDays ?? existing.graceDays,
        active: input.active ?? existing.active,
        updatedAt: toIso(new Date()),
      };

      const updated = this.commitmentsRepository(db).updateCommitment({
        id,
        ...nextPatch,
      }).commitment;

      if (!updated) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }

      return {
        commitment: updated,
        patch: nextPatch,
      };
    });

    await this.writeAudit('commitment.update', { id, patch }, context);

    return commitment;
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

    await this.withDb(({ db }) => {
      const existing = this.commitmentsRepository(db).findCommitmentById({ id }).commitment;
      if (!existing) {
        throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
      }

      this.commitmentsRepository(db).deleteCommitment({ id });
    });

    await this.writeAudit('commitment.delete', { id }, context);
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

    let created = 0;

    await this.withDb(({ db }) => {
      const activeCommitments = this.commitmentsRepository(db).listActiveCommitments(
        {},
      ).commitments;

      for (const commitment of activeCommitments) {
        const rule = this.buildRule(commitment.rrule, commitment.startDate);

        withTransaction(db, (tx) => {
          const lastInstance = this.commitmentsRepository(tx).findLastInstance({
            commitmentId: commitment.id,
          }).instance;

          const fromDate = lastInstance
            ? new Date(new Date(lastInstance.dueAt).getTime() + 1000)
            : new Date(commitment.startDate);

          const dueDates = rule
            .between(fromDate, targetDate, true)
            .map((date) => toIso(date))
            .filter((date) => date >= commitment.startDate);

          for (const dueAt of dueDates) {
            try {
              this.commitmentsRepository(tx).createInstance({
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
          this.commitmentsRepository(tx).updateNextDue({
            commitmentId: commitment.id,
            nextDueAt: nextDue ? toIso(nextDue) : null,
            updatedAt: toIso(new Date()),
          });
        });
      }

      this.markOverdueWithinDb(db, targetDate);
    });

    await this.writeAudit(
      'commitment.generate_due',
      { upTo: targetDate.toISOString(), created },
      context,
    );

    return {
      upTo: targetDate.toISOString(),
      created,
    };
  }

  private markOverdueWithinDb(db: RepositoryDb, now: Date): void {
    const pendingRows = this.commitmentsRepository(db).listPendingWithGrace({}).rows;

    const overdueIds: string[] = [];
    for (const row of pendingRows) {
      const due = new Date(row.dueAt);
      const threshold = due.getTime() + row.graceDays * 24 * 60 * 60 * 1000;
      if (threshold < now.getTime()) {
        overdueIds.push(row.id);
      }
    }

    withTransaction(db, (tx) => {
      this.commitmentsRepository(tx).markOverdue({ instanceIds: overdueIds });
    });
  }

  async listCommitmentInstances(status?: 'pending' | 'paid' | 'overdue' | 'skipped') {
    return this.withDb(
      ({ db }) => this.commitmentsRepository(db).listInstances({ status }).instances,
    );
  }

  async reportMonthlyTrends(months = 6) {
    return this.withDb(({ db }) => this.reportsRepository(db).monthlyTrends({ months }).rows);
  }

  async reportCategoryBreakdown(from?: string, to?: string) {
    return this.withDb(({ db }) => {
      const normalizedFrom = from ? assertDate(from, 'from') : undefined;
      const normalizedTo = to ? assertDate(to, 'to') : undefined;

      return this.reportsRepository(db).categoryBreakdown({
        from: normalizedFrom,
        to: normalizedTo,
      }).rows;
    });
  }

  async reportCommitmentForecast(days = 30) {
    const now = new Date();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    return this.withDb(
      ({ db }) =>
        this.reportsRepository(db).commitmentForecast({
          from: now.toISOString(),
          to,
        }).rows,
    );
  }

  async runQuery(specInput: QuerySpec) {
    const parsed = querySpecSchema.safeParse(specInput);
    if (!parsed.success) {
      return fail('INVALID_QUERY_SPEC', 'Query specification is invalid', {
        issues: parsed.error.issues,
      });
    }

    const spec = parsed.data;

    return this.withDb(({ sqlite }) => {
      const queryRepository = this.queryRepository(sqlite);

      for (const filter of spec.filters) {
        if (!queryRepository.isAllowedField(spec.entity, filter.field)) {
          return fail('INVALID_FILTER_FIELD', 'Filter contains unsupported field', {
            field: filter.field,
            entity: spec.entity,
          });
        }
      }

      const sortBy = queryRepository.isAllowedField(spec.entity, spec.sortBy)
        ? spec.sortBy
        : queryRepository.getDefaultSort(spec.entity);

      const result = queryRepository.runEntityQuery({
        spec: {
          ...spec,
          sortBy,
        },
      });

      return ok(result.rows, { entity: result.entity, count: result.count });
    });
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

    await this.withDb(({ db }) => {
      this.approvalsRepository(db).createApproval({
        id: approval.operationId,
        action,
        payloadJson,
        payloadHash: approval.hash,
        expiresAt: approval.expiresAt,
        approvedAt: null,
        createdAt: toIso(new Date()),
      });
    });

    return approval;
  }

  private async consumeApproval(
    action: string,
    operationId: string,
    payload: unknown,
  ): Promise<void> {
    const payloadJson = JSON.stringify(payload);
    const hash = operationHash(action, payloadJson);

    await this.withDb(({ db }) => {
      const existing = this.approvalsRepository(db).findApproval({ operationId }).approval;

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

      this.approvalsRepository(db).markApprovalUsed({
        operationId,
        approvedAt: toIso(new Date()),
      });
    });
  }
}
