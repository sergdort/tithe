import crypto from 'node:crypto';

import {
  MonzoApiError,
  type MonzoTransaction,
  createMonzoClient,
  tokenExpiresAtFromMonzoResponse,
} from './monzo-client.js';

import { AppError } from '../errors.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import { SqliteExpensesRepository } from '../repositories/expenses.repository.js';
import type {
  MonzoConnectionDto,
  UpsertMonzoConnectionInput,
} from '../repositories/monzo.repository.js';
import { SqliteMonzoRepository } from '../repositories/monzo.repository.js';
import type { RepositoryDb } from '../repositories/shared.js';
import { withTransaction } from '../repositories/shared.js';
import type { ActorContext } from '../types.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, normalizeCurrency, toIso } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

const MONZO_SYNC_PROVIDER = 'monzo';
const MONZO_CONNECTION_ID = 'primary';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const INITIAL_BACKFILL_DAYS = 90;
const CURSOR_OVERLAP_DAYS = 3;
const TOKEN_REFRESH_GRACE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONZO_POT_ID_PREFIX = 'pot_';

interface MonzoEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
  scope?: string;
}

export interface MonzoCallbackInput {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface MonzoSyncSummary {
  status: string;
  message: string;
  imported: number;
  updated: number;
  skipped: number;
  accountId: string;
  from: string;
  to: string;
  cursor: string | null;
}

export interface MonzoSyncInput {
  from?: string;
  to?: string;
  overrideExisting?: boolean;
}

export interface MonzoStatusSummary {
  status: string;
  mode: string;
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastCursor: string | null;
  mappingCount: number;
  lastError: string | null;
}

export interface MonzoService {
  connectStart: (context?: ActorContext) => Promise<{
    status: string;
    message: string;
    authUrl: string;
    stateExpiresAt: string;
  }>;
  callback: (
    input: MonzoCallbackInput,
    context?: ActorContext,
  ) => Promise<{
    status: string;
    message: string;
    accountId: string;
    imported: number;
    skipped: number;
    from: string;
    to: string;
  }>;
  sync: (input?: MonzoSyncInput, context?: ActorContext) => Promise<MonzoSyncSummary>;
  syncNow: (context?: ActorContext) => Promise<MonzoSyncSummary>;
  status: () => Promise<MonzoStatusSummary>;
}

interface MonzoServiceDeps {
  runtime: DomainDbRuntime;
  audit: AuditService;
}

interface SyncWindow {
  from: string;
  to: string;
}

interface SyncInternalInput {
  context: ActorContext;
  forceWindow?: SyncWindow;
  overrideExisting: boolean;
  preloadedConnection?: MonzoConnectionDto;
}

const titleCaseCategory = (value: string): string =>
  value
    .split('_')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');

const isExpenseDedupeConflict = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes(
    'UNIQUE constraint failed: expenses.source, expenses.provider_transaction_id',
  ) ||
    error.message.includes('UNIQUE constraint failed: expenses.id'));

const normalizeMonzoCategory = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : 'uncategorised';
};

const tryGetMonzoPotId = (description: string): string | null => {
  const trimmed = description.trim();
  if (!trimmed.startsWith(MONZO_POT_ID_PREFIX)) {
    return null;
  }

  return trimmed;
};

const formatMonzoPotMerchantName = (potName: string): string => `Pot: ${potName}`;

const resolveImportedMerchantName = (
  transaction: MonzoTransaction,
  potNameById: ReadonlyMap<string, string>,
): string => {
  if (typeof transaction.merchant === 'string' && transaction.merchant.trim().length > 0) {
    return transaction.merchant;
  }

  if (
    typeof transaction.merchant === 'object' &&
    transaction.merchant !== null &&
    typeof transaction.merchant.name === 'string' &&
    transaction.merchant.name.trim().length > 0
  ) {
    return transaction.merchant.name;
  }

  const potId = tryGetMonzoPotId(transaction.description);
  if (potId) {
    const potName = potNameById.get(potId)?.trim();
    if (potName) {
      return formatMonzoPotMerchantName(potName);
    }
  }

  return transaction.description;
};

