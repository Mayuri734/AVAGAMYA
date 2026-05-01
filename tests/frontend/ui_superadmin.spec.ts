import { test, expect } from '@playwright/test';

test('SuperAdmin login page should show secure login interface', async ({ page }) => {
  await page.goto('/superadmin/login');
  await expect(page.getByRole('heading', { name: 'SuperAdmin Console' })).toBeVisible();
  await expect(page.getByPlaceholder('Admin Username')).toBeVisible();
  await expect(page.getByPlaceholder('Access Key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify Identity' })).toBeVisible();
});
