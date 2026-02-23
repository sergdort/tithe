import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDb, monzoCategoryMappings, monzoConnections, runMigrations } from '@tithe/db';
import { createDomainServices } from '@tithe/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setupService = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tithe-monzo-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  runMigrations(dbPath);
  const services = createDomainServices({ dbPath });
  return { services, dir, dbPath };
};

const closeServices = (services: unknown): void => {
  (services as { close?: () => void }).close?.();
};

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });

const MONZO_ENV_KEYS = [
  'MONZO_CLIENT_ID',
  'MONZO_CLIENT_SECRET',
  'MONZO_REDIRECT_URI',
  'MONZO_AUTH_BASE',
  'MONZO_API_BASE',
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  MONZO_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof MONZO_ENV_KEYS)[number], string | undefined>;

const setMonzoEnv = (): void => {
  process.env.MONZO_CLIENT_ID = 'test-client-id';
  process.env.MONZO_CLIENT_SECRET = 'test-client-secret';
  process.env.MONZO_REDIRECT_URI = 'http://localhost:8787/v1/integrations/monzo/connect/callback';
  process.env.MONZO_AUTH_BASE = 'https://auth.monzo.test';
  process.env.MONZO_API_BASE = 'https://api.monzo.test';
};

const restoreMonzoEnv = (): void => {
  for (const key of MONZO_ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
};

describe('Monzo integration domain service', () => {
  beforeEach(() => {
    setMonzoEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreMonzoEnv();
    vi.restoreAllMocks();
  });

  it('creates OAuth state and auth URL on connect start', async () => {
    const { services, dir, dbPath } = setupService();

    try {
      const result = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const authUrl = new URL(result.authUrl);
      const stateFromUrl = authUrl.searchParams.get('state');

      expect(result.status).toBe('awaiting_oauth');
      expect(stateFromUrl).toBeTruthy();
      expect(authUrl.origin).toBe('https://auth.monzo.test');
      expect(authUrl.searchParams.get('client_id')).toBe('test-client-id');

      const { db, sqlite } = createDb({ dbPath });
      try {
        const row = db.select().from(monzoConnections).all()[0];
        expect(row?.oauthState).toBe(stateFromUrl);
        expect(row?.oauthStateExpiresAt).toBeTruthy();
        expect(row?.status).toBe('awaiting_oauth');
      } finally {
        sqlite.close();
      }
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects callback when OAuth state does not match', async () => {
    const { services, dir } = setupService();

    try {
      const started = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const url = new URL(started.authUrl);
      expect(url.searchParams.get('state')).toBeTruthy();

      await expect(
        services.monzo.callback(
          {
            code: 'auth-code',
            state: 'wrong-state',
          },
          { actor: 'test', channel: 'system' },
        ),
      ).rejects.toMatchObject({
        code: 'MONZO_OAUTH_STATE_INVALID',
      });
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('imports settled debit transactions, skips others, dedupes, and reports status', async () => {
    const { services, dir, dbPath } = setupService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const started = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const state = new URL(started.authUrl).searchParams.get('state');
      expect(state).toBeTruthy();

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'token-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            accounts: [{ id: 'acc_main', closed: false }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            transactions: [
              {
                id: 'tx_debit_settled',
                account_id: 'acc_main',
                amount: -1234,
                currency: 'GBP',
                description: 'Store purchase',
                category: 'groceries',
                created: '2026-02-01T10:00:00.000Z',
                settled: '2026-02-02T10:00:00.000Z',
                merchant: {
                  name: 'Local Shop',
                  logo: 'https://img.test/local-shop.png',
                  emoji: '🛍️',
                },
              },
              {
                id: 'tx_pending',
                account_id: 'acc_main',
                amount: -500,
                currency: 'GBP',
                description: 'Pending charge',
                category: 'groceries',
                created: '2026-02-03T10:00:00.000Z',
                settled: null,
                merchant: null,
              },
              {
                id: 'tx_income',
                account_id: 'acc_main',
                amount: 2200,
                currency: 'GBP',
                description: 'Salary',
                category: 'income',
                created: '2026-02-04T10:00:00.000Z',
                settled: '2026-02-04T10:01:00.000Z',
                merchant: null,
              },
            ],
          }),
        );

      const callbackResult = await services.monzo.callback(
        {
          code: 'auth-code',
          state: state ?? undefined,
        },
        { actor: 'test', channel: 'system' },
      );

      expect(callbackResult.imported).toBe(0);
      expect(callbackResult.skipped).toBe(0);

      const expensesAfterCallback = await services.expenses.list();
      expect(expensesAfterCallback.length).toBe(0);

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          transactions: [
            {
              id: 'tx_debit_settled',
              account_id: 'acc_main',
              amount: -1234,
              currency: 'GBP',
              description: 'Store purchase',
              category: 'groceries',
              created: '2026-02-01T10:00:00.000Z',
              settled: '2026-02-02T10:00:00.000Z',
              merchant: {
                name: 'Local Shop',
                logo: 'https://img.test/local-shop.png',
                emoji: '🛍️',
              },
            },
          ],
        }),
      );

      const syncResult = await services.monzo.syncNow({ actor: 'test', channel: 'system' });
      expect(syncResult.imported).toBe(1);
      expect(syncResult.skipped).toBe(2);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/pots'))).toBe(false);

      const expensesAfterResync = await services.expenses.list();
      expect(expensesAfterResync.length).toBe(1);
      expect(expensesAfterResync[0]?.source).toBe('monzo_import');
      expect(expensesAfterResync[0]?.externalRef).toBe('tx_debit_settled');
      expect(expensesAfterResync[0]?.money.amountMinor).toBe(1234);
      expect(expensesAfterResync[0]?.merchantName).toBe('Local Shop');
      expect(expensesAfterResync[0]?.merchantLogoUrl).toBe('https://img.test/local-shop.png');
      expect(expensesAfterResync[0]?.merchantEmoji).toBe('🛍️');

      const status = await services.monzo.status();
      expect(status.status).toBe('connected');
      expect(status.connected).toBe(true);
      expect(status.accountId).toBe('acc_main');
      expect(status.lastSyncAt).toBeTruthy();
      expect(status.mappingCount).toBe(1);

      const { db, sqlite } = createDb({ dbPath });
      try {
        const mappingRows = db.select().from(monzoCategoryMappings).all();
        expect(mappingRows.length).toBe(1);
        expect(mappingRows[0]?.monzoCategory).toBe('groceries');
      } finally {
        sqlite.close();
      }
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps pot transfer IDs to pot names during Monzo sync', async () => {
    const { services, dir } = setupService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const started = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const state = new URL(started.authUrl).searchParams.get('state');
      expect(state).toBeTruthy();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          access_token: 'token-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
        }),
      );

      const callbackResult = await services.monzo.callback(
        {
          code: 'auth-code',
          state: state ?? undefined,
        },
        { actor: 'test', channel: 'system' },
      );
      expect(callbackResult.status).toBe('connected');

      const potId = 'pot_0000778xxfgh4iu8z83nWb';
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            accounts: [{ id: 'acc_main', closed: false }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            transactions: [
              {
                id: 'tx_pot_transfer',
                account_id: 'acc_main',
                amount: -51,
                currency: 'GBP',
                description: potId,
                category: 'savings',
                created: '2026-01-17T18:33:47.633Z',
                settled: '2026-01-17T18:33:47.633Z',
                merchant: null,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            pots: [
              {
                id: potId,
                name: 'Savings',
                deleted: false,
              },
            ],
          }),
        );

      const syncResult = await services.monzo.syncNow({ actor: 'test', channel: 'system' });
      expect(syncResult.imported).toBe(1);
      expect(syncResult.skipped).toBe(0);

      const expenses = await services.expenses.list();
      expect(expenses.length).toBe(1);
      expect(expenses[0]?.merchantName).toBe('Pot: Savings');

      const potsCallUrl = fetchMock.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.includes('/pots?'));
      expect(potsCallUrl).toBeTruthy();
      expect(potsCallUrl).toContain('current_account_id=acc_main');
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to raw pot ID when Monzo pots lookup fails', async () => {
    const { services, dir } = setupService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const started = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const state = new URL(started.authUrl).searchParams.get('state');
      expect(state).toBeTruthy();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          access_token: 'token-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
        }),
      );

      await services.monzo.callback(
        {
          code: 'auth-code',
          state: state ?? undefined,
        },
        { actor: 'test', channel: 'system' },
      );

      const potId = 'pot_0000AkFa5tdxsLJA4cnqef';
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            accounts: [{ id: 'acc_main', closed: false }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            transactions: [
              {
                id: 'tx_pot_transfer_fallback',
                account_id: 'acc_main',
                amount: -51,
                currency: 'GBP',
                description: potId,
                category: 'savings',
                created: '2026-01-17T18:33:47.633Z',
                settled: '2026-01-17T18:33:47.633Z',
                merchant: null,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              code: 'forbidden.insufficient_permissions',
              message: 'Access forbidden due to insufficient permissions',
            },
            403,
          ),
        );

      const syncResult = await services.monzo.syncNow({ actor: 'test', channel: 'system' });
      expect(syncResult.imported).toBe(1);
      expect(syncResult.skipped).toBe(0);

      const expenses = await services.expenses.list();
      expect(expenses.length).toBe(1);
      expect(expenses[0]?.merchantName).toBe(potId);
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps Monzo insufficient permissions to MONZO_REAUTH_REQUIRED', async () => {
    const { services, dir } = setupService();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const started = await services.monzo.connectStart({ actor: 'test', channel: 'system' });
      const state = new URL(started.authUrl).searchParams.get('state');
      expect(state).toBeTruthy();

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'token-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              code: 'forbidden.insufficient_permissions',
              message: 'Access forbidden due to insufficient permissions',
            },
            403,
          ),
        );

      const callbackResult = await services.monzo.callback(
        {
          code: 'auth-code',
          state: state ?? undefined,
        },
        { actor: 'test', channel: 'system' },
      );
      expect(callbackResult.status).toBe('connected');

      await expect(services.monzo.syncNow({ actor: 'test', channel: 'system' })).rejects.toMatchObject({
        code: 'MONZO_REAUTH_REQUIRED',
        statusCode: 403,
      });
    } finally {
      closeServices(services);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
