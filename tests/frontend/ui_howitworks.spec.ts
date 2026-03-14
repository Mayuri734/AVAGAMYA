import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://avagamya.vercel.app/');
  await page.getByRole('link', { name: 'How it Works' }).click();
  await expect(page.locator('div').nth(4)).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.relative').first().click();
  await page.locator('div').filter({ hasText: /^avagamya\.ai\/analyze$/ }).nth(1).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.locator('.shrink-0.w-10.h-10.rounded-full.flex.items-center.justify-center.bg-vibrant-orange\\/10').click();
  await page.locator('.p-6.rounded-2xl.border-2.bg-white.shadow-lg.transition-all.border-vibrant-orange').click();
  await page.locator('div:nth-child(4) > .p-6 > .flex.gap-4 > .shrink-0').click();
});