import { test, expect } from '@playwright/test';

test('capture dashboard and inspector screenshots', async ({ page }) => {
  // Go to the dashboard
  await page.goto('http://localhost:3000');

  // Wait for the stats to load
  await expect(page.locator('#stats')).toBeVisible();

  // Wait a bit for layout to settle
  await page.waitForTimeout(1000);

  // Take dashboard screenshot
  await page.screenshot({ path: 'drydock-dashboard.png', fullPage: true });

  // Click Inspect Code on the first leakage item
  const inspectButton = page.getByText('Inspect Code').first();
  await inspectButton.click();

  // Wait for modal to appear and content to load
  await expect(page.locator('#inspector-modal')).toBeVisible();
  // Ensure content is loaded (not showing "Loading code...")
  await expect(page.locator('#inspector-content')).not.toHaveText('Loading code...');

  // Wait a bit for code to render
  await page.waitForTimeout(1000);

  // Take inspector screenshot
  await page.screenshot({ path: 'drydock-inspector.png', fullPage: true });
});
