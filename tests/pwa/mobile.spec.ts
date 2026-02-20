import { expect, test } from '@playwright/test';

test('home screen renders mobile navigation without horizontal overflow', async ({ page }) => {
  await page.goto('/');

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewport = page.viewportSize();

  expect(viewport).not.toBeNull();
  expect(width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
});
