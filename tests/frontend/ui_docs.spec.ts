import { test, expect } from '@playwright/test';

test('Docs page should load and show main sections', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.getByRole('heading', { name: 'Technical Documentation' })).toBeVisible();
  await expect(page.getByText('High-Risk Analysis')).toBeVisible();
  await expect(page.getByText('Real-Time Telemetry')).toBeVisible();
});
