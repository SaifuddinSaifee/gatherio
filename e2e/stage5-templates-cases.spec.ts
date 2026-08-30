import { test, expect } from '@playwright/test';

/**
 * Stage 5 verification (plan-1a.md Stage 5 + CHECKLIST.md): a template can
 * be built and published, a case snapshots its requirements and issues a
 * one-time recipient link, and — the stage's one non-negotiable — editing
 * a template after a case already exists does not alter that case's
 * already-snapshotted requirements.
 */
test('template lifecycle: draft, add requirements, publish, instantiate a case, edit after does not affect the live case', async ({
  page,
}) => {
  const email = `stage5-e2e-${Date.now()}@example.com`;
  const password = 'correcthorsebatterystaple';

  await page.goto('/sign-up');
  await page.fill('#name', 'Stage 5 Tester');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#workspaceName', 'Stage 5 Workspace');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  // Create a template.
  await page.goto('/templates/new');
  await page.fill('#name', 'Vendor Onboarding');
  await page.click('button:has-text("Create template")');
  await page.waitForURL(/\/templates\/[^/]+$/);

  // Add two requirements.
  await page.fill('#title', 'Insurance certificate');
  await page.selectOption('#actionType', 'upload');
  await page.click('button:has-text("Add requirement")');
  await expect(page.getByText('Insurance certificate')).toBeVisible();

  await page.fill('#title', 'Any new subcontractors?');
  await page.selectOption('#actionType', 'answer');
  await page.selectOption('#answerFieldType', 'yes_no');
  await page.click('button:has-text("Add requirement")');
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();

  // Publish. Draft-only controls (Edit links, Add-requirement form) must disappear.
  await page.click('button:has-text("Publish")');
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByText('This version is published and immutable.')).toBeVisible();
  await expect(page.locator('a:has-text("Edit")')).toHaveCount(0);

  const templateUrl = page.url();

  // Instantiate a case from the published template.
  await page.goto('/cases/new');
  await page.selectOption('#templateId', { label: 'Vendor Onboarding' });
  await page.fill('#name', 'Acme Corp Onboarding');
  await page.fill('#displayName', 'Acme Corp');
  await page.fill('#email', 'vendor@acme.example');
  await page.click('button:has-text("Create case")');
  await page.waitForURL(/\/cases\/[^/]+\?newToken=/);

  // One-time recipient link is shown, and points at /r/<token>.
  const linkCode = page.locator('code');
  await expect(linkCode).toContainText('/r/');
  const caseUrl = new URL(page.url()).origin + new URL(page.url()).pathname;

  // The two snapshotted requirements are visible with a real fulfilment status.
  await expect(page.getByText('Insurance certificate')).toBeVisible();
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();
  await expect(page.getByText('Pending').first()).toBeVisible();

  // Dashboard reflects the new case, unsubmitted.
  await page.goto('/dashboard');
  await expect(page.getByText('Acme Corp Onboarding')).toBeVisible();
  await expect(page.getByText('0 of 2 submitted')).toBeVisible();

  // Now edit the template: create a new draft version and delete one requirement from it.
  await page.goto(templateUrl);
  await page.click('button:has-text("Create new draft version")');
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await page.locator('a:has-text("Edit")').first().click();
  await page.click('button:has-text("Delete requirement")');
  await page.waitForURL(templateUrl);

  // The draft version's first requirement ("Insurance certificate") is
  // gone, but the second one survives untouched.
  await expect(page.getByText('Insurance certificate')).toHaveCount(0);
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();

  // ...but the already-instantiated case is completely unaffected: both
  // of its snapshotted requirements are still present. This is the
  // Stage 5 non-negotiable: template_version is immutable once a case
  // references it, and a case's requirement rows are its own copies, not
  // live references back to requirement_definition.
  await page.goto(caseUrl);
  await expect(page.getByText('Insurance certificate')).toBeVisible();
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();
});
