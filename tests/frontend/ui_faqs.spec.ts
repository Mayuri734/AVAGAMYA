import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByRole('link', { name: 'FAQs' }).click();
  await expect(page.locator('section').first()).toBeVisible();
  await page.getByRole('button', { name: 'Is my personal data safe?' }).click();
  await page.getByRole('button', { name: 'What types of documents can I' }).click();
  await page.getByRole('button', { name: 'Contact Support →' }).click();
});