import crypto from 'node:crypto';

import type { ActorContext } from '../../types.js';
import { operationHash } from './common.js';
import type { DomainRuntimeDeps } from './deps.js';

export interface AuditService {
  writeAudit: (action: string, payload: unknown, context: ActorContext) => Promise<void>;
}

export const createAuditService = (deps: DomainRuntimeDeps): AuditService => ({
  async writeAudit(action: string, payload: unknown, context: ActorContext) {
    const payloadJson = JSON.stringify(payload);

    await deps.withDb(({ db }) => {
      deps.repositories.audit(db).append({
        id: crypto.randomUUID(),
        actor: context.actor,
        channel: context.channel,
        action,
        payloadHash: operationHash(action, payloadJson),
      });
    });
  },
});
