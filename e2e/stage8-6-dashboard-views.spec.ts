import { expect, test, type Page } from '@playwright/test';
import { createAnotherCase, setupCaseForRecipientTests } from './helpers';

/**
 * Stage 8.6 — the dashboard's data table (default) and list views, and the
 * per-browser memory of which one you were using.
 */

async function setupTwoCases(page: Page, prefix: string) {
  const stamp = Date.now();
  const templateName = `${prefix} Close ${stamp}`;
  const alpha = `${prefix} Alpha ${stamp}`;
  const beta = `${prefix} Beta ${stamp}`;
  const setup = await setupCaseForRecipientTests(page, prefix, { templateName, caseName: alpha });
  await createAnotherCase(page, { templateName, caseName: beta, recipientName: 'Beta Owner' });
  return { ...setup, alpha, beta };
}

function casesTable(page: Page) {
  return page.getByRole('table', { name: 'Cases' });
}

function caseRow(page: Page, caseName: string) {
  return casesTable(page).getByRole('row').filter({ hasText: caseName });
}

test.describe('Stage 8.6 — dashboard views', () => {
  test('the data table is the default; search, status filter, sort, and hidden columns work and persist', async ({ page }) => {
    const { alpha, beta } = await setupTwoCases(page, 'table');

    await page.goto('/dashboard');
    await expect(page.getByRole('radio', { name: 'Table' })).toHaveAttribute('aria-checked', 'true');
    await expect(caseRow(page, alpha)).toBeVisible();
    await expect(caseRow(page, beta)).toBeVisible();
    await expect(caseRow(page, alpha)).toContainText('0 of 3 accepted');
    await expect(page.getByText('Showing 1–2 of 2 cases')).toBeVisible();

    // Search narrows the rows, lands in the URL, and survives a reload.
    await page.getByRole('searchbox', { name: 'Search cases, recipients, or templates' }).fill('Beta Owner');
    await expect(caseRow(page, alpha)).toHaveCount(0);
    await expect(caseRow(page, beta)).toBeVisible();
    await expect(page).toHaveURL(/[?&]q=Beta\+Owner/);
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Search cases, recipients, or templates' })).toHaveValue('Beta Owner');
    await expect(caseRow(page, alpha)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(caseRow(page, alpha)).toBeVisible();

    // A status with no matching cases shows the empty state, with a way back.
    await page.getByRole('button', { name: 'Filter by status' }).click();
    await page.getByRole('checkbox', { name: /Complete/ }).check();
    await page.keyboard.press('Escape');
    await expect(page.getByText('No cases match these filters.')).toBeVisible();
    await expect(page).toHaveURL(/[?&]status=complete/);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(caseRow(page, alpha)).toBeVisible();

    // Sorting by case name, descending, puts Beta first.
    await casesTable(page).getByRole('button', { name: 'Case', exact: true }).click();
    await casesTable(page).getByRole('button', { name: 'Case', exact: true }).click();
    await expect(casesTable(page).getByRole('columnheader', { name: 'Case' })).toHaveAttribute('aria-sort', 'descending');
    await expect(casesTable(page).getByRole('row').nth(1)).toContainText(beta);

    // Hiding a column is remembered by this browser.
    await expect(casesTable(page).getByRole('columnheader', { name: 'Recipient' })).toBeVisible();
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('checkbox', { name: 'Recipient' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(casesTable(page).getByRole('columnheader', { name: 'Recipient' })).toHaveCount(0);
    await page.goto('/dashboard');
    await expect(caseRow(page, alpha)).toBeVisible();
    await expect(casesTable(page).getByRole('columnheader', { name: 'Recipient' })).toHaveCount(0);
  });

  test('the chosen view is remembered across reloads and a sign-out/sign-in', async ({ page }) => {
    const { alpha, email, password } = await setupTwoCases(page, 'views');

    await page.goto('/dashboard');
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(page.getByRole('heading', { name: /Waiting on recipient/ })).toBeVisible();
    await expect(casesTable(page)).toHaveCount(0);
    // The refined list names every outstanding item, not just the first.
    const alphaCard = page.getByRole('listitem').filter({ hasText: alpha });
    await expect(alphaCard).toContainText('Bank statement');
    await expect(alphaCard).toContainText('Any new loans?');
    await expect(alphaCard).toContainText('Effective date');

    await page.reload();
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: /Waiting on recipient/ })).toBeVisible();

    await page.click('button:has-text("Sign out")');
    await page.waitForURL('**/sign-in');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: /Waiting on recipient/ })).toBeVisible();

    await page.getByRole('radio', { name: 'Table' }).click();
    await expect(caseRow(page, alpha)).toBeVisible();
    await page.reload();
    await expect(caseRow(page, alpha)).toBeVisible();
  });

  test('the list view has the same search and filters, shared with the table', async ({ page }) => {
    const { alpha, beta } = await setupTwoCases(page, 'listfilters');
    const search = page.getByRole('searchbox', { name: 'Search cases, recipients, or templates' });
    const card = (name: string) => page.getByRole('listitem').filter({ hasText: name });

    await page.goto('/dashboard');
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(card(alpha)).toBeVisible();

    // Search narrows the list and lands in the URL.
    await search.fill('Beta Owner');
    await expect(card(alpha)).toHaveCount(0);
    await expect(card(beta)).toBeVisible();
    await expect(page).toHaveURL(/[?&]q=Beta\+Owner/);

    // Switching views keeps the search in both directions.
    await page.getByRole('radio', { name: 'Table' }).click();
    await expect(search).toHaveValue('Beta Owner');
    await expect(caseRow(page, alpha)).toHaveCount(0);
    await expect(caseRow(page, beta)).toBeVisible();
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(card(beta)).toBeVisible();

    // A status with no matches empties the list, with a way back.
    await page.getByRole('button', { name: 'Filter by status' }).click();
    await page.getByRole('checkbox', { name: /Complete/ }).check();
    await page.keyboard.press('Escape');
    await expect(page.getByText('No cases match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(search).toHaveValue('');
    await expect(card(alpha)).toBeVisible();
    await expect(card(beta)).toBeVisible();
  });

  test('selecting cases and sending reminders in bulk', async ({ page }) => {
    const { alpha, beta } = await setupTwoCases(page, 'bulk');

    await page.goto('/dashboard');
    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).check();
    await expect(page.getByRole('status').filter({ hasText: '2 cases selected' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Select ${alpha}` })).toBeChecked();

    await page.getByRole('button', { name: 'Send reminder to 2' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Sent 2 reminders.' })).toBeVisible();

    // Both rows now show the reminder, the selection is gone, and neither can be reminded again during the cooldown.
    await expect(caseRow(page, alpha)).toContainText('Reminded');
    await expect(caseRow(page, beta)).toContainText('Reminded');
    await expect(page.getByText('2 cases selected')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Send reminder for ${alpha}` })).toHaveCount(0);

    // Selecting them again explains why nothing can be sent.
    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).check();
    await expect(page.getByRole('button', { name: 'Send reminders' })).toBeDisabled();
    await expect(page.getByText("2 can't be reminded right now")).toBeVisible();
  });
});
