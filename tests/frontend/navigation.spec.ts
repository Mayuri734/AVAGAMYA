import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByText('HomeAboutHow it WorksFAQs').click();
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('link', { name: 'About' }).click();
  await page.getByRole('link', { name: 'How it Works' }).click();
  await page.getByRole('link', { name: 'FAQs' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('link', { name: 'AVAGAMYA AVAGAMYA' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('button', { name: 'Data Protection Officer' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.locator('div').filter({ hasText: 'Compliance Officer' }).nth(5).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.locator('div').filter({ hasText: 'External Auditor' }).nth(5).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('link', { name: 'AVAGAMYA AVAGAMYA' }).click();

});