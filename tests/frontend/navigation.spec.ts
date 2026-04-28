import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  // Bypass OTP Auth Flow for UI Testing
  await page.goto('/staff/modules');
  await page.getByRole('heading', { name: 'Compliance Officer' }).click();
  await page.goto('/staff/modules');
  await page.getByRole('heading', { name: 'External Auditor' }).click();
  await page.goto('/staff/modules');

});