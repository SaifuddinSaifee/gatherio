import { test, expect, chromium } from '@playwright/test';

/**
 * Two independent sign-ups must never see each other's workspace name —
 * an end-to-end spot-check of Stage 2's tenant isolation, not just the
 * ESLint rule that guards it statically.
 */
test('a second user cannot resolve the first user\'s workspace', async () => {
  const browserA = await chromium.launch();
  const browserB = await chromium.launch();
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  const emailA = `stage4-iso-a-${Date.now()}@example.com`;
  const emailB = `stage4-iso-b-${Date.now()}@example.com`;
  const password = 'correcthorsebatterystaple';

  await pageA.goto('http://localhost:3000/sign-up');
  await pageA.fill('#name', 'User A');
  await pageA.fill('#email', emailA);
  await pageA.fill('#password', password);
  await pageA.fill('#workspaceName', 'Workspace A Only');
  await pageA.click('button[type=submit]');
  await pageA.waitForURL('**/dashboard');
  await expect(pageA.getByTestId('workspace-name')).toHaveText('Workspace A Only · owner');

  await pageB.goto('http://localhost:3000/sign-up');
  await pageB.fill('#name', 'User B');
  await pageB.fill('#email', emailB);
  await pageB.fill('#password', password);
  await pageB.fill('#workspaceName', 'Workspace B Only');
  await pageB.click('button[type=submit]');
  await pageB.waitForURL('**/dashboard');
  await expect(pageB.getByTestId('workspace-name')).toHaveText('Workspace B Only · owner');
  await expect(pageB.getByTestId('workspace-name')).not.toHaveText('Workspace A Only · owner');

  await browserA.close();
  await browserB.close();
});
