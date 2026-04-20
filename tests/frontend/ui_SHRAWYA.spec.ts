import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');

  // Click SHRAWYA safely
  await page.getByText('SHRAWYA').click();

  // ❌ REMOVE nth() → replace with real button names (IMPORTANT)
  // Example (update names based on your UI)
  const buttons = page.getByRole('button');

  await buttons.nth(2).waitFor({ state: 'visible' });
  await buttons.nth(2).click();

  await buttons.nth(1).waitFor({ state: 'visible' });
  await buttons.nth(1).click();

  // ✅ FIXED "Got it!" button (MAIN ISSUE)
  const gotItBtn = page.getByRole('button', { name: 'Got it!' });

  await expect(gotItBtn).toBeVisible();
  await expect(gotItBtn).toBeEnabled();
  await gotItBtn.click();

  // Continue flow
  await page.getByText('SHRAWYA').click();

  const firstBtn = page.getByRole('button').first();
  await expect(firstBtn).toBeVisible();
  await firstBtn.click();
});