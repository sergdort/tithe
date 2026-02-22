import crypto from 'node:crypto';

import {
  MonzoApiError,
  type MonzoTransaction,
  createMonzoClient,
  tokenExpiresAtFromMonzoResponse,
} from './monzo-client.js';

import { AppError } from '../errors.js';
import type {
  MonzoConnectionDto,
  UpsertMonzoConnectionInput,
} from '../repositories/monzo.repository.js';
import { withTransaction } from '../repositories/shared.js';
import type { ActorContext } from '../types.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, normalizeCurrency, toIso } from './shared/common.js';
import type { DomainRuntimeDeps } from './shared/deps.js';

const MONZO_SYNC_PROVIDER = 'monzo';
const MONZO_CONNECTION_ID = 'primary';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const INITIAL_BACKFILL_DAYS = 90;
const CURSOR_OVERLAP_DAYS = 3;
const TOKEN_REFRESH_GRACE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  skipped: number;
  accountId: string;
  from: string;
  to: string;
  cursor: string | null;
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
  syncNow: (context?: ActorContext) => Promise<MonzoSyncSummary>;
  status: () => Promise<MonzoStatusSummary>;
}

interface MonzoServiceDeps {
  runtime: DomainRuntimeDeps;
  audit: AuditService;
}

interface SyncWindow {
  from: string;
  to: string;
}

interface SyncInternalInput {
  context: ActorContext;
  forceSince?: string;
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
  error.message.includes('UNIQUE constraint failed: expenses.source, expenses.external_ref');

const normalizeMonzoCategory = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : 'uncategorised';
};

