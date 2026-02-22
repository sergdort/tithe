import crypto from 'node:crypto';

import { AppError } from '../../errors.js';
import { SqliteApprovalsRepository } from '../../repositories/approvals.repository.js';
import { operationHash, toIso } from './common.js';
import type { DomainDbRuntime } from './domain-db.js';

export interface ApprovalToken {
  operationId: string;
  action: string;
  hash: string;
  expiresAt: string;
}

export interface ApprovalService {
  createApproval: (action: string, payload: unknown) => Promise<ApprovalToken>;
  consumeApproval: (action: string, operationId: string, payload: unknown) => Promise<void>;
}

export const createApprovalService = (runtime: DomainDbRuntime): ApprovalService => ({
  async createApproval(action: string, payload: unknown): Promise<ApprovalToken> {
    const payloadJson = JSON.stringify(payload);
    const approval: ApprovalToken = {
      operationId: crypto.randomUUID(),
      action,
      hash: operationHash(action, payloadJson),
      expiresAt: toIso(new Date(Date.now() + 15 * 60 * 1000)),
    };

    new SqliteApprovalsRepository(runtime.db).createApproval({
      id: approval.operationId,
      action,
      payloadJson,
      payloadHash: approval.hash,
      expiresAt: approval.expiresAt,
      approvedAt: null,
      createdAt: toIso(new Date()),
    });

    return approval;
  },

  async consumeApproval(action: string, operationId: string, payload: unknown): Promise<void> {
    const payloadJson = JSON.stringify(payload);
    const hash = operationHash(action, payloadJson);

    const approvalsRepo = new SqliteApprovalsRepository(runtime.db);
    const existing = approvalsRepo.findApproval({ operationId }).approval;

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

    approvalsRepo.markApprovalUsed({
      operationId,
      approvedAt: toIso(new Date()),
    });
  },
});
