import { test, expect } from '@playwright/test';
import { setupCaseForRecipientTests } from './helpers';

/**
 * Stage 7 verification (plans/stage7.md + CHECKLIST.md) — the rework
 * loop. Journey 2 from the master plan (plan-1a.md), minus the reminder
 * half, which is Stage 8: submit → request changes with a reason →
 * reason shown on that one item only → resubmit → both versions linked
 * in history.
 */
test.describe('Stage 7 — review and the rework loop', () => {
  test('approve one item, request changes on another, resubmit, approve again — the case completes', async ({
    page,
  }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage7-rework', {
      templateName: 'Stage 7 Rework Template',
      caseName: 'Stage 7 Rework Case',
      requirements: [
        { title: 'Bank statement', actionType: 'upload' },
        { title: 'Any new loans?', actionType: 'answer', answerFieldType: 'yes_no' },
      ],
    });

    // Recipient: answer + upload.
    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);

    const loanItem = recipientPage.locator('li', { hasText: 'Any new loans?' });
    await loanItem.getByRole('radio', { name: 'Yes' }).click();
    await loanItem.getByRole('button', { name: 'Save answer' }).click();
    await recipientPage.waitForLoadState('networkidle');

    const uploadItem = recipientPage.locator('li', { hasText: 'Bank statement' });
    await uploadItem.locator('input[type=file]').setInputFiles({
      name: 'statement-v1.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 v1'),
    });
    await expect(recipientPage.locator('a', { hasText: 'statement-v1.pdf' })).toBeAttached({ timeout: 15_000 });

    // Requester: both items need a decision. Values and the file are visible.
    await page.goto(caseUrl);
    const loanCard = page.locator('li', { hasText: 'Any new loans?' });
    const uploadCard = page.locator('li', { hasText: 'Bank statement' });
    await expect(loanCard.getByText('Needs review')).toBeVisible();
    await expect(loanCard.getByText('Yes')).toBeVisible();
    await expect(uploadCard.getByText('Needs review')).toBeVisible();
    const fileLinkV1 = uploadCard.getByRole('link', { name: 'statement-v1.pdf' });
    await expect(fileLinkV1).toBeVisible();

    // The file link actually downloads (ACL chokepoint 1's route), with
    // its real filename via Content-Disposition rather than the opaque
    // signed-token path segment.
    const [download] = await Promise.all([page.waitForEvent('download'), fileLinkV1.click()]);
    expect(download.url()).toContain('/api/download/');
    expect(download.suggestedFilename()).toBe('statement-v1.pdf');

    // Approve the answer. The server action redirects back to this same
    // URL, so `page.waitForURL(caseUrl)` would resolve immediately
    // without ever waiting for the round trip — wait for the actual
    // state change instead (the Approve button disappearing once the
    // item is accepted).
    await loanCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(loanCard.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

    // Request changes on the upload, with a reason.
    const uploadCardForRequest = page.locator('li', { hasText: 'Bank statement' });
    await uploadCardForRequest.locator('summary', { hasText: 'Request changes' }).click();
    await uploadCardForRequest
      .getByLabel('What needs to change?')
      .fill('Wrong month — please upload the latest statement.');
    await uploadCardForRequest.getByRole('button', { name: 'Send request' }).click();
    await expect(uploadCardForRequest.getByText('Changes requested', { exact: true })).toBeVisible();

    // Recipient: the reason shows on the upload ONLY; the answer sits
    // under Completed as Approved, untouched.
    await recipientPage.reload();
    const outstandingUpload = recipientPage.locator('li', { hasText: 'Bank statement' });
    await expect(outstandingUpload.getByText('Changes requested:')).toBeVisible();
    await expect(outstandingUpload.getByText('Wrong month')).toBeVisible();
    await recipientPage.click('summary:has-text("Completed")');
    const completedLoan = recipientPage.locator('li', { hasText: 'Any new loans?' });
    await expect(completedLoan.getByText('Approved')).toBeVisible();

    // Recipient: re-uploads.
    await outstandingUpload.locator('input[type=file]').setInputFiles({
      name: 'statement-v2.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 v2'),
    });
    await expect(recipientPage.locator('a', { hasText: 'statement-v2.pdf' })).toBeAttached({ timeout: 15_000 });

    // Requester: v2 needs review; "Earlier versions (1)" holds v1 and its reason.
    await page.goto(caseUrl);
    const uploadCardAfter = page.locator('li', { hasText: 'Bank statement' });
    await expect(uploadCardAfter.getByText('Needs review')).toBeVisible();
    await expect(uploadCardAfter.getByRole('link', { name: 'statement-v2.pdf' })).toBeVisible();
    await uploadCardAfter.locator('summary', { hasText: 'Earlier versions (1)' }).click();
    await expect(uploadCardAfter.getByRole('link', { name: 'statement-v1.pdf' })).toBeVisible();
    await expect(uploadCardAfter.getByText('Wrong month')).toBeVisible();

    // Approve the resubmission — both items are now accepted.
    await uploadCardAfter.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('Complete', { exact: true })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('Complete', { exact: true })).toBeVisible();
  });

  test('reopening an approved item takes the case out of Complete, and the recipient sees it outstanding again', async ({
    page,
  }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage7-reopen', {
      templateName: 'Stage 7 Reopen Template',
      caseName: 'Stage 7 Reopen Case',
      requirements: [{ title: 'Bank statement', actionType: 'upload' }],
    });

    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);
    await recipientPage.locator('input[type=file]').setInputFiles({
      name: 'statement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 reopen test'),
    });
    await expect(recipientPage.locator('a', { hasText: 'statement.pdf' })).toBeAttached({ timeout: 15_000 });

    // The server action redirects back to this same URL, so
    // `page.waitForURL(caseUrl)` would resolve immediately without ever
    // waiting for the round trip — the auto-retrying `expect` below
    // waits for the actual state change instead.
    await page.goto(caseUrl);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('Complete', { exact: true })).toBeVisible();

    // Reopen it.
    await page.locator('summary', { hasText: 'Reopen' }).click();
    await page.getByLabel('What needs to change?').fill('Please confirm the account number is visible.');
    await page.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByText('Complete', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Waiting on recipient')).toBeVisible();

    await recipientPage.reload();
    await expect(recipientPage.getByRole('heading', { name: /Outstanding/ })).toBeVisible();
    await expect(recipientPage.getByText('Changes requested:')).toBeVisible();
  });

  test('the request-changes reason is required — bypassing client validation still gets rejected server-side', async ({
    page,
  }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage7-reason', {
      templateName: 'Stage 7 Reason Template',
      caseName: 'Stage 7 Reason Case',
      requirements: [{ title: 'Bank statement', actionType: 'upload' }],
    });

    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);
    await recipientPage.locator('input[type=file]').setInputFiles({
      name: 'statement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 reason test'),
    });
    await expect(recipientPage.locator('a', { hasText: 'statement.pdf' })).toBeAttached({ timeout: 15_000 });

    await page.goto(caseUrl);
    await page.locator('summary', { hasText: 'Request changes' }).click();
    const reasonField = page.getByLabel('What needs to change?');
    await reasonField.evaluate((el) => el.removeAttribute('required'));
    await page.getByRole('button', { name: 'Send request' }).click();

    await page.waitForURL(/\?error=/);
    await expect(page.getByText(/describe what needs to change/i)).toBeVisible();

    // Nothing changed server-side — still needs review, not reopened.
    // Scoped to the requirement's own <li>: the page's status summary
    // also says "Needs review", which would otherwise be a strict-mode
    // violation (multiple matches).
    await expect(page.locator('li', { hasText: 'Bank statement' }).getByText('Needs review')).toBeVisible();
  });

  test('an acknowledgement is auto-accepted, with no review controls', async ({ page }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage7-ack', {
      templateName: 'Stage 7 Acknowledge Template',
      caseName: 'Stage 7 Acknowledge Case',
      requirements: [{ title: 'Policy acknowledgement', actionType: 'acknowledge' }],
    });

    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);
    await recipientPage.getByRole('button', { name: 'I acknowledge this' }).click();
    await recipientPage.waitForLoadState('networkidle');

    await page.goto(caseUrl);
    await expect(page.getByText('Received', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.locator('summary', { hasText: 'Request changes' })).toHaveCount(0);
    await expect(page.locator('summary', { hasText: 'Reopen' })).toHaveCount(0);
    await expect(page.getByText('Complete', { exact: true })).toBeVisible();
  });
});
