# Stage 8.5 — Dashboard and manual reminders (implementation)

## Context
Stages 1–7 are built: templates → cases → recipient submission → review and rework. The requester still has two gaps:
- No way to see **what is blocking each case**. The dashboard shows only a status label.
- No way to **nudge the recipient** except "Resend invite", which re-sends generic invite copy that says nothing about what's missing or why something was sent back. The review form even says *"They aren't emailed until reminders ship"*.

Stage 8.5 (specified in CHECKLIST.md and product.md, 2026-09-16) closes both gaps without building Stage 8's pg-boss cadence engine. The goal is something that feels finished in front of a pilot customer: a dashboard that says who is holding up what, and a one-click reminder that names only what's still missing.

**Settled with the user:** the reminder is email only, uses fixed system copy, and takes an optional plain-text note. It is not a composer and has no MessageTemplate or @/# mentions.

## Design decisions (settle here, don't re-litigate while building)

| # | Decision | Why |
|---|---|---|
| 1 | **Claim → send → finalize.** Tx A locks the case row (`for('no key update')`, same as `syncCaseCompletion`), re-reads status through `tx`, checks eligibility and inserts a `delivery_attempt` with `status='queued'`, then commits. Outside any tx: mint the link, then send. Tx B marks the attempt `sent` or `failed` and, on success, inserts the dispatch rows. It audits in both cases. | The cooldown is actually enforced under concurrency: two claims serialize on the lock, and the second sees the first's queued row. No tx is held open across network IO (existing project rule). |
| 2 | **Cooldown counts only `queued`/`sent` reminder attempts** (not invites, not `failed`). `REMINDER_COOLDOWN_SECONDS` env, default 900. | A failed send can be retried immediately. A crashed claim expires on its own after the window. |
| 3 | **Add `failed` to `delivery_status`.** | SMTP rejection is not a bounce. The history must be honest. |
| 4 | **The reminder names only blocking items:** outstanding items that are `required` **or** `changes_requested`. Untouched optional items are left out. If none remain → `nothing_outstanding`. | "Reminded about only what remains" (product.md). Chasing optional items undermines trust in the reminders. |
| 5 | **Unopened vs stalled** = whether a `case.viewed` audit event exists for the case. Template refs are `case_reminder_unopened` / `case_reminder_stalled`, which Stage 8 reuses. | `markCaseViewed` writes exactly one of these, on the real first view only. |
| 6 | **Every reminder mints a fresh link** via `issueCaseAccess(…, 'resend')`. Earlier links keep working. | Only token hashes are stored. This is the same trade-off as "Resend invite". |
| 7 | **Link direction is `reminder_dispatch.delivery_attempt_id` → `delivery_attempt`.** Drop the unused `delivery_attempt.reminder_dispatch_id`. The note is stored on `delivery_attempt.note`. | One email covering N items = one attempt + N dispatch rows, which is also the shape Stage 8's job needs. This resolves both open questions from the spec. |
| 8 | **Invites write a `delivery_attempt` too** (`template_ref='case_invite'`, `sent` or `failed`). A failed invite shows as failed instead of "An invite was sent to…". | "Last contacted" includes the invite. It also fixes today's quiet lie: `case.invite_sent` is audited even when sending failed. |
| 9 | **One pure `reminderEligibility()`** drives both the server refusal and the UI's disabled-state message. | The UI and server can't disagree. It is unit-testable without a DB. |
| 10 | **Dashboard filters and sort are server-side** via `?filter=`. No client JS except a tiny `useFormStatus` submit button (pending state, blocks double clicks). | Keeps the project's minimal-client-JS stance while still feeling responsive. |

## 1. Schema — `src/db/schema/reminder.ts`, `enums.ts`

- `enums.ts`:
  - `deliveryStatus` gains `'failed'`.
  - New `reminderTrigger = pgEnum('reminder_trigger', ['scheduled','manual','conditional'])`.
- `reminderDispatch`:
  - `triggerType` notNull, default `'scheduled'`.
  - `reminderSequence` becomes nullable.
  - Nullable `deliveryAttemptId` FK → `deliveryAttempt.id` (cascade), indexed.
  - The unique index keeps its name and becomes `.where(sql\`trigger_type = 'scheduled'\`)`.
  - Add `check('reminder_dispatch_sequence_matches_trigger', sql\`(trigger_type = 'scheduled') = (reminder_sequence IS NOT NULL)\`)`.
  - Update the idempotency docstring.
