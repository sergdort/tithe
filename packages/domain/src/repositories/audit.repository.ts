import { auditLog } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface AppendAuditLogInput {
  id: string;
  actor: string;
  channel: string;
  action: string;
  payloadHash: string;
}

export interface AppendAuditLogOutput {
  appended: true;
}

export interface AuditRepository {
  append(input: AppendAuditLogInput): AppendAuditLogOutput;
}

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly db: RepositoryDb) {}

  append(input: AppendAuditLogInput): AppendAuditLogOutput {
    this.db.insert(auditLog).values(input).run();
    return { appended: true };
  }
}
