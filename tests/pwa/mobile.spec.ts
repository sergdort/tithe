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