const shouldRefresh = (tokenExpiresAt: string | null): boolean => {
  if (!tokenExpiresAt) {
    return false;
  }

  const expiryMs = new Date(tokenExpiresAt).getTime();
  if (Number.isNaN(expiryMs)) {
    return true;
  }

  return expiryMs - Date.now() <= TOKEN_REFRESH_GRACE_MS;
};

const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof MonzoApiError) {
    const payload =
      typeof error.details?.payload === 'object' && error.details.payload !== null
        ? (error.details.payload as Record<string, unknown>)
        : null;

    const payloadCode = payload && typeof payload.code === 'string' ? payload.code : null;

    const payloadMessage = payload && typeof payload.message === 'string' ? payload.message : null;

    if (payloadCode || payloadMessage) {
      if (payloadCode === 'forbidden.insufficient_permissions') {
        return new AppError(
          'MONZO_REAUTH_REQUIRED',
          payloadMessage ?? error.message,
          error.statusCode,
          {
            ...error.details,
            monzoCode: payloadCode,
          },
        );
      }

      return new AppError(
        payloadCode ?? error.code,
        payloadMessage ?? error.message,
        error.statusCode,
        {
          ...error.details,
          monzoCode: payloadCode,
        },
      );
    }

    return new AppError(error.code, error.message, error.statusCode, error.details);
  }

  return new AppError(
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : String(error),
    500,
  );
};

const readMonzoEnv = (
  env: Record<string, string | undefined> = process.env,
): { config: MonzoEnv | null; missing: string[] } => {
  const clientId = env.MONZO_CLIENT_ID;
  const clientSecret = env.MONZO_CLIENT_SECRET;
  const redirectUri = env.MONZO_REDIRECT_URI;

  const missing = ['MONZO_CLIENT_ID', 'MONZO_CLIENT_SECRET', 'MONZO_REDIRECT_URI'].filter(
    (key) => (env[key] ?? '').trim().length === 0,
  );

  if (missing.length > 0) {
    return {
      config: null,
      missing,
    };
  }

  return {
    config: {
      clientId: clientId?.trim() ?? '',
      clientSecret: clientSecret?.trim() ?? '',
      redirectUri: redirectUri?.trim() ?? '',
      authBaseUrl: env.MONZO_AUTH_BASE?.trim() || undefined,
      apiBaseUrl: env.MONZO_API_BASE?.trim() || undefined,
      scope: env.MONZO_SCOPE?.trim() || undefined,
    },
    missing: [],
  };
};

const requireMonzoEnv = (env: Record<string, string | undefined> = process.env): MonzoEnv => {
  const { config, missing } = readMonzoEnv(env);
  if (!config) {
    throw new AppError('MONZO_NOT_CONFIGURED', 'Monzo integration is not configured', 400, {
      missing,
    });
  }

  return config;
};

const fromCursorWithOverlap = (cursor: string): string => {
  const cursorMs = new Date(cursor).getTime();
  if (Number.isNaN(cursorMs)) {
    return new Date(Date.now() - INITIAL_BACKFILL_DAYS * DAY_MS).toISOString();
  }

  return new Date(cursorMs - CURSOR_OVERLAP_DAYS * DAY_MS).toISOString();
};

