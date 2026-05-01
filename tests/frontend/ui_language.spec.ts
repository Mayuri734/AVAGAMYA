import { test, expect } from '@playwright/test';

test('Language selection should show multiple language options', async ({ page }) => {
  await page.goto('/analyze/language');
  await expect(page.getByRole('heading', { name: 'Select Your Language' })).toBeVisible();
  await expect(page.getByText('English')).toBeVisible();
  await expect(page.getByText('हिंदी (Hindi)')).toBeVisible();
  await expect(page.getByText('मराठी (Marathi)')).toBeVisible();
});
