import crypto from 'node:crypto';

import { SqliteAuditRepository } from '../../repositories/audit.repository.js';
import type { ActorContext } from '../../types.js';
import { operationHash } from './common.js';
import type { DomainDbRuntime } from './domain-db.js';

export interface AuditService {
  writeAudit: (action: string, payload: unknown, context: ActorContext) => Promise<void>;
}

export const createAuditService = (runtime: DomainDbRuntime): AuditService => ({
  async writeAudit(action: string, payload: unknown, context: ActorContext) {
    const payloadJson = JSON.stringify(payload);
    new SqliteAuditRepository(runtime.db).append({
      id: crypto.randomUUID(),
      actor: context.actor,
      channel: context.channel,
      action,
      payloadHash: operationHash(action, payloadJson),
    });
  },
});