const mergeConnection = (
  existing: MonzoConnectionDto | null,
  patch: Partial<UpsertMonzoConnectionInput>,
): UpsertMonzoConnectionInput => {
  const now = patch.updatedAt ?? toIso(new Date());
  const patched = <T>(value: T | undefined, fallback: T): T =>
    value === undefined ? fallback : value;
  return {
    id: patch.id ?? existing?.id ?? MONZO_CONNECTION_ID,
    accountId: patch.accountId ?? existing?.accountId ?? '',
    status: patch.status ?? existing?.status ?? 'disconnected',
    accessToken: patched(patch.accessToken, existing?.accessToken ?? null),
    refreshToken: patched(patch.refreshToken, existing?.refreshToken ?? null),
    tokenExpiresAt: patched(patch.tokenExpiresAt, existing?.tokenExpiresAt ?? null),
    scope: patched(patch.scope, existing?.scope ?? null),
    oauthState: patched(patch.oauthState, existing?.oauthState ?? null),
    oauthStateExpiresAt: patched(patch.oauthStateExpiresAt, existing?.oauthStateExpiresAt ?? null),
    lastErrorText: patched(patch.lastErrorText, existing?.lastErrorText ?? null),
    lastSyncAt: patched(patch.lastSyncAt, existing?.lastSyncAt ?? null),
    lastCursor: patched(patch.lastCursor, existing?.lastCursor ?? null),
    createdAt: patch.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
};

const resolveWindow = (
  connection: MonzoConnectionDto,
  now: Date,
  forceWindow?: SyncWindow,
): SyncWindow => {
  const ninetyDaysAgoIso = new Date(now.getTime() - INITIAL_BACKFILL_DAYS * DAY_MS).toISOString();

  if (forceWindow) {
    return forceWindow;
  }

  if (!connection.lastCursor) {
    return {
      from: ninetyDaysAgoIso,
      to: now.toISOString(),
    };
  }

  const overlapped = fromCursorWithOverlap(connection.lastCursor);
  const from =
    new Date(overlapped).getTime() < new Date(ninetyDaysAgoIso).getTime()
      ? ninetyDaysAgoIso
      : overlapped;

  return {
    from,
    to: now.toISOString(),
  };
};

const resolveRequestedSyncWindow = (input: MonzoSyncInput | undefined): SyncWindow | undefined => {
  if (!input?.from && !input?.to) {
    return undefined;
  }

  if (!input?.from || !input?.to) {
    throw new AppError('VALIDATION_ERROR', 'Pass both from and to for Monzo sync range', 400);
  }

  const from = assertDate(input.from, 'from');
  const to = assertDate(input.to, 'to');

  if (new Date(from).getTime() >= new Date(to).getTime()) {
    throw new AppError('VALIDATION_ERROR', 'Monzo sync range requires from < to', 400, {
      from,
      to,
    });
  }

  return { from, to };
};

const collectTransactions = async ({
  listTransactions,
  accountId,
  accessToken,
  from,
  to,
}: {
  listTransactions: (input: {
    accountId: string;
    accessToken: string;
    since: string;
    before?: string;
    limit?: number;
  }) => Promise<MonzoTransaction[]>;
  accountId: string;
  accessToken: string;
  from: string;
  to: string;
}): Promise<MonzoTransaction[]> => {
  const txById = new Map<string, MonzoTransaction>();
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  let since = from;
  let before = to;
  let direction: 'asc' | 'desc' | null = null;

  for (let page = 0; page < 50; page += 1) {
    const batch = await listTransactions({
      accountId,
      accessToken,
      since,
      before,
      limit: 100,
    });

    if (batch.length === 0) {
      break;
    }

    for (const transaction of batch) {
      txById.set(transaction.id, transaction);
    }

    const timestamps = batch
      .map((item) => new Date(item.created).getTime())
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) {
      break;
    }

    const firstMs = new Date(batch[0]?.created ?? '').getTime();
    const lastMs = new Date(batch.at(-1)?.created ?? '').getTime();
    if (!direction && Number.isFinite(firstMs) && Number.isFinite(lastMs) && firstMs !== lastMs) {
      direction = firstMs < lastMs ? 'asc' : 'desc';
    }

    const oldestMs = Math.min(...timestamps);
    const newestMs = Math.max(...timestamps);
    if (batch.length < 100) {
      break;
    }

    if (direction === 'asc') {
      if (!Number.isFinite(newestMs) || newestMs >= toMs) {
        break;
      }

      const nextSince = new Date(newestMs + 1).toISOString();
      if (nextSince <= since) {
        break;
      }

      since = nextSince;
      continue;
    }

    if (!Number.isFinite(oldestMs) || oldestMs <= fromMs) {
      break;
    }

    const nextBefore = new Date(oldestMs - 1).toISOString();
    if (nextBefore >= before) {
      break;
    }

    before = nextBefore;
  }

  return [...txById.values()];
};

