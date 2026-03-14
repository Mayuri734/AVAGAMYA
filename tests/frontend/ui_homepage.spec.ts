import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByText('AVAGAMYAHomeAboutHow it').click();
  await page.getByRole('link', { name: 'AVAGAMYA AVAGAMYA' }).click();
  await page.getByRole('heading', { name: 'Don\'t Sign What You Don\'t' }).click();
  await expect(page.getByRole('link', { name: 'Start Free Analysis' })).toBeVisible();
});