- `deliveryAttempt`:
  - Drop `reminderDispatchId`.
  - Add `templateRef text notNull`, `sentByUserId text` → `user.id` (set null), `note text`, `error text`, `createdAt timestamptz notNull defaultNow`.
  - Index `(party_id, created_at)`.
  - Table order: define `deliveryAttempt` before `reminderDispatch`, or use `AnyPgColumn` for the FK.
- **Migration.** drizzle-kit prompts interactively when one table has both a dropped and an added column, so generate in two passes:
  1. Every add/alter, then `pnpm db:generate --name stage8_5_reminders`.
  2. Remove `reminderDispatchId`, then `pnpm db:generate --name stage8_5_drop_dispatch_link`.
  - Read both SQL files.
  - `ALTER TYPE … ADD VALUE` is fine inside the migrator's transaction because nothing uses `'failed'` in the same migration.
  - Both tables have zero rows (nothing writes them today), so the NOT NULL `template_ref` needs no backfill.
  - Then run `pnpm db:migrate`.

## 2. Domain

**`src/lib/domain/reminder.ts` (new)**
- **Pure:**
  - `selectReminderItems(outstanding: OutstandingForReminder[])` implements decision 4.
  - `reminderEligibility({ caseStatus, reminderItemCount, recipientEmail, lastReminderAt, now, cooldownMs })` returns `{ ok: true } | { ok: false, reason: 'complete'|'nothing_outstanding'|'no_email'|'cooldown', availableAt?: Date }`.
  - `normalizeReminderNote(raw)`: trims, turns empty into null, `ReminderNoteTooLongError` above 500 characters, normalizes CRLF.
- **Error classes** carry user-facing messages: `ReminderNotAllowedError` (with `reason`) and `ReminderNoteTooLongError`.
- `getCaseReminderPanel(workspaceId, caseId, now?)` returns:
  - `{ eligibility, items, recipientEmail, templateRef, history }`.
  - `history` is the last 20 `delivery_attempt` rows for the case's party, newest first, joined to `user.name` for the sender, each with a dispatch item count.
  - It reuses `loadCaseStatusInputs` once for both status and items. Refactor `listOutstandingForReminder` so the item mapping is a shared pure helper, `outstandingFromInputs(inputs)`, instead of duplicating it.
- `sendManualReminder({ workspaceId, userId, caseId, note, now? })`:
  - Follows decision 1.
  - The email renders with the recipient name, workspace name, requester name (`user.name`), case name, the due line (`case.dueAt`), the items with their reasons, the note, the link, and the link expiry.
  - Tx B audits `reminder.sent` or `reminder.send_failed` with metadata `{ deliveryAttemptId, templateRef, itemCount, recipient, hasNote, error? }`. It inserts dispatch rows `{ triggerType: 'manual', reminderSequence: null, reasonSnapshot, deliveryAttemptId }`.
  - Returns `{ status: 'sent'|'failed', recipient, itemCount, error? }`. It only throws the two refusal errors; a send failure is a returned status.
- `recordInviteDelivery(workspaceId, caseId, userId, { partyId, recipient, sent, providerMessageId, error })` is one tx: the `delivery_attempt` plus the existing `case.invite_sent` audit (now with `sent` and `error`). It **replaces** `recordInviteSent` in `case.ts`; delete the old one.

**`src/lib/domain/messages.ts`:** add `case_reminder_unopened` and `case_reminder_stalled`. Variables stay `Record<string,string>`; `reminder.ts` pre-formats the `items` block, `noteBlock`, and `dueLine` (empty string when absent). Copy, in plain text:
- Subject, unopened: `Reminder: ${workspace} is waiting on "${case}"`
- Subject, stalled: `Still needed for "${case}": ${n} item(s)`. The case name appears in both subjects, which the e2e Mailpit lookup relies on.
- Body:
  - A greeting, then one line that differs by variant: *"hasn't been started yet"* for unopened, *"Thanks for getting started — a few things are still needed"* for stalled.
  - The optional note block: `Message from ${requester}:` followed by the indented note.
  - `What's still needed:` with bullets. Changes-requested items get an indented `Changes requested: ${reason}` line.
  - The due line.
  - `Open your secure link — no account or password needed:` then the link.
  - The expiry line, plus *"Links from earlier emails still work."*

