import { test, expect } from '@playwright/test';

test.describe('AVAGAMYA Integration Testing', () => {
  
  test('Static Page Navigation', async ({ page }) => {
    await page.goto('/');
    // Home.tsx text
    await expect(page.getByText(/Decoding the fine print/i)).toBeVisible();

    // Use getByRole for more robust link clicking
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.getByRole('heading', { name: /DECODING THE FINE PRINT/i })).toBeVisible();

    await page.getByRole('link', { name: 'How it Works' }).click();
    await expect(page).toHaveURL(/\/how-it-works/);
    await expect(page.getByRole('heading', { name: /How AVAGAMYA Works/i })).toBeVisible();

    await page.getByRole('link', { name: 'FAQs' }).click();
    await expect(page).toHaveURL(/\/faqs/);
    await expect(page.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeVisible();
  });

  test('Language Selection Flow', async ({ page }) => {
    await page.goto('/analyze/language');
    // LanguageSelection.tsx
    await expect(page.getByRole('heading', { name: /Choose your language/i })).toBeVisible();

    // Select Hindi - searching for the label text inside the button
    await page.click('button:has-text("Hindi")');
    await page.click('button:has-text("Continue")');
    
    await expect(page).toHaveURL(/\/analyze\/upload/);
    await expect(page.getByRole('heading', { name: /Upload your document/i })).toBeVisible();
  });

  test('Security Gate UI - PII Blocking', async ({ page }) => {
    // Mock the backend PII rejection
    await page.route('**/analyze/upload*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: "BLOCKED",
          pii_result: "BLOCKED",
          message: "Security Alert: Personal details detected.",
          meta: { total_scanned: 0, high_risk_found: 0 },
          high_risk_clauses: []
        })
      });
    });

    await page.goto('/analyze/language');
    await page.click('button:has-text("English")');
    await page.click('button:has-text("Continue")');
    
    await expect(page).toHaveURL(/\/analyze\/upload/);
    
    // Simulate File Upload
    await page.setInputFiles('input[type="file"]', {
      name: 'pii_test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%TEST PII CONTENT\n%%EOF')
    });

    // Click Upload button
    await page.click('button:has-text("Upload")');

    // SecurityAlertModal.tsx has <h2>Security Alert</h2>
    await expect(page.locator('h2')).toContainText(/Security Alert/i);
    // Updated to match the mocked message: "Security Alert: Personal details detected."
    await expect(page.getByText(/Personal details detected/i)).toBeVisible({ timeout: 10000 });
  });

  test('Staff Login Access', async ({ page }) => {
    // DPOLogin.tsx: <h2>DPO Access Portal</h2>
    await page.goto('/staff/dpo/login');
    await expect(page.getByRole('heading', { name: /DPO Access Portal/i })).toBeVisible();
    
    // ComplianceLogin.tsx: <h2>Compliance Portal</h2>
    await page.goto('/staff/compliance/login');
    await expect(page.getByRole('heading', { name: /Compliance Portal/i })).toBeVisible();

    // AuditorLogin.tsx: <h2>Auditor Control</h2>
    await page.goto('/staff/auditor/login');
    await expect(page.getByRole('heading', { name: /Auditor Control/i })).toBeVisible();
  });

});
