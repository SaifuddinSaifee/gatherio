import { test, expect } from '@playwright/test';

/**
 * Stage 4 verification (see the plan's Stage 4 "Verification" list):
 * sign-up creates a workspace and lands on the dashboard, route
 * protection redirects unauthenticated visits, sign-in/sign-out work,
 * and a wrong password fails without a 500.
 */
test('sign-up, route protection, sign-in, sign-out, and wrong-password all work', async ({
  page,
}) => {
  const email = `stage4-e2e-${Date.now()}@example.com`;
  const password = 'correcthorsebatterystaple';

  await page.goto('/sign-up');
  await page.fill('#name', 'Saif E2E Test');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#workspaceName', 'E2E Test Workspace');
  await page.click('button[type=submit]');

  await page.waitForURL('**/dashboard');
  await expect(page.locator('h1')).toHaveText('Cases');
  await expect(page.getByTestId('workspace-name')).toHaveText('E2E Test Workspace · owner');

  await page.click('button:has-text("Sign out")');
  await page.waitForURL('**/sign-in');

  await page.goto('/dashboard');
  await page.waitForURL('**/sign-in');

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  await page.click('button:has-text("Sign out")');
  await page.waitForURL('**/sign-in');

  await page.fill('#email', email);
  await page.fill('#password', 'the-wrong-password');
  await page.click('button[type=submit]');
  await page.waitForURL('**/sign-in?error=*');
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
});