const isPendingTransaction = (transaction: MonzoTransaction): boolean =>
  transaction.settled === null || transaction.settled === undefined || transaction.settled === '';

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

    const payloadCode =
      payload && typeof payload.code === 'string' ? payload.code : null;

    const payloadMessage =
      payload && typeof payload.message === 'string' ? payload.message : null;

    if (payloadCode || payloadMessage) {
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
  return {
    id: patch.id ?? existing?.id ?? MONZO_CONNECTION_ID,
    accountId: patch.accountId ?? existing?.accountId ?? '',
    status: patch.status ?? existing?.status ?? 'disconnected',
    accessToken: patch.accessToken ?? existing?.accessToken ?? null,
    refreshToken: patch.refreshToken ?? existing?.refreshToken ?? null,
    tokenExpiresAt: patch.tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
    scope: patch.scope ?? existing?.scope ?? null,
    oauthState: patch.oauthState ?? existing?.oauthState ?? null,
    oauthStateExpiresAt: patch.oauthStateExpiresAt ?? existing?.oauthStateExpiresAt ?? null,
    lastErrorText: patch.lastErrorText ?? existing?.lastErrorText ?? null,
    lastSyncAt: patch.lastSyncAt ?? existing?.lastSyncAt ?? null,
    lastCursor: patch.lastCursor ?? existing?.lastCursor ?? null,
    createdAt: patch.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
};

const resolveWindow = (
  connection: MonzoConnectionDto,
  now: Date,
  forceSince?: string,
): SyncWindow => {
  const ninetyDaysAgoIso = new Date(now.getTime() - INITIAL_BACKFILL_DAYS * DAY_MS).toISOString();

  if (forceSince) {
    return {
      from: forceSince,
      to: now.toISOString(),
    };
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
  let before = to;

  for (let page = 0; page < 50; page += 1) {
    const batch = await listTransactions({
      accountId,
      accessToken,
      since: from,
      before,
      limit: 100,
    });

    if (batch.length === 0) {
      break;
    }

    for (const transaction of batch) {
      txById.set(transaction.id, transaction);
    }

    const oldestMs = Math.min(...batch.map((item) => new Date(item.created).getTime()));
    if (!Number.isFinite(oldestMs) || oldestMs <= new Date(from).getTime() || batch.length < 100) {
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
  const syncInternal = async ({
    context,
    forceSince,
    preloadedConnection,
  }: SyncInternalInput): Promise<MonzoSyncSummary> => {
    const startedAt = toIso(new Date());
    const runId = crypto.randomUUID();
    let connection: MonzoConnectionDto | null = preloadedConnection ?? null;
    let createdSyncRun = false;
    let imported = 0;

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
        connection = await runtime.withDb(
          ({ db }) => runtime.repositories.monzo(db).findLatestConnection().connection,
        );
      }

      if (!connection || connection.status === 'disconnected') {
        throw new AppError('MONZO_CONNECTION_REQUIRED', 'Monzo is not connected yet', 409);
      }
      let currentConnection: MonzoConnectionDto = connection;

      await runtime.withDb(({ db }) => {
        runtime.repositories.monzo(db).createSyncRun({
          id: runId,
          provider: MONZO_SYNC_PROVIDER,
          startedAt,
          status: 'running',
          importedCount: 0,
          errorText: null,
        });
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
        currentConnection = await runtime.withDb(({ db }) => {
          const monzoRepo = runtime.repositories.monzo(db);
          const saved = monzoRepo.upsertConnection(
            mergeConnection(currentConnection, {
              id: currentConnection.id,
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token ?? currentConnection.refreshToken,
              tokenExpiresAt: tokenExpiresAtFromMonzoResponse(refreshed),
              lastErrorText: null,
              updatedAt: toIso(new Date()),
            }),
          );

          return saved.connection;
        });
      }

      if (!currentConnection.accountId || currentConnection.accountId.length === 0) {
        const accounts = await client.listAccounts({ accessToken: currentConnection.accessToken ?? '' });
        const account = accounts.find((item) => item.closed !== true);
        if (!account) {
          throw new AppError('MONZO_ACCOUNT_NOT_FOUND', 'No open Monzo account available', 400);
        }

        currentConnection = await runtime.withDb(({ db }) => {
          const monzoRepo = runtime.repositories.monzo(db);
          const saved = monzoRepo.upsertConnection(
            mergeConnection(currentConnection, {
              id: currentConnection.id,
              accountId: account.id,
              status: 'connected',
              lastErrorText: null,
              updatedAt: toIso(new Date()),
            }),
          );

          return saved.connection;
        });
      }

      const window = resolveWindow(currentConnection, new Date(), forceSince);
      const allTransactions = await collectTransactions({
        listTransactions: (input) => client.listTransactions(input),
        accountId: currentConnection.accountId,
        accessToken: currentConnection.accessToken ?? '',
        from: window.from,
        to: window.to,
      });

      const eligible = allTransactions.filter(
        (transaction) => !isPendingTransaction(transaction) && transaction.amount < 0,
      );
      const skippedNonEligible = allTransactions.length - eligible.length;
      let skippedDuplicates = 0;

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

      await runtime.withDb(({ db }) => {
        withTransaction(db, (tx) => {
          const monzoRepo = runtime.repositories.monzo(tx);
          const expensesRepo = runtime.repositories.expenses(tx);
          const categoriesRepo = runtime.repositories.categories(tx);

          for (const transaction of eligible) {
            const nowIso = toIso(new Date());
            const monzoCategory = normalizeMonzoCategory(transaction.category);
            let mapping = monzoRepo.findCategoryMapping({ monzoCategory }).mapping;

            if (!mapping) {
              const categoryName = titleCaseCategory(monzoCategory);
              const legacyCategoryName = `Monzo: ${categoryName}`;
              let category = categoriesRepo
                .list({})
                .categories.find(
                  (item) =>
                    item.kind === 'expense' &&
                    (item.name === categoryName || item.name === legacyCategoryName),
                );

              if (!category) {
                try {
                  category = categoriesRepo.create({
                    id: crypto.randomUUID(),
                    name: categoryName,
                    kind: 'expense',
                    icon: 'savings',
                    color: '#1976D2',
                    isSystem: false,
                    archivedAt: null,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  }).category;
                } catch {
                  category = categoriesRepo
                    .list({})
                    .categories.find(
                      (item) => item.kind === 'expense' && item.name === categoryName,
                    );
                }
              }

              if (!category) {
                throw new AppError(
                  'MONZO_CATEGORY_CREATE_FAILED',
                  `Could not resolve category for Monzo category ${monzoCategory}`,
                  500,
                );
              }

              mapping = monzoRepo.upsertCategoryMapping({
                monzoCategory,
                categoryId: category.id,
                createdAt: nowIso,
                updatedAt: nowIso,
              }).mapping;
            }

            monzoRepo.upsertRawTransaction({
              transactionId: transaction.id,
              payloadJson: JSON.stringify(transaction),
              createdAt: nowIso,
              updatedAt: nowIso,
            });

            const postedAt = transaction.settled
              ? assertDate(transaction.settled, 'transaction.settled')
              : null;

            try {
              expensesRepo.create({
                id: crypto.randomUUID(),
                occurredAt: assertDate(transaction.created, 'transaction.created'),
                postedAt,
                amountMinor: Math.abs(transaction.amount),
                currency: normalizeCurrency(transaction.currency),
                amountBaseMinor: null,
                fxRate: null,
                categoryId: mapping.categoryId,
                source: 'monzo_import',
                merchantName:
                  (typeof transaction.merchant === 'string'
                    ? transaction.merchant
                    : transaction.merchant?.name) ?? transaction.description,
                note: null,
                externalRef: transaction.id,
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

          monzoRepo.upsertConnection(
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

          monzoRepo.finishSyncRun({
            id: runId,
            endedAt: toIso(new Date()),
            status: 'success',
            importedCount: imported,
            errorText: null,
          });
        });
      });

      const skipped = skippedNonEligible + skippedDuplicates;
      const summary: MonzoSyncSummary = {
        status: 'ok',
        message: 'Monzo sync completed',
        imported,
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
        await runtime.withDb(({ db }) => {
          const monzoRepo = runtime.repositories.monzo(db);
          const latest = monzoRepo.findLatestConnection().connection;
          if (latest) {
            monzoRepo.upsertConnection(
              mergeConnection(latest, {
                id: latest.id,
                status:
                  appError.code === 'forbidden.insufficient_permissions'
                    ? 'connected'
                    : 'sync_error',
                lastErrorText: appError.message,
                updatedAt: toIso(new Date()),
              }),
            );
          }

          monzoRepo.finishSyncRun({
            id: runId,
            endedAt: toIso(new Date()),
            status: 'failed',
            importedCount: imported,
            errorText: appError.message,
          });
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

      await runtime.withDb(({ db }) => {
        const monzoRepo = runtime.repositories.monzo(db);
        const existing = monzoRepo.findLatestConnection().connection;
        monzoRepo.upsertConnection(
          mergeConnection(existing, {
            id: existing?.id ?? MONZO_CONNECTION_ID,
            status: 'awaiting_oauth',
            oauthState: state,
            oauthStateExpiresAt: stateExpiresAt,
            lastErrorText: null,
            updatedAt: nowIso,
          }),
        );
      });

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

        const existing = await runtime.withDb(
          ({ db }) => runtime.repositories.monzo(db).findLatestConnection().connection,
        );

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

        const updatedConnection = await runtime.withDb(({ db }) => {
          const monzoRepo = runtime.repositories.monzo(db);
          const nowIso = toIso(new Date());
          const saved = monzoRepo.upsertConnection(
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
          );

          return saved.connection;
        });

        const initialFrom = new Date(Date.now() - INITIAL_BACKFILL_DAYS * DAY_MS).toISOString();

        try {
          const syncResult = await syncInternal({
            context,
            forceSince: initialFrom,
            preloadedConnection: updatedConnection,
          });

          await audit.writeAudit(
            'monzo.callback',
            {
              accountId: syncResult.accountId,
              imported: syncResult.imported,
              skipped: syncResult.skipped,
              from: syncResult.from,
              to: syncResult.to,
            },
            context,
          );

          return {
            status: 'connected',
            message: 'Monzo OAuth callback completed and initial sync finished',
            accountId: syncResult.accountId,
            imported: syncResult.imported,
            skipped: syncResult.skipped,
            from: syncResult.from,
            to: syncResult.to,
          };
        } catch (syncError) {
          const appError = toAppError(syncError);
          if (appError.code === 'forbidden.insufficient_permissions') {
            await runtime.withDb(({ db }) => {
              const monzoRepo = runtime.repositories.monzo(db);
              const latest = monzoRepo.findLatestConnection().connection;
              if (latest) {
                monzoRepo.upsertConnection(
                  mergeConnection(latest, {
                    id: latest.id,
                    status: 'connected',
                    lastErrorText: appError.message,
                    updatedAt: toIso(new Date()),
                  }),
                );
              }
            });

            return {
              status: 'connected_pending_permissions',
              message:
                'Monzo token acquired. Waiting for in-app approval to activate account permissions. Use Sync now to retry.',
              accountId: '',
              imported: 0,
              skipped: 0,
              from: initialFrom,
              to: new Date().toISOString(),
            };
          }

          throw appError;
        }
      } catch (error) {
        throw toAppError(error);
      }
    },

    async syncNow(context: ActorContext = DEFAULT_ACTOR) {
      return syncInternal({ context });
    },

    async status() {
      const env = readMonzoEnv();
      const connection = await runtime.withDb(
        ({ db }) => runtime.repositories.monzo(db).findLatestConnection().connection,
      );
      const mappingCount = await runtime.withDb(
        ({ db }) => runtime.repositories.monzo(db).countCategoryMappings().count,
      );

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
