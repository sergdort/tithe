import { expect, test } from '@playwright/test';

test('home screen renders mobile navigation without horizontal overflow', async ({ page }) => {
  await page.goto('/');

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewport = page.viewportSize();

  expect(viewport).not.toBeNull();
  expect(width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
});

test('expenses list avatar prefers logo, then emoji, then initials', async ({ page }) => {
  await page.route('**/v1/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Groceries',
            kind: 'expense',
            icon: 'shopping_cart',
            color: '#2E7D32',
            isSystem: false,
            archivedAt: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        meta: {},
      }),
    });
  });

  await page.route('**/v1/expenses?limit=100', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: 'exp-logo',
            occurredAt: '2026-02-05T10:00:00.000Z',
            postedAt: '2026-02-05T11:00:00.000Z',
            money: { amountMinor: 1525, currency: 'GBP' },
            categoryId: '11111111-1111-1111-1111-111111111111',
            source: 'monzo_import',
            merchantName: 'Marks and Spencer',
            merchantLogoUrl: 'https://img.test/logo-ok.svg',
            merchantEmoji: '🛍️',
            note: null,
            externalRef: 'tx_logo',
            commitmentInstanceId: null,
            createdAt: '2026-02-05T10:00:00.000Z',
            updatedAt: '2026-02-05T10:00:00.000Z',
          },
          {
            id: 'exp-emoji',
            occurredAt: '2026-02-05T09:00:00.000Z',
            postedAt: '2026-02-05T10:00:00.000Z',
            money: { amountMinor: 510, currency: 'GBP' },
            categoryId: '11111111-1111-1111-1111-111111111111',
            source: 'monzo_import',
            merchantName: 'The De Beauvoir Deli Co.',
            merchantLogoUrl: 'https://img.test/logo-broken.svg',
            merchantEmoji: '🍞',
            note: null,
            externalRef: 'tx_emoji',
            commitmentInstanceId: null,
            createdAt: '2026-02-05T09:00:00.000Z',
            updatedAt: '2026-02-05T09:00:00.000Z',
          },
          {
            id: 'exp-initials',
            occurredAt: '2026-02-05T08:00:00.000Z',
            postedAt: '2026-02-05T09:00:00.000Z',
            money: { amountMinor: 900, currency: 'GBP' },
            categoryId: '11111111-1111-1111-1111-111111111111',
            source: 'manual',
            merchantName: 'Microsoft',
            merchantLogoUrl: null,
            merchantEmoji: null,
            note: null,
            externalRef: null,
            commitmentInstanceId: null,
            createdAt: '2026-02-05T08:00:00.000Z',
            updatedAt: '2026-02-05T08:00:00.000Z',
          },
        ],
        meta: {},
      }),
    });
  });

  await page.route('https://img.test/logo-ok.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0057B8"/></svg>',
    });
  });

  await page.route('https://img.test/logo-broken.svg', async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });

  await page.goto('/expenses');

  const logoRow = page.locator('[data-expense-id="exp-logo"]');
  const emojiRow = page.locator('[data-expense-id="exp-emoji"]');
  const initialsRow = page.locator('[data-expense-id="exp-initials"]');

  await expect(logoRow.locator('[data-avatar-kind="logo"]')).toBeVisible();
  await expect(logoRow.locator('img[alt="Marks and Spencer logo"]')).toBeVisible();

  await expect(emojiRow.locator('[data-testid="expense-avatar-exp-emoji"]')).toHaveAttribute(
    'data-avatar-kind',
    'emoji',
  );
  await expect(emojiRow.locator('[data-testid="expense-avatar-exp-emoji"]')).toContainText('🍞');

  await expect(initialsRow.locator('[data-testid="expense-avatar-exp-initials"]')).toHaveAttribute(
    'data-avatar-kind',
    'initials',
  );
  await expect(initialsRow.locator('[data-testid="expense-avatar-exp-initials"]')).toContainText('MI');
});

