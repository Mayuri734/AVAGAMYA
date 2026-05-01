import { test, expect } from '@playwright/test';

test('SuperAdmin login page should show secure login interface', async ({ page }) => {
  await page.goto('/superadmin/login');
  await expect(page.getByRole('heading', { name: 'Super Admin Console' })).toBeVisible();
  await expect(page.getByPlaceholder('Admin Email')).toBeVisible();
  await expect(page.getByPlaceholder('Master Key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter Console' })).toBeVisible();
});
