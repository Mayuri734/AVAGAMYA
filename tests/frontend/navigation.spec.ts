import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByText('HomeAboutHow it WorksFAQs').click();
  await page.getByRole('link', { name: 'Home' }).click();
  await page.getByRole('link', { name: 'About' }).click();
  await page.getByRole('link', { name: 'How it Works' }).click();
  await page.getByRole('link', { name: 'FAQs' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('link', { name: 'AVAGAMYA AVAGAMYA' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('heading', { name: 'Compliance Officer' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('heading', { name: 'External Auditor' }).click();
  await page.getByRole('link', { name: 'Staff Access' }).click();
  await page.getByRole('link', { name: 'AVAGAMYA AVAGAMYA' }).click();

});