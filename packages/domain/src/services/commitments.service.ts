import crypto from 'node:crypto';

import rrule from 'rrule';

import { AppError } from '../errors.js';
import type {
  CommitmentDto,
  CommitmentInstanceDto,
} from '../repositories/commitments.repository.js';
import { SqliteCommitmentsRepository } from '../repositories/commitments.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type { ActorContext, CreateCommitmentInput, UpdateCommitmentInput } from '../types.js';
import type { ApprovalToken } from './shared/approval-service.js';
import type { ApprovalService } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import {
  DEFAULT_ACTOR,
  assertDate,
  normalizeCurrency,
  toIso,
  toRruleDate,
} from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

export interface CommitmentsService {
  list: () => Promise<CommitmentDto[]>;
  create: (input: CreateCommitmentInput, context?: ActorContext) => Promise<CommitmentDto>;
  get: (id: string) => Promise<CommitmentDto>;
  update: (
    id: string,
    input: UpdateCommitmentInput,
    context?: ActorContext,
  ) => Promise<CommitmentDto>;
  createDeleteApproval: (id: string) => Promise<ApprovalToken>;
  delete: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
  runDueGeneration: (
    upTo?: string,
    context?: ActorContext,
  ) => Promise<{ upTo: string; created: number }>;
  listInstances: (
    status?: 'pending' | 'paid' | 'overdue' | 'skipped',
  ) => Promise<CommitmentInstanceDto[]>;
}

type RRule = InstanceType<(typeof rrule)['RRule']>;

interface CommitmentServiceDeps {
  runtime: DomainDbRuntime;
  approvals: ApprovalService;
  audit: AuditService;
}

const buildRule = (rruleExpr: string, startDate: string): RRule =>
  rrule.rrulestr(`DTSTART:${toRruleDate(startDate)}\nRRULE:${rruleExpr}`) as RRule;

const assertRrule = (rruleExpr: string, startDate: string): void => {
  try {
    buildRule(rruleExpr, startDate);
  } catch {
    throw new AppError('INVALID_RRULE', 'rrule is invalid', 400, { rrule: rruleExpr, startDate });
  }
};

const markOverdueWithinDb = (db: RepositoryDb, now: Date): void => {
  const pendingRows = new SqliteCommitmentsRepository(db).listPendingWithGrace({}).rows;

  const overdueIds: string[] = [];
  for (const row of pendingRows) {
    const due = new Date(row.dueAt);
    const threshold = due.getTime() + row.graceDays * 24 * 60 * 60 * 1000;
    if (threshold < now.getTime()) {
      overdueIds.push(row.id);
    }
  }

  withTransaction(db, (tx) => {
    new SqliteCommitmentsRepository(tx).markOverdue({ instanceIds: overdueIds });
  });
};

export const createCommitmentsService = ({
  runtime,
  approvals,
  audit,
}: CommitmentServiceDeps): CommitmentsService => {
  const commitmentsRepo = (db: RepositoryDb = runtime.db) => new SqliteCommitmentsRepository(db);

  return {
  async list() {
    return commitmentsRepo().listCommitments({}).commitments;
  },

  async create(input: CreateCommitmentInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const startDate = assertDate(input.startDate, 'startDate');

    assertRrule(input.rrule, startDate);

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

    let commitment: CommitmentDto;
    try {
      commitment = commitmentsRepo().createCommitment(payload).commitment;
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

    await audit.writeAudit('commitment.create', payload, context);
    return commitment;
  },

  async get(id: string) {
    const commitment = commitmentsRepo().findCommitmentById({ id }).commitment;
    if (!commitment) {
      throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
    }
    return commitment;
  },

  async update(id: string, input: UpdateCommitmentInput, context: ActorContext = DEFAULT_ACTOR) {
    const existing = commitmentsRepo().findCommitmentById({ id }).commitment;
    if (!existing) {
      throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
    }

    const nextStartDate = input.startDate
      ? assertDate(input.startDate, 'startDate')
      : existing.startDate;
    const nextRule = input.rrule ?? existing.rrule;
    assertRrule(nextRule, nextStartDate);

    const patch = {
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

    const commitment = commitmentsRepo().updateCommitment({
      id,
      ...patch,
    }).commitment;

    if (!commitment) {
      throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
    }

    await audit.writeAudit('commitment.update', { id, patch }, context);

    return commitment;
  },

  async createDeleteApproval(id: string) {
    return approvals.createApproval('commitment.delete', { id });
  },

  async delete(id: string, approveOperationId: string, context: ActorContext = DEFAULT_ACTOR) {
    await approvals.consumeApproval('commitment.delete', approveOperationId, { id });

    const existing = commitmentsRepo().findCommitmentById({ id }).commitment;
    if (!existing) {
      throw new AppError('COMMITMENT_NOT_FOUND', `Commitment ${id} does not exist`, 404);
    }

    commitmentsRepo().deleteCommitment({ id });

    await audit.writeAudit('commitment.delete', { id }, context);
  },

  async runDueGeneration(upTo?: string, context: ActorContext = DEFAULT_ACTOR) {
    const targetDate = upTo ? new Date(assertDate(upTo, 'upTo')) : new Date();

    let created = 0;

    const activeCommitments = commitmentsRepo().listActiveCommitments({}).commitments;

    for (const commitment of activeCommitments) {
      const rule = buildRule(commitment.rrule, commitment.startDate);

      withTransaction(runtime.db, (tx) => {
        const txCommitmentsRepo = commitmentsRepo(tx);
        const lastInstance = txCommitmentsRepo.findLastInstance({
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
            txCommitmentsRepo.createInstance({
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
        txCommitmentsRepo.updateNextDue({
          commitmentId: commitment.id,
          nextDueAt: nextDue ? toIso(nextDue) : null,
          updatedAt: toIso(new Date()),
        });
      });
    }

    markOverdueWithinDb(runtime.db, targetDate);

    await audit.writeAudit(
      'commitment.generate_due',
      { upTo: targetDate.toISOString(), created },
      context,
    );

    return {
      upTo: targetDate.toISOString(),
      created,
    };
  },

  async listInstances(status?: 'pending' | 'paid' | 'overdue' | 'skipped') {
    return commitmentsRepo().listInstances({ status }).instances;
  },
};
};
