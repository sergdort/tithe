import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  baseCurrency: text('base_currency').notNull().default('GBP'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    icon: text('icon').notNull().default('receipt_long'),
    color: text('color').notNull().default('#2E7D32'),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('categories_name_kind_uq').on(table.name, table.kind)],
);

export const recurringCommitments = sqliteTable(
  'recurring_commitments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    rrule: text('rrule').notNull(),
    startDate: text('start_date').notNull(),
    defaultAmountMinor: integer('default_amount_minor').notNull(),
    currency: text('currency').notNull(),
    amountBaseMinor: integer('amount_base_minor'),
    fxRate: integer('fx_rate', { mode: 'number' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    graceDays: integer('grace_days').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    nextDueAt: text('next_due_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('commitments_category_idx').on(table.categoryId)],
);

export const commitmentInstances = sqliteTable(
  'commitment_instances',
  {
    id: text('id').primaryKey(),
    commitmentId: text('commitment_id')
      .notNull()
      .references(() => recurringCommitments.id, { onDelete: 'cascade' }),
    dueAt: text('due_at').notNull(),
    expectedAmountMinor: integer('expected_amount_minor').notNull(),
    currency: text('currency').notNull(),
    amountBaseMinor: integer('amount_base_minor'),
    fxRate: integer('fx_rate', { mode: 'number' }),
    status: text('status').notNull().default('pending'),
    expenseId: text('expense_id'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('commitment_instances_due_uq').on(table.commitmentId, table.dueAt),
    index('commitment_instances_status_idx').on(table.status),
  ],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    occurredAt: text('occurred_at').notNull(),
    postedAt: text('posted_at'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    amountBaseMinor: integer('amount_base_minor'),
    fxRate: integer('fx_rate', { mode: 'number' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    source: text('source').notNull().default('manual'),
    merchantName: text('merchant_name'),
    note: text('note'),
    externalRef: text('external_ref'),
    commitmentInstanceId: text('commitment_instance_id').references(() => commitmentInstances.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('expenses_category_idx').on(table.categoryId),
    index('expenses_occurred_idx').on(table.occurredAt),
    uniqueIndex('expenses_source_external_ref_uq').on(table.source, table.externalRef),
  ],
);

export const monzoConnections = sqliteTable('monzo_connections', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  status: text('status').notNull().default('disconnected'),
  lastSyncAt: text('last_sync_at'),
  lastCursor: text('last_cursor'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monzoTransactionsRaw = sqliteTable(
  'monzo_transactions_raw',
  {
    transactionId: text('transaction_id').primaryKey(),
    payloadJson: text('payload_json').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('monzo_tx_created_idx').on(table.createdAt)],
);

export const syncRuns = sqliteTable('sync_runs', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull(),
  importedCount: integer('imported_count').notNull().default(0),
  errorText: text('error_text'),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actor: text('actor').notNull(),
    channel: text('channel').notNull(),
    action: text('action').notNull(),
    payloadHash: text('payload_hash').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('audit_action_idx').on(table.action)],
);

export const operationApprovals = sqliteTable(
  'operation_approvals',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadHash: text('payload_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    approvedAt: text('approved_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('operation_action_idx').on(table.action)],
);

export type DbSchema = {
  settings: typeof settings;
  categories: typeof categories;
  expenses: typeof expenses;
  recurringCommitments: typeof recurringCommitments;
  commitmentInstances: typeof commitmentInstances;
  monzoConnections: typeof monzoConnections;
  monzoTransactionsRaw: typeof monzoTransactionsRaw;
  syncRuns: typeof syncRuns;
  auditLog: typeof auditLog;
  operationApprovals: typeof operationApprovals;
};
