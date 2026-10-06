import { expect, type Page } from '@playwright/test';

/**
 * Shared setup for every recipient-facing e2e spec: sign up a fresh
 * requester, build and publish a template with the given requirements,
 * and instantiate a case from it. Extracted from
 * stage6-recipient.spec.ts (Stage 7) once stage7-review.spec.ts needed
 * the identical flow with a different requirement mix (an acknowledgement,
 * for the auto-accept case).
 */

export interface RequirementSpec {
  title: string;
  actionType: 'upload' | 'answer' | 'acknowledge';
  answerFieldType?: 'short_text' | 'long_text' | 'date' | 'choice' | 'yes_no';
}

export interface CaseSetupResult {
  link: string;
  caseUrl: string;
}

const DEFAULT_REQUIREMENTS: RequirementSpec[] = [
  { title: 'Bank statement', actionType: 'upload' },
  { title: 'Any new loans?', actionType: 'answer', answerFieldType: 'yes_no' },
  { title: 'Effective date', actionType: 'answer', answerFieldType: 'date' },
];

export async function setupCaseForRecipientTests(
  page: Page,
  emailPrefix: string,
  options: { templateName?: string; caseName?: string; requirements?: RequirementSpec[] } = {},
): Promise<CaseSetupResult> {
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const password = 'correcthorsebatterystaple';
  const templateName = options.templateName ?? `${emailPrefix} Template`;
  const caseName = options.caseName ?? `${emailPrefix} Case`;
  const requirements = options.requirements ?? DEFAULT_REQUIREMENTS;

  await page.goto('/sign-up');
  await page.fill('#name', 'E2E Tester');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.fill('#workspaceName', `${emailPrefix} Workspace`);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  await page.goto('/templates/new');
  await page.fill('#name', templateName);

  for (const [index, req] of requirements.entries()) {
    const n = index + 1;
    if (n > 1) await page.click('button:has-text("Add requirement")');
    await page.getByLabel(`Requirement ${n} title`).fill(req.title);

    if (req.actionType !== 'upload') {
      await page
        .getByRole('radiogroup', { name: `Requirement ${n} action type` })
        .getByRole('radio', { name: req.actionType === 'answer' ? 'Answer' : 'Acknowledge' })
        .click();
    }
    if (req.actionType === 'answer' && req.answerFieldType) {
      // `.last()`: every "Answer" row adds another "Answer type" select,
      // so this is always the one just added, last in DOM order —
      // correct whether it's the first such row or the third.
      await page.getByLabel('Answer type').last().selectOption(req.answerFieldType);
    }
  }

  await page.click('button:has-text("Create template")');
  await page.waitForURL(/\/templates\/[^/]+$/);
  await page.click('button:has-text("Publish")');
  // Publish is a server action, not a URL change — without waiting for
  // its actual completion here, the very next line's page.goto() can
  // fire before the publish request finishes, occasionally cancelling it
  // in flight. That leaves the template stuck in `draft`, and /cases/new
  // never lists it (only published templates appear there), so the
  // eventual selectOption() below hangs until its own timeout — a real,
  // intermittent bug in this shared setup found while writing Stage 7's
  // e2e spec (it isn't specific to any one downstream test).
  await expect(page.getByText('Published', { exact: true })).toBeVisible();

  await page.goto('/cases/new');
  await page.selectOption('#templateId', { label: templateName });
  await page.fill('#name', caseName);
  await page.fill('#displayName', `${emailPrefix} Recipient`);
  await page.fill('#email', 'recipient@example.com');
  await page.click('button:has-text("Create case")');
  await page.waitForURL(/\/cases\/[^/]+$/);

  // The recipient's magic link is revealed via a signed flash cookie
  // (Stage 6), not a `?newToken=` query param — it never touches the URL
  // or browser history.
  const linkText = await page.locator('code').textContent();
  if (!linkText) throw new Error('Recipient link not found on the case page.');
  const caseUrl = new URL(page.url()).origin + new URL(page.url()).pathname;

  return { link: linkText.trim(), caseUrl };
}