export const createMonzoService = ({ runtime, audit }: MonzoServiceDeps): MonzoService => {
  const monzoRepo = (db: RepositoryDb = runtime.db) => new SqliteMonzoRepository(db);
  const expensesRepo = (db: RepositoryDb = runtime.db) => new SqliteExpensesRepository(db);
  const categoriesRepo = (db: RepositoryDb = runtime.db) => new SqliteCategoriesRepository(db);

  const syncInternal = async ({
    context,
    forceWindow,
    overrideExisting,
    preloadedConnection,
  }: SyncInternalInput): Promise<MonzoSyncSummary> => {
    const startedAt = toIso(new Date());
    const runId = crypto.randomUUID();
    let connection: MonzoConnectionDto | null = preloadedConnection ?? null;
    let createdSyncRun = false;
    let imported = 0;
    let updated = 0;

    try {
      const env = requireMonzoEnv();
      const client = createMonzoClient({
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        redirectUri: env.redirectUri,
        authBaseUrl: env.authBaseUrl,
        apiBaseUrl: env.apiBaseUrl,
        scope: env.scope,
      });

      if (!connection) {
        connection = monzoRepo().findLatestConnection().connection;
      }

      if (!connection || connection.status === 'disconnected') {
        throw new AppError('MONZO_CONNECTION_REQUIRED', 'Monzo is not connected yet', 409);
      }
      let currentConnection: MonzoConnectionDto = connection;

      monzoRepo().createSyncRun({
        id: runId,
        provider: MONZO_SYNC_PROVIDER,
        startedAt,
        status: 'running',
        importedCount: 0,
        errorText: null,
      });
      createdSyncRun = true;

      if (!currentConnection.accessToken && !currentConnection.refreshToken) {
        throw new AppError(
          'MONZO_REAUTH_REQUIRED',
          'Missing Monzo tokens; reconnect required',
          409,
        );
      }

      if (
        !currentConnection.accessToken ||
        (shouldRefresh(currentConnection.tokenExpiresAt) && currentConnection.refreshToken)
      ) {
        if (!currentConnection.refreshToken) {
          throw new AppError(
            'MONZO_REAUTH_REQUIRED',
            'Refresh token is missing; reconnect required',
            409,
          );
        }

        const refreshed = await client.refreshToken({
          refreshToken: currentConnection.refreshToken,
        });
        {
          const saved = monzoRepo().upsertConnection(
            mergeConnection(currentConnection, {
              id: currentConnection.id,
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token ?? currentConnection.refreshToken,
              tokenExpiresAt: tokenExpiresAtFromMonzoResponse(refreshed),
              lastErrorText: null,
              updatedAt: toIso(new Date()),
            }),
          );

          currentConnection = saved.connection;
        }
      }

      if (!currentConnection.accountId || currentConnection.accountId.length === 0) {
        const accounts = await client.listAccounts({
          accessToken: currentConnection.accessToken ?? '',
        });
        const account = accounts.find((item) => item.closed !== true);
        if (!account) {
          throw new AppError('MONZO_ACCOUNT_NOT_FOUND', 'No open Monzo account available', 400);
        }

        {
          const saved = monzoRepo().upsertConnection(
            mergeConnection(currentConnection, {
              id: currentConnection.id,
              accountId: account.id,
              status: 'connected',
              lastErrorText: null,
              updatedAt: toIso(new Date()),
            }),
          );

          currentConnection = saved.connection;
        }
      }

      const window = resolveWindow(currentConnection, new Date(), forceWindow);
      const allTransactions = await collectTransactions({
        listTransactions: (input) => client.listTransactions(input),
        accountId: currentConnection.accountId,
        accessToken: currentConnection.accessToken ?? '',
        from: window.from,
        to: window.to,
      });

      const eligible = allTransactions.filter((transaction) => transaction.amount !== 0);
      const skippedNonEligible = allTransactions.length - eligible.length;
      let skippedDuplicates = 0;
      const potCandidateIds = new Set<string>();
      const fetchedTransactionIds = new Set(eligible.map((transaction) => transaction.id));

      for (const transaction of eligible) {
        const potId = tryGetMonzoPotId(transaction.description);
        if (potId) {
          potCandidateIds.add(potId);
        }
      }

      let potNameById = new Map<string, string>();
      if (potCandidateIds.size > 0) {
        try {
          const pots = await client.listPots({
            accessToken: currentConnection.accessToken ?? '',
            currentAccountId: currentConnection.accountId,
          });

          potNameById = new Map(
            pots
              .filter((pot) => potCandidateIds.has(pot.id))
              .map((pot) => [pot.id, pot.name.trim()] as const)
              .filter(([, name]) => name.length > 0),
          );
        } catch {
          // Pot name resolution is optional UX enrichment; sync should continue without it.
          potNameById = new Map();
        }
      }

      let newestEligibleCursor: string | null = null;
      for (const transaction of eligible) {
        const createdIso = assertDate(transaction.created, 'transaction.created');
        if (
          !newestEligibleCursor ||
          new Date(createdIso).getTime() > new Date(newestEligibleCursor).getTime()
        ) {
          newestEligibleCursor = createdIso;
        }
      }

      withTransaction(runtime.db, (tx) => {
        const monzoTxRepo = monzoRepo(tx);
        const expensesTxRepo = expensesRepo(tx);
        const categoriesTxRepo = categoriesRepo(tx);

        for (const transaction of eligible) {
          const nowIso = toIso(new Date());
          const isPotTransfer = tryGetMonzoPotId(transaction.description) !== null;
          const flow: 'in' | 'out' = transaction.amount < 0 ? 'out' : 'in';
          const semanticKind = isPotTransfer
            ? 'transfer_internal'
            : flow === 'out'
              ? 'expense'
              : 'income';
          const transferDirection = isPotTransfer ? flow : null;
          let resolvedCategoryId: string | null = null;

          if (isPotTransfer) {
            const transferCategoryName = 'Monzo Pot Transfers';
            let transferCategory = categoriesTxRepo
              .list({})
              .categories.find(
                (item) => item.kind === 'transfer' && item.name === transferCategoryName,
              );

            if (!transferCategory) {
              try {
                transferCategory = categoriesTxRepo.create({
                  id: crypto.randomUUID(),
                  name: transferCategoryName,
                  kind: 'transfer',
                  icon: 'savings',
                  color: '#1976D2',
                  isSystem: false,
                  reimbursementMode: 'none',
                  defaultCounterpartyType: null,
                  defaultRecoveryWindowDays: null,
                  defaultMyShareMode: null,
                  defaultMyShareValue: null,
                  archivedAt: null,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                }).category;
              } catch {
                transferCategory = categoriesTxRepo
                  .list({})
                  .categories.find(
                    (item) => item.kind === 'transfer' && item.name === transferCategoryName,
                  );
              }
            }

            if (!transferCategory) {
              throw new AppError(
                'MONZO_CATEGORY_CREATE_FAILED',
                'Could not resolve Monzo pot transfer category',
                500,
              );
            }

            resolvedCategoryId = transferCategory.id;
          } else {
            const monzoCategory = normalizeMonzoCategory(transaction.category);
            let mapping = monzoTxRepo.findCategoryMapping({ monzoCategory, flow }).mapping;

            if (!mapping) {
              const categoryName = titleCaseCategory(monzoCategory);
              const legacyCategoryName = `Monzo: ${categoryName}`;
              const categoryKind = flow === 'out' ? 'expense' : 'income';
              let category = categoriesTxRepo
                .list({})
                .categories.find(
                  (item) =>
                    item.kind === categoryKind &&
                    (item.name === categoryName ||
                      (categoryKind === 'expense' && item.name === legacyCategoryName)),
                );

              if (!category) {
                try {
                  category = categoriesTxRepo.create({
                    id: crypto.randomUUID(),
                    name: categoryName,
                    kind: categoryKind,
                    icon: 'savings',
                    color: '#1976D2',
                    isSystem: false,
                    reimbursementMode: 'none',
                    defaultCounterpartyType: null,
                    defaultRecoveryWindowDays: null,
                    defaultMyShareMode: null,
                    defaultMyShareValue: null,
                    archivedAt: null,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  }).category;
                } catch {
                  category = categoriesTxRepo
                    .list({})
                    .categories.find(
                      (item) => item.kind === categoryKind && item.name === categoryName,
                    );
                }
              }

              if (!category) {
                throw new AppError(
                  'MONZO_CATEGORY_CREATE_FAILED',
                  `Could not resolve category for Monzo category ${monzoCategory}:${flow}`,
                  500,
                );
              }

              mapping = monzoTxRepo.upsertCategoryMapping({
                monzoCategory,
                flow,
                categoryId: category.id,
                createdAt: nowIso,
                updatedAt: nowIso,
              }).mapping;
            }

            resolvedCategoryId = mapping.categoryId;
          }

          monzoTxRepo.upsertRawTransaction({
            transactionId: transaction.id,
            payloadJson: JSON.stringify(transaction),
            createdAt: nowIso,
            updatedAt: nowIso,
          });

          const postedAt = transaction.settled
            ? assertDate(transaction.settled, 'transaction.settled')
            : null;
          const occurredAt = assertDate(transaction.created, 'transaction.created');
          const merchantLogoUrl =
            typeof transaction.merchant === 'object' && transaction.merchant !== null
              ? (transaction.merchant.logo ?? null)
              : null;
          const merchantEmoji =
            typeof transaction.merchant === 'object' && transaction.merchant !== null
              ? (transaction.merchant.emoji ?? null)
              : null;
          const merchantName = resolveImportedMerchantName(transaction, potNameById);

          const canonicalExpenseId = `monzo:${transaction.id}`;
          const existingImported = expensesTxRepo.findById({ id: canonicalExpenseId }).expense;

          if (existingImported) {
            expensesTxRepo.update({
              id: existingImported.id,
              occurredAt,
              postedAt,
              amountMinor: Math.abs(transaction.amount),
              currency: normalizeCurrency(transaction.currency),
              amountBaseMinor: null,
              fxRate: null,
              categoryId: resolvedCategoryId,
              transferDirection,
              kind: semanticKind,
              reimbursementStatus: existingImported.reimbursementStatus,
              myShareMinor: existingImported.myShareMinor,
              closedOutstandingMinor: existingImported.closedOutstandingMinor,
              counterpartyType: existingImported.counterpartyType,
              reimbursementGroupId: existingImported.reimbursementGroupId,
              reimbursementClosedAt: existingImported.reimbursementClosedAt,
              reimbursementClosedReason: existingImported.reimbursementClosedReason,
              merchantName,
              merchantLogoUrl,
              merchantEmoji,
              note: existingImported.note,
              updatedAt: nowIso,
            });
            updated += 1;
            continue;
          }

          try {
            expensesTxRepo.create({
              id: canonicalExpenseId,
              occurredAt,
              postedAt,
              amountMinor: Math.abs(transaction.amount),
              currency: normalizeCurrency(transaction.currency),
              amountBaseMinor: null,
              fxRate: null,
              categoryId: resolvedCategoryId,
              source: 'monzo',
              transferDirection,
              kind: semanticKind,
              reimbursementStatus: 'none',
              myShareMinor: null,
              closedOutstandingMinor: null,
              counterpartyType: null,
              reimbursementGroupId: null,
              reimbursementClosedAt: null,
              reimbursementClosedReason: null,
              merchantName,
              merchantLogoUrl,
              merchantEmoji,
              note: null,
              providerTransactionId: transaction.id,
              commitmentInstanceId: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
            imported += 1;
          } catch (error) {
            if (isExpenseDedupeConflict(error)) {
              skippedDuplicates += 1;
              continue;
            }

            throw error;
          }
        }

        const pendingInWindow = expensesTxRepo.listPendingMonzoInRange({
          from: window.from,
          to: window.to,
        }).expenses;
        for (const pendingExpense of pendingInWindow) {
          const transactionId = pendingExpense.providerTransactionId;
          if (transactionId && fetchedTransactionIds.has(transactionId)) {
            continue;
          }

          expensesTxRepo.deleteById({ id: pendingExpense.id });
        }

        monzoTxRepo.upsertConnection(
          mergeConnection(currentConnection, {
            id: currentConnection.id,
            status: 'connected',
            lastSyncAt: toIso(new Date()),
            lastCursor:
              newestEligibleCursor && currentConnection.lastCursor
                ? new Date(newestEligibleCursor).getTime() >
                  new Date(currentConnection.lastCursor).getTime()
                  ? newestEligibleCursor
                  : currentConnection.lastCursor
                : (newestEligibleCursor ?? currentConnection.lastCursor),
            lastErrorText: null,
            updatedAt: toIso(new Date()),
          }),
        );

        monzoTxRepo.finishSyncRun({
          id: runId,
          endedAt: toIso(new Date()),
          status: 'success',
          importedCount: imported,
          errorText: null,
        });
      });

      const skipped = skippedNonEligible + skippedDuplicates;
      const summary: MonzoSyncSummary = {
        status: 'ok',
        message: 'Monzo sync completed',
        imported,
        updated,
        skipped,
        accountId: currentConnection.accountId,
        from: window.from,
        to: window.to,
        cursor: newestEligibleCursor ?? currentConnection.lastCursor,
      };

      await audit.writeAudit(
        'monzo.sync',
        {
          imported,
          updated,
          skipped,
          accountId: summary.accountId,
          from: summary.from,
          to: summary.to,
          cursor: summary.cursor,
        },
        context,
      );

      return summary;
    } catch (error) {
      const appError = toAppError(error);

      if (createdSyncRun) {
        const monzoCode =
          typeof appError.details?.monzoCode === 'string' ? appError.details.monzoCode : null;
        const latest = monzoRepo().findLatestConnection().connection;
        if (latest) {
          monzoRepo().upsertConnection(
            mergeConnection(latest, {
              id: latest.id,
              status:
                appError.code === 'MONZO_REAUTH_REQUIRED' ||
                monzoCode === 'forbidden.insufficient_permissions'
                  ? 'connected'
                  : 'sync_error',
              lastErrorText: appError.message,
              updatedAt: toIso(new Date()),
            }),
          );
        }

        monzoRepo().finishSyncRun({
          id: runId,
          endedAt: toIso(new Date()),
          status: 'failed',
          importedCount: imported,
          errorText: appError.message,
        });
      }

      throw appError;
    }
  };

  return {
    async connectStart(context: ActorContext = DEFAULT_ACTOR) {
      const env = requireMonzoEnv();
      const client = createMonzoClient({
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        redirectUri: env.redirectUri,
        authBaseUrl: env.authBaseUrl,
        apiBaseUrl: env.apiBaseUrl,
        scope: env.scope,
      });

      const state = crypto.randomUUID();
      const now = new Date();
      const nowIso = now.toISOString();
      const stateExpiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString();

      const existing = monzoRepo().findLatestConnection().connection;
      monzoRepo().upsertConnection(
        mergeConnection(existing, {
          id: existing?.id ?? MONZO_CONNECTION_ID,
          status: 'awaiting_oauth',
          oauthState: state,
          oauthStateExpiresAt: stateExpiresAt,
          lastErrorText: null,
          updatedAt: nowIso,
        }),
      );

      const authUrl = client.buildAuthorizeUrl({ state });
      await audit.writeAudit('monzo.connect_start', { stateExpiresAt }, context);

      return {
        status: 'awaiting_oauth',
        message: 'Open authUrl in browser and complete Monzo OAuth flow',
        authUrl,
        stateExpiresAt,
      };
    },

    async callback(input: MonzoCallbackInput, context: ActorContext = DEFAULT_ACTOR) {
      try {
        if (input.error) {
          throw new AppError('MONZO_OAUTH_DENIED', 'Monzo OAuth denied by user', 400, {
            error: input.error,
            errorDescription: input.errorDescription ?? null,
          });
        }

        if (!input.code || !input.state) {
          throw new AppError('VALIDATION_ERROR', 'OAuth callback requires code and state', 400, {
            codePresent: Boolean(input.code),
            statePresent: Boolean(input.state),
          });
        }

        const env = requireMonzoEnv();
        const client = createMonzoClient({
          clientId: env.clientId,
          clientSecret: env.clientSecret,
          redirectUri: env.redirectUri,
          authBaseUrl: env.authBaseUrl,
          apiBaseUrl: env.apiBaseUrl,
          scope: env.scope,
        });

        const existing = monzoRepo().findLatestConnection().connection;

        if (!existing?.oauthState || !existing.oauthStateExpiresAt) {
          throw new AppError('MONZO_OAUTH_STATE_MISSING', 'No active Monzo OAuth state found', 400);
        }

        if (existing.oauthState !== input.state) {
          throw new AppError('MONZO_OAUTH_STATE_INVALID', 'Monzo OAuth state does not match', 400);
        }

        if (new Date(existing.oauthStateExpiresAt).getTime() < Date.now()) {
          throw new AppError('MONZO_OAUTH_STATE_EXPIRED', 'Monzo OAuth state has expired', 400);
        }

        const token = await client.exchangeCode({ code: input.code });

        const nowIso = toIso(new Date());
        const updatedConnection = monzoRepo().upsertConnection(
          mergeConnection(existing, {
            id: existing.id,
            accountId: existing.accountId,
            status: 'connected',
            accessToken: token.access_token,
            refreshToken: token.refresh_token ?? existing.refreshToken,
            tokenExpiresAt: tokenExpiresAtFromMonzoResponse(token),
            scope: token.scope ?? existing.scope,
            oauthState: null,
            oauthStateExpiresAt: null,
            lastErrorText: null,
            updatedAt: nowIso,
          }),
        ).connection;

        await audit.writeAudit(
          'monzo.callback',
          {
            accountId: updatedConnection.accountId || null,
            manualSyncRequired: true,
          },
          context,
        );

        const initialFrom = new Date(Date.now() - INITIAL_BACKFILL_DAYS * DAY_MS).toISOString();

        return {
          status: 'connected',
          message:
            'Monzo OAuth callback completed. No sync was run automatically; approve permissions in Monzo (if prompted), then run a Monzo sync from the Monthly Ledger or CLI.',
          accountId: updatedConnection.accountId,
          imported: 0,
          skipped: 0,
          from: initialFrom,
          to: nowIso,
        };
      } catch (error) {
        throw toAppError(error);
      }
    },

    async sync(input: MonzoSyncInput = {}, context: ActorContext = DEFAULT_ACTOR) {
      const forceWindow = resolveRequestedSyncWindow(input);
      return syncInternal({
        context,
        forceWindow,
        overrideExisting: input.overrideExisting === true,
      });
    },

    async syncNow(context: ActorContext = DEFAULT_ACTOR) {
      return syncInternal({ context, overrideExisting: false });
    },

    async status() {
      const env = readMonzoEnv();
      const connection = monzoRepo().findLatestConnection().connection;
      const mappingCount = monzoRepo().countCategoryMappings().count;

      return {
        status: !env.config ? 'not_configured' : (connection?.status ?? 'disconnected'),
        mode: 'developer_api_expenses_only',
        configured: Boolean(env.config),
        connected: connection?.status === 'connected',
        accountId: connection && connection.accountId.length > 0 ? connection.accountId : null,
        lastSyncAt: connection?.lastSyncAt ?? null,
        lastCursor: connection?.lastCursor ?? null,
        mappingCount,
        lastError: connection?.lastErrorText ?? null,
      };
    },
  };
};