**`src/lib/domain/case.ts` `listCases`:** extend each row, with no extra per-case queries:
- `blockingItems`: `{ title, state }[]` from the already-loaded inputs, using `outstandingFromInputs`/`selectReminderItems`.
- `lastRecipientActivity`: `{ eventType, occurredAt } | null`, from one `selectDistinctOn([auditEvent.caseId])` over `actorType='party'` and `eventType in ('case.viewed','assignment.started','assignment.submitted')` for all case ids. Uses the existing `(case_id, occurred_at)` index.
- `lastContact`: the latest `delivery_attempt` of any kind.
- `lastReminderAt`: the latest reminder attempt that is queued or sent.
- Both of the last two come from one query each: join `party` on `party.case_id in ids`, `selectDistinctOn([party.caseId])`.
- `reminder`: the `reminderEligibility(...)` result.

**`src/lib/domain/dashboard.ts` (new, pure):**
- `DashboardFilter = 'all'|'needs_review'|'awaiting_recipient'|'complete'` and `parseDashboardFilter(raw)`.
- `filterCounts(rows)`.
- `sortForDashboard(rows)`: needs_review first (oldest recipient activity first); then awaiting_recipient (never-contacted first, then oldest `lastContact`); then complete (newest `completedAt` first).

**`src/lib/format-time.ts` (new, pure):**
- `formatRelative(date, now)`: "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then a short date.
- `daysOpen(createdAt, now)`.
- Uses `Intl.RelativeTimeFormat('en')`.

**`src/lib/env.ts`:** `REMINDER_COOLDOWN_SECONDS: z.coerce.number().default(900)`, plus `.env.example`.

## 3. Actions — `src/app/(app)/cases/actions.ts`

- `sendInviteAndStashLink` calls `recordInviteDelivery` with the real `sent`/`error`.
- New `sendReminderAction(formData)`:
  - Reads `caseId`, `note`, `returnTo` (`'case'|'dashboard'`, anything else → `'case'`) and `filter` (validated with `parseDashboardFilter`).
  - Same redirect discipline as `reissueAndRedirect`: record the outcome inside try/catch and call `redirect()` once afterwards.
  - Success → `/cases/{id}?notice=reminder_sent`, or `/dashboard?filter=…&notice=reminder_sent&caseId={id}`.
  - Refusal, note error, or `status:'failed'` → the same destination with `?error=`. For `failed`: *"The reminder couldn't be sent: {error}. Nothing was recorded as delivered — try again."*
  - `// Stage 11: can()` comment, as on the review actions.

## 4. UI