test('home shows monthly ledger and transfer direction in add transaction flow', async ({ page }) => {
  await page.route('**/v1/reports/monthly-ledger*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          month: '2026-02',
          range: {
            from: '2026-02-01T00:00:00.000Z',
            to: '2026-03-01T00:00:00.000Z',
          },
          totals: {
            incomeMinor: 300000,
            expenseMinor: 125000,
            transferInMinor: 5000,
            transferOutMinor: 20000,
            operatingSurplusMinor: 175000,
            netCashMovementMinor: 160000,
            txCount: 6,
          },
          sections: {
            income: [
              {
                categoryId: '22222222-2222-2222-2222-222222222222',
                categoryName: 'Salary',
                totalMinor: 300000,
                txCount: 1,
              },
            ],
            expense: [
              {
                categoryId: '11111111-1111-1111-1111-111111111111',
                categoryName: 'Sports',
                totalMinor: 125000,
                txCount: 2,
              },
            ],
            transfer: [
              {
                categoryId: '33333333-3333-3333-3333-333333333333',
                categoryName: 'ISA',
                direction: 'out',
                totalMinor: 20000,
                txCount: 1,
              },
            ],
          },
        },
        meta: {},
      }),
    });
  });

  await page.route('**/v1/commitment-instances?status=pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: {} }),
    });
  });

  await page.route('**/v1/commitments', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: {} }),
    });
  });

  await page.route('**/v1/categories', async (route) => {
    if (route.request().method() === 'POST') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Sports',
            kind: 'expense',
            icon: 'sports_soccer',
            color: '#2E7D32',
            isSystem: false,
            archivedAt: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Football reimbursements',
            kind: 'income',
            icon: 'payments',
            color: '#2E7D32',
            isSystem: false,
            archivedAt: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'ISA',
            kind: 'transfer',
            icon: 'savings',
            color: '#1976D2',
            isSystem: false,
            archivedAt: null,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        meta: {},
      }),
    });
  });

  await page.route('**/v1/integrations/monzo/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          status: 'disconnected',
          mode: 'developer_api_expenses_only',
          configured: false,
          connected: false,
          accountId: null,
          lastSyncAt: null,
          lastCursor: null,
          mappingCount: 0,
          lastError: null,
        },
        meta: {},
      }),
    });
  });

  await page.route('**/v1/expenses', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          occurredAt: '2026-02-10T12:00:00.000Z',
          postedAt: null,
          money: { amountMinor: 1000, currency: 'GBP' },
          categoryId: '33333333-3333-3333-3333-333333333333',
          source: 'manual',
          transferDirection: 'out',
          merchantName: 'ISA top-up',
          merchantLogoUrl: null,
          merchantEmoji: null,
          note: null,
          externalRef: null,
          commitmentInstanceId: null,
          createdAt: '2026-02-10T12:00:00.000Z',
          updatedAt: '2026-02-10T12:00:00.000Z',
        },
        meta: {},
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('Monthly cashflow ledger (actual transactions only)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync month' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  await expect(page.getByText('Operating Surplus')).toBeVisible();
  await expect(page.getByText('Net Cash Movement')).toBeVisible();

  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('Type').click();
  await page.getByRole('option', { name: 'Transfer' }).click();

  await expect(page.getByLabel('Direction')).toBeVisible();
});

test('monthly ledger sync posts current month range with overwrite and shows result summary', async ({
  page,
}) => {
  let ledgerRequestRange: { from: string; to: string } | null = null;
  let syncRequestBody: unknown = null;

  await page.route('**/v1/reports/monthly-ledger*', async (route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get('from') ?? '2026-02-01T00:00:00.000Z';
    const to = url.searchParams.get('to') ?? '2026-03-01T00:00:00.000Z';
    ledgerRequestRange = { from, to };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          month: '2026-02',
          range: { from, to },
          totals: {
            incomeMinor: 0,
            expenseMinor: 0,
            transferInMinor: 0,
            transferOutMinor: 0,
            operatingSurplusMinor: 0,
            netCashMovementMinor: 0,
            txCount: 0,
          },
          sections: {
            income: [],
            expense: [],
            transfer: [],
          },
        },
        meta: {},
      }),
    });
  });

  await page.route('**/v1/commitment-instances?status=pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: {} }),
    });
  });

  await page.route('**/v1/commitments', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: {} }),
    });
  });

  await page.route('**/v1/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: {} }),
    });
  });

  await page.route('**/v1/integrations/monzo/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          status: 'connected',
          mode: 'developer_api_expenses_only',
          configured: true,
          connected: true,
          accountId: 'acc_main',
          lastSyncAt: null,
          lastCursor: null,
          mappingCount: 1,
          lastError: null,
        },
        meta: {},
      }),
    });
  });

  await page.route('**/v1/integrations/monzo/sync', async (route) => {
    syncRequestBody = route.request().postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          status: 'ok',
          message: 'Monzo sync completed',
          imported: 2,
          updated: 1,
          skipped: 3,
          accountId: 'acc_main',
          from: ledgerRequestRange?.from ?? '2026-02-01T00:00:00.000Z',
          to: ledgerRequestRange?.to ?? '2026-03-01T00:00:00.000Z',
          cursor: '2026-02-20T12:00:00.000Z',
        },
        meta: {},
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Sync month' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sync month' }).click();

  await expect(page.getByText('Imported 2, updated 1, skipped 3.')).toBeVisible();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByText('Imported 2, updated 1, skipped 3.')).toHaveCount(0);
  expect(ledgerRequestRange).not.toBeNull();
  if (!ledgerRequestRange) {
    throw new Error('Expected monthly ledger request range to be captured');
  }
  const range = ledgerRequestRange as unknown as { from: string; to: string };
  expect(syncRequestBody).toEqual({
    from: range.from,
    to: range.to,
    overrideExisting: true,
  });
});
