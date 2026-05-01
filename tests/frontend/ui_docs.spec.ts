import { test, expect } from '@playwright/test';

test('Docs page should load and show main sections', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: 'API Documentation' })).toBeVisible();
  await expect(page.getByText('Compliance Audit Engine')).toBeVisible();
  await expect(page.getByText('DPO Telemetry System')).toBeVisible();
});