**New primitives:**
- **`src/components/ui/submit-button.tsx`** (`'use client'`): wraps `Button` and uses `useFormStatus` to set `disabled` and swap in `pendingLabel` ("Sending…").
- **`src/components/ui/filter-chip.tsx`**: an M3 filter chip rendered as a `Link`. It has an outlined 32px pill (`h-8 rounded-sm`), a selected state (`bg-md-secondary-container` plus a leading `MdCheck` so selection isn't color-only), `aria-current="page"` when selected, and a count. It uses the Button's state-layer pattern. This retires the "Chip — add when a real consumer needs it" gap.

**Dashboard — `src/app/(app)/dashboard/page.tsx`** (reads `searchParams` `filter`, `notice`, `caseId`, `error`):
- The header row stays: "Cases" and "New case".
- A `role="status"` notice ("Reminder sent for {case name}") or a `role="alert"` error, styled like the case page's existing error line.
- A filter chip row: All (n) · Needs your review (n) · Waiting on recipient (n) · Complete (n).
- **Case row**, an outlined `Card`, `relative`. The title is a `Link` with `after:absolute after:inset-0`, so the whole card is clickable without nesting the form inside a link. Content:
  1. **Line 1:** case name, with the status badge on the right. Keep the existing `summaryLabel` text ("0 of 1 accepted" / "Complete" / "Needs review · n").
  2. **Line 2:** template · recipient · `Open {n} days` · due date. The due date is `text-md-error` with "Overdue" when past and the case isn't complete.
  3. **Line 3, blocking:**
     - needs_review: `MdRateReview` "{n} item(s) need your review".
     - awaiting_recipient: `MdSchedule` "Waiting on {recipient} for {title}, {title} +{k} more".
     - A changes-requested item gets the suffix "(changes requested)".
     - complete: `MdCheckCircle` "Everything accepted".
  4. **Line 4, meta** (`text-body-small on-surface-variant`):
     - Activity: "Viewed/Started/Submitted an item {relative}", or "Recipient hasn't opened the link yet".
     - Contact: "Reminded {relative}", "Invite sent {relative}", or "Last email failed to send" in error color.
  5. **Action**, in a `relative z-10` form on the right: when eligible, a tonal `SubmitButton` "Send reminder" (`MdSend`) with hidden `caseId`/`returnTo=dashboard`/`filter`. During cooldown, the text "Reminded {relative}" instead. Nothing for other reasons.
- An empty state per filter (e.g. "Nothing needs your review right now.") and the existing no-cases card.
- Mobile: rows stack, and the action moves below the meta at small widths (`sm:` breakpoints).

**Case page — `src/app/(app)/cases/[caseId]/page.tsx`:**
- Loads `getCaseReminderPanel` in parallel with `getWorkspaceById`, and shows the `?notice=reminder_sent` status line.
- "Recipient access" card: if the latest invite attempt failed, show *"The invite email to {email} couldn't be sent. Resend invite to try again."*
- **New "Reminders" section** below it, `src/app/(app)/cases/[caseId]/reminder-panel.tsx`, a server component:
  - **Eligible:**
    - "Email {email} a reminder listing only what's still outstanding:"
    - A preview list of items with their state icon and any changes-requested reason.
    - A caption naming which variant goes out: "They haven't opened their link yet" / "They've opened their link".
    - `TextArea` "Add a note (optional)", `maxLength=500`, supportingText "Plain text. Appears above the list in the email."
    - A filled `SubmitButton` "Send reminder" / "Sending…".
  - **Not eligible:** an icon line per reason:
    - complete: "This case is complete — there's nothing to remind them about."
    - nothing_outstanding: "Nothing is waiting on the recipient. {n} item(s) need your review."
    - no_email: "This recipient has no email address, so reminders can't be sent."
    - cooldown: "Reminder sent {relative}. You can send another after {time}."
  - **History** ("Emails to recipient"):
    - The first 5 attempts, with the rest in a native `<details>` ("Show {n} earlier").
    - Each entry shows an icon and kind ("Reminder"/"Invite"), relative time with the absolute time in `title`, "by {sender}", "named {n} items", the note excerpt, and status. `failed` is shown in error color with its error.
- `review-controls.tsx` supportingText becomes: "Shown to the recipient on this item. Send a reminder to email it to them."

## 5. Tests

**Vitest:**
- **`src/lib/domain/__tests__/reminder.test.ts`**
  - Mock `@/lib/adapters/notify` with `vi.mock`, using a controllable fake that records `{subject, body}` and can throw.
  - Build fixtures with `seedRecipientFixture`, `recordAnswerSubmission`, `requestChanges` and `markCaseViewed`, following `review.test.ts`.
  - Pure tests:
    - every `reminderEligibility` branch, including the cooldown boundary;
    - `selectReminderItems` excluding untouched optional items and keeping changes-requested ones;
    - note normalization and the 500-character cap;
    - both renderers: only the listed items appear, the reason sits under its item, the note block appears only when set, and the case name is in the subject.
  - Integration tests:
    1. A send writes 1 attempt (`sent`, providerMessageId, sentByUserId, note) + N dispatch rows (`manual`, sequence null, `deliveryAttemptId`) + a `reminder.sent` audit.
    2. After `requestChanges`, the dispatch `reasonSnapshot` equals the reason and the email body contains it.
    3. Unopened → `case_reminder_unopened`; after `markCaseViewed` → `case_reminder_stalled`.
    4. A second send inside the cooldown throws `ReminderNotAllowedError('cooldown')` and adds no rows. Backdating the attempt's `created_at` past the window allows a send again.
    5. A notify throw → the attempt is `failed` with an error, 0 dispatch rows, a `reminder.send_failed` audit, and no cooldown (an immediate retry succeeds).
    6. A complete case, a case where only needs_review items remain, and a party with no email are each refused, with nothing written.
    7. `Promise.allSettled` of two concurrent sends → exactly one `sent` attempt and one cooldown refusal.
    8. DB constraints: two `scheduled` rows with the same (assignment, sequence) violate the unique index; two `manual` rows with null sequence are fine; a `scheduled` row with null sequence violates the check.
    9. `recordInviteDelivery` writes a `case_invite` attempt.
- **`src/lib/domain/__tests__/dashboard.test.ts`**:
  - Pure: sort order, filter counts, and `parseDashboardFilter` fallback.
  - Integration: `listCases` fills `lastRecipientActivity`, `lastContact`, `blockingItems` and `reminder` across two cases.
- **`src/lib/__tests__/format-time.test.ts`:** relative-time boundaries and `daysOpen`.

**Playwright — `e2e/stage8-5-reminders.spec.ts`:**
- Add `waitForMailpitMessage(request, subjectContains)` to `e2e/helpers.ts`. It polls `GET http://localhost:8025/api/v1/search?query=subject:"…"` and returns `GET /api/v1/message/{ID}`'s `Text`. Every test uses a `Date.now()`-suffixed case name, because all specs send to `recipient@example.com`.
- **Test 1, dashboard and unopened reminder with a note:**
  - After setup, the dashboard row shows "Waiting on … for Bank statement…", "Recipient hasn't opened the link yet", "Invite sent"; the chip "Waiting on recipient" shows 1; the "Needs your review" filter shows its empty state.
  - On the case page: the preview lists the items; fill in a note and send → the notice appears, history shows "Reminder" by "E2E Tester", and the panel shows the cooldown message instead of the button.
  - Mailpit: the body has the unopened line, every item title, and the note. The extracted `/r/` link opens the recipient page.
- **Test 2, stalled reminder carries the reason, sent from the dashboard:**
  - The recipient opens the link, answers the yes/no, and uploads.
  - The requester approves the upload and requests changes on the answer with a reason.
  - On the dashboard, the row shows "Waiting on … (changes requested)". Click "Send reminder" → the notice, then "Reminded just now".
  - Mailpit: stalled copy, the reason under "Any new loans?", "Bank statement" absent.
- **Test 3, needs-review case:** after the recipient submits everything, the dashboard row shows "{n} item(s) need your review" with no Send button, and the case page shows the nothing_outstanding message.
- **Update existing assertions** that the new chips would make ambiguous: scope `stage5` ("0 of 1 accepted") and `stage7` ('Complete' on the dashboard) to the case row, `page.locator('li', { hasText: caseName })`.

## 6. Docs (after everything is green)
- `plans/stage8-5.md`: replace the pasted doc-only plan with this implementation plan (repo convention, like `plans/stage7.md`).
- `CHECKLIST.md` Stage 8.5:
  - Tick the verified items.
  - Record decisions 1–10, especially the resolved link direction and note location (replace the "decide during the build" / "drop one link" lines).
  - Add real bugs found, if any, and new counts in the header.
  - Mark "Chip" as built.
- `product.md`: update "What it does not yet do" (dashboard and manual reminders now exist; automated cadence doesn't) and the status line.

## Verification
1. `docker compose up -d`, `pnpm db:migrate`, then `pnpm dev` running.
2. `pnpm typecheck && pnpm lint && pnpm test`.
3. `pnpm test:e2e`, with all specs green in parallel, including stages 4–7.
4. `pnpm build`.
5. Manual pass in a browser:
   - Dashboard at desktop and 360px width: chips, row layout, overdue colouring, the notice after a quick send.
   - Case page: the reminder panel in all four ineligible states plus eligible; the pending state on double click.
   - Mailpit web UI (localhost:8025): unopened vs stalled copy, note and reason rendering. This closes the CHECKLIST manual Mailpit item.
