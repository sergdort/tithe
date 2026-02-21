import { eq } from 'drizzle-orm';

import { operationApprovals } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface ApprovalRecord {
  id: string;
  action: string;
  payloadJson: string;
  payloadHash: string;
  expiresAt: string;
  approvedAt: string | null;
  createdAt: string;
}

export interface CreateApprovalInput {
  id: string;
  action: string;
  payloadJson: string;
  payloadHash: string;
  expiresAt: string;
  approvedAt: string | null;
  createdAt: string;
}

export interface CreateApprovalOutput {
  approval: ApprovalRecord;
}

export interface FindApprovalInput {
  operationId: string;
}

export interface FindApprovalOutput {
  approval: ApprovalRecord | null;
}

export interface MarkApprovalUsedInput {
  operationId: string;
  approvedAt: string;
}

export interface MarkApprovalUsedOutput {
  updated: true;
}

export interface ApprovalsRepository {
  createApproval(input: CreateApprovalInput): CreateApprovalOutput;
  findApproval(input: FindApprovalInput): FindApprovalOutput;
  markApprovalUsed(input: MarkApprovalUsedInput): MarkApprovalUsedOutput;
}

export class SqliteApprovalsRepository implements ApprovalsRepository {
  constructor(private readonly db: RepositoryDb) {}

  createApproval(input: CreateApprovalInput): CreateApprovalOutput {
    this.db.insert(operationApprovals).values(input).run();

    return {
      approval: {
        id: input.id,
        action: input.action,
        payloadJson: input.payloadJson,
        payloadHash: input.payloadHash,
        expiresAt: input.expiresAt,
        approvedAt: input.approvedAt,
        createdAt: input.createdAt,
      },
    };
  }

  findApproval({ operationId }: FindApprovalInput): FindApprovalOutput {
    const approval = this.db
      .select()
      .from(operationApprovals)
      .where(eq(operationApprovals.id, operationId))
      .get();

    return { approval: approval ?? null };
  }

  markApprovalUsed({ operationId, approvedAt }: MarkApprovalUsedInput): MarkApprovalUsedOutput {
    this.db
      .update(operationApprovals)
      .set({ approvedAt })
      .where(eq(operationApprovals.id, operationId))
      .run();

    return { updated: true };
  }
}
