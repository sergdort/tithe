import crypto from 'node:crypto';

import { AppError } from '../../errors.js';
import type { ApprovalToken } from '../types.js';
import { operationHash, toIso } from './common.js';
import type { DomainRuntimeDeps } from './deps.js';

export interface ApprovalService {
  createApproval: (action: string, payload: unknown) => Promise<ApprovalToken>;
  consumeApproval: (action: string, operationId: string, payload: unknown) => Promise<void>;
}

export const createApprovalService = (deps: DomainRuntimeDeps): ApprovalService => ({
  async createApproval(action: string, payload: unknown): Promise<ApprovalToken> {
    const payloadJson = JSON.stringify(payload);
    const approval: ApprovalToken = {
      operationId: crypto.randomUUID(),
      action,
      hash: operationHash(action, payloadJson),
      expiresAt: toIso(new Date(Date.now() + 15 * 60 * 1000)),
    };

    await deps.withDb(({ db }) => {
      deps.repositories.approvals(db).createApproval({
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
  },

  async consumeApproval(action: string, operationId: string, payload: unknown): Promise<void> {
    const payloadJson = JSON.stringify(payload);
    const hash = operationHash(action, payloadJson);

    await deps.withDb(({ db }) => {
      const existing = deps.repositories.approvals(db).findApproval({ operationId }).approval;

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

      deps.repositories.approvals(db).markApprovalUsed({
        operationId,
        approvedAt: toIso(new Date()),
      });
    });
  },
});
