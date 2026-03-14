import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByRole('link', { name: 'About' }).click();
  await page.locator('section').filter({ hasText: 'Our MissionDECODING THE FINE' }).click();
  await page.getByRole('heading', { name: 'DECODING THE FINE PRINT.' }).click();
  await page.getByText('Banking shouldn\'t require a').click();
  await page.getByText('The WhyUnderstanding the').click();
});