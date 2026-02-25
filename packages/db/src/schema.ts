import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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
    reimbursementMode: text('reimbursement_mode').notNull().default('none'),
    defaultCounterpartyType: text('default_counterparty_type'),
    defaultRecoveryWindowDays: integer('default_recovery_window_days'),
    defaultMyShareMode: text('default_my_share_mode'),
    defaultMyShareValue: integer('default_my_share_value'),
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
    source: text('source').notNull().default('local'),
    transferDirection: text('transfer_direction'),
    kind: text('kind').notNull().default('expense'),
    reimbursementStatus: text('reimbursement_status').notNull().default('none'),
    myShareMinor: integer('my_share_minor'),
    closedOutstandingMinor: integer('closed_outstanding_minor'),
    counterpartyType: text('counterparty_type'),
    reimbursementGroupId: text('reimbursement_group_id'),
    reimbursementClosedAt: text('reimbursement_closed_at'),
    reimbursementClosedReason: text('reimbursement_closed_reason'),
    merchantName: text('merchant_name'),
    merchantLogoUrl: text('merchant_logo_url'),
    merchantEmoji: text('merchant_emoji'),
    note: text('note'),
    providerTransactionId: text('provider_transaction_id'),
    commitmentInstanceId: text('commitment_instance_id').references(() => commitmentInstances.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('expenses_category_idx').on(table.categoryId),
    index('expenses_occurred_idx').on(table.occurredAt),
    uniqueIndex('expenses_source_provider_transaction_id_uq').on(
      table.source,
      table.providerTransactionId,
    ),
  ],
);

export const monzoConnections = sqliteTable('monzo_connections', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  status: text('status').notNull().default('disconnected'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: text('token_expires_at'),
  scope: text('scope'),
  oauthState: text('oauth_state'),
  oauthStateExpiresAt: text('oauth_state_expires_at'),
  lastErrorText: text('last_error_text'),
  lastSyncAt: text('last_sync_at'),
  lastCursor: text('last_cursor'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monzoCategoryMappings = sqliteTable(
  'monzo_category_mappings',
  {
    monzoCategory: text('monzo_category').notNull(),
    flow: text('flow').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.monzoCategory, table.flow] })],
);

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

export const reimbursementLinks = sqliteTable(
  'reimbursement_links',
  {
    id: text('id').primaryKey(),
    expenseOutId: text('expense_out_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    expenseInId: text('expense_in_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('reimbursement_links_out_idx').on(table.expenseOutId),
    index('reimbursement_links_in_idx').on(table.expenseInId),
    uniqueIndex('reimbursement_links_idempotency_key_uq').on(table.idempotencyKey),
  ],
);

export const reimbursementCategoryRules = sqliteTable(
  'reimbursement_category_rules',
  {
    id: text('id').primaryKey(),
    expenseCategoryId: text('expense_category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    inboundCategoryId: text('inbound_category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('reimbursement_category_rules_expense_idx').on(table.expenseCategoryId),
    index('reimbursement_category_rules_inbound_idx').on(table.inboundCategoryId),
    uniqueIndex('reimbursement_category_rules_pair_uq').on(
      table.expenseCategoryId,
      table.inboundCategoryId,
    ),
  ],
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
  monzoCategoryMappings: typeof monzoCategoryMappings;
  monzoTransactionsRaw: typeof monzoTransactionsRaw;
  reimbursementLinks: typeof reimbursementLinks;
  reimbursementCategoryRules: typeof reimbursementCategoryRules;
  syncRuns: typeof syncRuns;
  auditLog: typeof auditLog;
  operationApprovals: typeof operationApprovals;
};
