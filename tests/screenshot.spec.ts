import { test, expect } from '@playwright/test';
import * as path from 'path';

test('capture dashboard screenshot', async ({ page }) => {
  // Go to the dashboard
  await page.goto('http://localhost:3000');

  // Wait for the stats to load (this indicates JS has run and data is fetched)
  await page.waitForSelector('#stats');
  await expect(page.locator('#stats')).toContainText('Found 2 cross-project leaks'); // 2 because shared code and package.json? Wait, JSON said 2 items in cross_project_leakage list.

  // Wait a bit for animations or layout to settle if any
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'drydock-dashboard.png', fullPage: true });
});
