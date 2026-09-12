import { test, expect } from '@playwright/test';
import { setupCaseForRecipientTests } from './helpers';

/**
 * Stage 6 verification (plans/stage6.md + CHECKLIST.md). Builds a case
 * with one upload requirement and two answer requirements (yes_no,
 * date), then exercises the recipient page end to end. Setup extracted
 * into ./helpers.ts (Stage 7) once stage7-review.spec.ts needed the same
 * flow with a different requirement mix.
 */
test.describe('Stage 6 — recipient page', () => {
  test('mail scanner: a plain GET leaves every assignment pending; a real browser opening the link is recorded as viewed', async ({
    page,
    request,
  }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage6-scanner');

    // Simulate a corporate mail scanner: the `request` fixture has its
    // own cookie jar (independent of `page`'s) and never executes
    // JavaScript — an accurate model of what a scanner actually is.
    // Scanners routinely pre-fetch the same link more than once.
    await request.get(link, { maxRedirects: 10 });
    await request.get(link, { maxRedirects: 10 });

    await page.goto(caseUrl);
    await expect(page.getByText('Pending')).toHaveCount(3);
    await expect(page.getByText('Viewed')).toHaveCount(0);

    // Now a real browser (JS execution on) opens the same link — the
    // client-side beacon fires this time.
    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);
    await recipientPage.waitForLoadState('networkidle');
    await recipientPage.close();

    await page.goto(caseUrl);
    await expect(page.getByText('Viewed').first()).toBeVisible();
  });

  test('happy path: a yes/no answer, a date answer, and an upload all move into Completed', async ({
    page,
  }) => {
    const { link, caseUrl } = await setupCaseForRecipientTests(page, 'stage6-happy');

    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);
    await expect(recipientPage.getByRole('heading', { name: /Outstanding/ })).toBeVisible();

    const loanItem = recipientPage.locator('li', { hasText: 'Any new loans?' });
    await loanItem.getByRole('radio', { name: 'Yes' }).click();
    await loanItem.getByRole('button', { name: 'Save answer' }).click();
    await recipientPage.waitForLoadState('networkidle');

    const dateItem = recipientPage.locator('li', { hasText: 'Effective date' });
    await dateItem.getByLabel('Your answer').fill('2026-03-15');
    await dateItem.getByRole('button', { name: 'Save answer' }).click();
    await recipientPage.waitForLoadState('networkidle');

    const uploadItem = recipientPage.locator('li', { hasText: 'Bank statement' });
    await uploadItem.locator('input[type=file]').setInputFiles({
      name: 'statement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 stage 6 test fixture'),
    });
    // confirmUploadAction's revalidatePath + router.refresh() move the item
    // straight from Outstanding into Completed once confirmed — there's no
    // lasting "uploaded" message in the Outstanding section to wait for,
    // since that whole subtree unmounts as part of the refresh. The
    // Completed section is a native <details> (closed by default), so its
    // content exists in the DOM but stays hidden until expanded — wait for
    // attachment first (proves the refresh landed), then expand, then
    // check visibility.
    const downloadLink = recipientPage.locator('a', { hasText: 'statement.pdf' });
    await expect(downloadLink).toBeAttached({ timeout: 15_000 });

    await expect(recipientPage.getByText('Everything is submitted. Thank you.')).toBeVisible();
    await recipientPage.click('summary:has-text("Completed")');
    await expect(downloadLink).toBeVisible();
    await expect(recipientPage.getByText('Yes')).toBeVisible();

    // Stage 7: a submitted item now shows as "Needs review" on the
    // requester page (a real review decision is required before it
    // counts as accepted) rather than the old bare "Submitted" fulfilment
    // label. Scoped to the requirement cards (each its own <li>) because
    // the page's own status summary line can also say "Needs review".
    await page.goto(caseUrl);
    await expect(page.locator('li').filter({ hasText: 'Needs review' })).toHaveCount(3);
  });

  test('resumability: a draft answer survives a reload and a fresh session', async ({ page }) => {
    const { link } = await setupCaseForRecipientTests(page, 'stage6-resume');

    const recipientPage = await page.context().newPage();
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);

    const dateItem = recipientPage.locator('li', { hasText: 'Effective date' });
    const dateInput = dateItem.getByLabel('Your answer');
    await dateInput.fill('2026-05-01');
    await dateInput.blur(); // -> saveAnswerDraftAction
    await recipientPage.waitForTimeout(500);

    await recipientPage.reload();
    await expect(
      recipientPage.locator('li', { hasText: 'Effective date' }).getByLabel('Your answer'),
    ).toHaveValue('2026-05-01');

    // A fresh session (a new page reopening the original magic link, minting
    // a brand-new recipient cookie) still sees the server-persisted draft.
    const freshPage = await page.context().newPage();
    await freshPage.goto(link);
    await freshPage.waitForURL(/\/r\/c\//);
    await expect(
      freshPage.locator('li', { hasText: 'Effective date' }).getByLabel('Your answer'),
    ).toHaveValue('2026-05-01');
  });

  test('renders at 360px with no horizontal overflow and 48px touch targets', async ({ page }) => {
    const { link } = await setupCaseForRecipientTests(page, 'stage6-mobile');

    const recipientPage = await page.context().newPage();
    await recipientPage.setViewportSize({ width: 360, height: 740 });
    await recipientPage.goto(link);
    await recipientPage.waitForURL(/\/r\/c\//);

    const scrollWidth = await recipientPage.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(360);

    const saveButton = recipientPage.getByRole('button', { name: 'Save answer' }).first();
    const box = await saveButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('an unresolvable link redirects to /r/expired, never a bare 404', async ({ page }) => {
    await page.goto('/r/this-token-does-not-exist-00000000000000000000000000000000000000000');
    await expect(page).toHaveURL(/\/r\/expired/);
    await expect(page.getByRole('heading', { name: 'Link not available' })).toBeVisible();
  });
});
