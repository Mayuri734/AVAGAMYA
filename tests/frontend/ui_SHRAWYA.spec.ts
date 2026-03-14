import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByText('SHRAWYA').click();
  await page.getByRole('button').nth(2).click();
  await page.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Got it!' }).click();
  await page.getByText('SHRAWYA').click();
  await page.getByRole('button').first().click();
});