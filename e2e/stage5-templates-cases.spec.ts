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

  // Create a template — name plus its first requirements are one action
  // now (no intermediate "name only" template ever gets persisted).
  await page.goto('/templates/new');
  await page.fill('#name', 'Vendor Onboarding');

  // First row: title only, action type defaults to Upload.
  await page.getByLabel('Requirement 1 title').fill('Insurance certificate');

  // Add a second row and make it an Answer-type requirement via the
  // segmented Action type control — the Answer type select should only
  // appear once Answer is selected.
  await page.click('button:has-text("Add requirement")');
  await page.getByLabel('Requirement 2 title').fill('Any new subcontractors?');
  await expect(page.getByLabel('Answer type')).toHaveCount(0);
  await page
    .getByRole('radiogroup', { name: 'Requirement 2 action type' })
    .getByRole('radio', { name: 'Answer' })
    .click();
  await expect(page.getByLabel('Answer type')).toBeVisible();
  await page.getByLabel('Answer type').selectOption('yes_no');

  // The Required control is a Material switch (role="switch"), not a
  // checkbox — toggle the second row off and confirm the toggle actually
  // reaches the server: an unrequired requirement should render "(optional)"
  // on the template detail page after creation.
  const requiredSwitch = page.getByRole('switch', { name: 'Requirement 2 required' });
  await expect(requiredSwitch).toHaveAttribute('aria-checked', 'true');
  await requiredSwitch.click();
  await expect(requiredSwitch).toHaveAttribute('aria-checked', 'false');

  await page.click('button:has-text("Create template")');
  await page.waitForURL(/\/templates\/[^/]+$/);
  await expect(page.getByText('Insurance certificate')).toBeVisible();
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();
  await expect(page.getByText('(optional)', { exact: true })).toBeVisible();

  // Publish. Draft-only controls (per-requirement Edit links) must
  // disappear — "Edit template" (owner-only, not draft-gated) is
  // matched with an exact name so it doesn't get swept up here.
  await page.click('button:has-text("Publish")');
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByText('This version is published and immutable.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);

  const templateUrl = page.url();

  // Instantiate a case from the published template.
  await page.goto('/cases/new');
  await page.selectOption('#templateId', { label: 'Vendor Onboarding' });
  await page.fill('#name', 'Acme Corp Onboarding');
  await page.fill('#displayName', 'Acme Corp');
  await page.fill('#email', 'vendor@acme.example');
  await page.click('button:has-text("Create case")');
  await page.waitForURL(/\/cases\/[^/]+$/);

  // The recipient's magic link is revealed via a signed flash cookie
  // (Stage 6), not a `?newToken=` query param — it never touches the URL
  // or browser history. It's shown once, and points at /r/<token>.
  const linkCode = page.locator('code');
  await expect(linkCode).toContainText('/r/');
  const caseUrl = new URL(page.url()).origin + new URL(page.url()).pathname;

  // The two snapshotted requirements are visible with a real fulfilment status.
  await expect(page.getByText('Insurance certificate')).toBeVisible();
  await expect(page.getByText('Any new subcontractors?')).toBeVisible();
  await expect(page.getByText('Pending').first()).toBeVisible();

  // Dashboard reflects the new case, unsubmitted. Stage 7: the summary
  // counts required items only — "Any new subcontractors?" was toggled
  // optional above, so the denominator is 1, not 2.
  await page.goto('/dashboard');
  await expect(page.getByText('Acme Corp Onboarding')).toBeVisible();
  await expect(page.getByText('0 of 1 accepted')).toBeVisible();

  // Now edit the template: create a new draft version and delete one requirement from it.
  await page.goto(templateUrl);
  await page.click('button:has-text("Create new draft version")');
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).first().click();
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

/**
 * The new-template page's two most recent, explicitly-requested behaviors:
 * a template with zero requirements is never persisted (removing the only
 * row and submitting must fail client-side, not create an empty template),
 * and rows can be reordered without a mouse (the up/down buttons exercise
 * the same reorder logic the drag handle uses).
 */
test('new-template form rejects zero requirements and supports keyboard reordering', async ({
  page,
}) => {
  const email = `stage5-e2e-builder-${Date.now()}@example.com`;
  const password = 'correcthorsebatterystaple';

  await page.goto('/sign-up');
  await page.fill('#name', 'Builder Tester');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#workspaceName', 'Builder Workspace');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  await page.goto('/templates/new');
  await page.fill('#name', 'Empty Attempt');
  await page.getByRole('button', { name: 'Remove requirement 1' }).click();
  await page.click('button:has-text("Create template")');
  await expect(page.locator('p[role="alert"]')).toContainText('at least one requirement');
  expect(page.url()).toContain('/templates/new');

  await page.click('button:has-text("Add requirement")');
  await page.click('button:has-text("Add requirement")');
  await page.getByLabel('Requirement 1 title').fill('First');
  await page.getByLabel('Requirement 2 title').fill('Second');

  await page.getByRole('button', { name: 'Move requirement 1 down' }).click();
  await expect(page.getByLabel('Requirement 1 title')).toHaveValue('Second');
  await expect(page.getByLabel('Requirement 2 title')).toHaveValue('First');
});
