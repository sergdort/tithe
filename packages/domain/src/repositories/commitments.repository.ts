import { desc, eq, inArray } from 'drizzle-orm';

import { commitmentInstances, recurringCommitments } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface CommitmentDto {
  id: string;
  name: string;
  rrule: string;
  startDate: string;
  defaultMoney: {
    amountMinor: number;
    currency: string;
    amountBaseMinor?: number;
    fxRate?: number;
  };
  categoryId: string;
  graceDays: number;
  active: boolean;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentInstanceDto {
  id: string;
  commitmentId: string;
  dueAt: string;
  expectedMoney: {
    amountMinor: number;
    currency: string;
    amountBaseMinor?: number;
    fxRate?: number;
  };
  status: 'pending' | 'paid' | 'overdue' | 'skipped';
  expenseId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const mapCommitment = (row: typeof recurringCommitments.$inferSelect): CommitmentDto => ({
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
});

const mapCommitmentInstance = (
  row: typeof commitmentInstances.$inferSelect,
): CommitmentInstanceDto => ({
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
});

export type ListCommitmentsInput = Record<string, never>;

export interface ListCommitmentsOutput {
  commitments: CommitmentDto[];
}

export interface FindCommitmentByIdInput {
  id: string;
}

export interface FindCommitmentByIdOutput {
  commitment: CommitmentDto | null;
}

export interface CreateCommitmentInput {
  id: string;
  name: string;
  rrule: string;
  startDate: string;
  defaultAmountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  categoryId: string;
  graceDays: number;
  active: boolean;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommitmentOutput {
  commitment: CommitmentDto;
}

export interface UpdateCommitmentInput {
  id: string;
  name: string;
  rrule: string;
  startDate: string;
  defaultAmountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  categoryId: string;
  graceDays: number;
  active: boolean;
  updatedAt: string;
}

export interface UpdateCommitmentOutput {
  commitment: CommitmentDto | null;
}

export interface DeleteCommitmentInput {
  id: string;
}

export interface DeleteCommitmentOutput {
  deleted: boolean;
}

export type ListActiveCommitmentsInput = Record<string, never>;

export interface ListActiveCommitmentsOutput {
  commitments: Array<typeof recurringCommitments.$inferSelect>;
}

export interface FindLastCommitmentInstanceInput {
  commitmentId: string;
}

export interface FindLastCommitmentInstanceOutput {
  instance: typeof commitmentInstances.$inferSelect | null;
}

export interface CreateCommitmentInstanceInput {
  id: string;
  commitmentId: string;
  dueAt: string;
  expectedAmountMinor: number;
  currency: string;
  amountBaseMinor?: number | null;
  fxRate?: number | null;
  status: 'pending' | 'paid' | 'overdue' | 'skipped';
  expenseId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface CreateCommitmentInstanceOutput {
  instance: typeof commitmentInstances.$inferSelect;
}

export interface UpdateCommitmentNextDueInput {
  commitmentId: string;
  nextDueAt: string | null;
  updatedAt: string;
}

export interface UpdateCommitmentNextDueOutput {
  updated: true;
}

export interface ListCommitmentInstancesInput {
  status?: 'pending' | 'paid' | 'overdue' | 'skipped';
}

export interface ListCommitmentInstancesOutput {
  instances: CommitmentInstanceDto[];
}

export interface ListPendingWithGraceRow {
  id: string;
  dueAt: string;
  graceDays: number;
}

export type ListPendingWithGraceInput = Record<string, never>;

export interface ListPendingWithGraceOutput {
  rows: ListPendingWithGraceRow[];
}

export interface MarkOverdueInput {
  instanceIds: string[];
}

export interface MarkOverdueOutput {
  updatedCount: number;
}

export interface MarkInstancePaidInput {
  instanceId: string;
  expenseId: string;
  resolvedAt: string;
}

export interface MarkInstancePaidOutput {
  updated: true;
}

export interface ResetInstancePendingInput {
  instanceId: string;
}

export interface ResetInstancePendingOutput {
  updated: true;
}

export interface CommitmentsRepository {
  listCommitments(input: ListCommitmentsInput): ListCommitmentsOutput;
  findCommitmentById(input: FindCommitmentByIdInput): FindCommitmentByIdOutput;
  createCommitment(input: CreateCommitmentInput): CreateCommitmentOutput;
  updateCommitment(input: UpdateCommitmentInput): UpdateCommitmentOutput;
  deleteCommitment(input: DeleteCommitmentInput): DeleteCommitmentOutput;
  listActiveCommitments(input: ListActiveCommitmentsInput): ListActiveCommitmentsOutput;
  findLastInstance(input: FindLastCommitmentInstanceInput): FindLastCommitmentInstanceOutput;
  createInstance(input: CreateCommitmentInstanceInput): CreateCommitmentInstanceOutput;
  updateNextDue(input: UpdateCommitmentNextDueInput): UpdateCommitmentNextDueOutput;
  listInstances(input: ListCommitmentInstancesInput): ListCommitmentInstancesOutput;
  listPendingWithGrace(input: ListPendingWithGraceInput): ListPendingWithGraceOutput;
  markOverdue(input: MarkOverdueInput): MarkOverdueOutput;
  markInstancePaid(input: MarkInstancePaidInput): MarkInstancePaidOutput;
  resetInstanceToPending(input: ResetInstancePendingInput): ResetInstancePendingOutput;
}

export class SqliteCommitmentsRepository implements CommitmentsRepository {
  constructor(private readonly db: RepositoryDb) {}

  listCommitments(_input: ListCommitmentsInput): ListCommitmentsOutput {
    const rows = this.db
      .select()
      .from(recurringCommitments)
      .orderBy(recurringCommitments.name)
      .all();
    return {
      commitments: rows.map(mapCommitment),
    };
  }

  findCommitmentById({ id }: FindCommitmentByIdInput): FindCommitmentByIdOutput {
    const row = this.db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.id, id))
      .get();

    return {
      commitment: row ? mapCommitment(row) : null,
    };
  }

  createCommitment(input: CreateCommitmentInput): CreateCommitmentOutput {
    this.db.insert(recurringCommitments).values(input).run();

    const created = this.db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.id, input.id))
      .get();
    if (!created) {
      throw new Error(`Failed to fetch created commitment ${input.id}`);
    }

    return {
      commitment: mapCommitment(created),
    };
  }

  updateCommitment({ id, ...patch }: UpdateCommitmentInput): UpdateCommitmentOutput {
    this.db.update(recurringCommitments).set(patch).where(eq(recurringCommitments.id, id)).run();

    const updated = this.db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.id, id))
      .get();

    return {
      commitment: updated ? mapCommitment(updated) : null,
    };
  }

  deleteCommitment({ id }: DeleteCommitmentInput): DeleteCommitmentOutput {
    this.db.delete(recurringCommitments).where(eq(recurringCommitments.id, id)).run();
    return { deleted: true };
  }

  listActiveCommitments(_input: ListActiveCommitmentsInput): ListActiveCommitmentsOutput {
    const commitments = this.db
      .select()
      .from(recurringCommitments)
      .where(eq(recurringCommitments.active, true))
      .all();

    return { commitments };
  }

  findLastInstance({
    commitmentId,
  }: FindLastCommitmentInstanceInput): FindLastCommitmentInstanceOutput {
    const instance = this.db
      .select()
      .from(commitmentInstances)
      .where(eq(commitmentInstances.commitmentId, commitmentId))
      .orderBy(desc(commitmentInstances.dueAt))
      .get();

    return { instance: instance ?? null };
  }

  createInstance(input: CreateCommitmentInstanceInput): CreateCommitmentInstanceOutput {
    this.db.insert(commitmentInstances).values(input).run();

    return {
      instance: {
        ...input,
        amountBaseMinor: input.amountBaseMinor ?? null,
        fxRate: input.fxRate ?? null,
      },
    };
  }

  updateNextDue({
    commitmentId,
    nextDueAt,
    updatedAt,
  }: UpdateCommitmentNextDueInput): UpdateCommitmentNextDueOutput {
    this.db
      .update(recurringCommitments)
      .set({ nextDueAt, updatedAt })
      .where(eq(recurringCommitments.id, commitmentId))
      .run();

    return { updated: true };
  }

  listInstances({ status }: ListCommitmentInstancesInput): ListCommitmentInstancesOutput {
    const query = this.db
      .select()
      .from(commitmentInstances)
      .orderBy(desc(commitmentInstances.dueAt))
      .limit(200);

    const rows = status ? query.where(eq(commitmentInstances.status, status)).all() : query.all();

    return {
      instances: rows.map(mapCommitmentInstance),
    };
  }

  listPendingWithGrace(_input: ListPendingWithGraceInput): ListPendingWithGraceOutput {
    const rows = this.db
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
      .where(eq(commitmentInstances.status, 'pending'))
      .all();

    return { rows };
  }

  markOverdue({ instanceIds }: MarkOverdueInput): MarkOverdueOutput {
    if (instanceIds.length === 0) {
      return { updatedCount: 0 };
    }

    this.db
      .update(commitmentInstances)
      .set({ status: 'overdue' })
      .where(inArray(commitmentInstances.id, instanceIds))
      .run();

    return { updatedCount: instanceIds.length };
  }

  markInstancePaid({
    instanceId,
    expenseId,
    resolvedAt,
  }: MarkInstancePaidInput): MarkInstancePaidOutput {
    this.db
      .update(commitmentInstances)
      .set({
        status: 'paid',
        expenseId,
        resolvedAt,
      })
      .where(eq(commitmentInstances.id, instanceId))
      .run();

    return { updated: true };
  }

  resetInstanceToPending({ instanceId }: ResetInstancePendingInput): ResetInstancePendingOutput {
    this.db
      .update(commitmentInstances)
      .set({ status: 'pending', expenseId: null, resolvedAt: null })
      .where(eq(commitmentInstances.id, instanceId))
      .run();

    return { updated: true };
  }
}
