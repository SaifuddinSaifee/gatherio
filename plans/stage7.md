# Stage 7 — Review and the rework loop

## Context

Stage 6 made submissions real. Nothing happens after one: the requester's case page shows only a fulfilment label per requirement, and **nothing in `src/` writes a `review` row**. The recipient page already displays `changes_requested`, a state no code can produce. Review is the loop the product exists to close (product.md §3.5) and structural differentiator #2: *rejection with a reason reopens exactly one obligation and drives the next reminder for that item only.*

Five latent Stage 6 problems surface the moment reviews exist, and they are fixed here:

1. `supersedes_submission_id` is never set and has no FK (`src/db/schema/submission.ts:38`).
2. Nothing stops resubmission. `recordAnswerSubmission` and `reserveSubmissionVersion` never check `fulfilmentStatus`, so an approved item can be silently replaced. The test at `submission.test.ts:180` relies on this.
3. Orphan upload reservations become "latest". `getRecipientView` takes `max(version_number)` (`recipient-view.ts:88-98`), so an abandoned upload hides the changes-requested reason.
4. `saveDraftAnswer` has a lost-update race. It reads unlocked and writes back the status it read (`submission.ts:95,106`), which can reopen an item a requester just approved.
5. `finalizeUpload`'s lookup (`submission.ts:315-329`) never checks `partyId`.

**Outcome:** the requester sees exactly what was submitted, approves one item and requests changes on another with a reason. The recipient sees that reason on that item only; everything else is byte-for-byte untouched. The recipient resubmits, and the requester sees v2 with v1 and its reason in history, approves, and the case is marked complete. An approval made by mistake can be reopened.

## Settled product decisions (user)

- **Review scope:** uploads, answers and "doesn't apply" declarations need review. **Acknowledgements are auto-accepted.**
- **No recipient email on request-changes in Stage 7.** Stage 8's reminder carries the reason; Stage 7 only does the data plumbing.
- **Decisions are reversible:** approved → reopen, and changes requested → approve as-is. The latest review wins.

## Design decisions (do not re-litigate during implementation)

| # | Decision | Why |
|---|---|---|
| 1 | A `review` row is an **insert-only decision**. "Unreviewed" is derived: the latest completed version has no review. | No row mutation, and no NULL-`reviewed_at` ordering bug. |
| 2 | **Many reviews per version, latest wins** by a new `review_number`: `max+1`, read *after* the assignment lock, unique with `submission_version_id`. Reviews happen **only on the latest completed version**. | `now()` is transaction-start time, so a reviewer blocked on the lock can commit later with an earlier timestamp. The counter doubles as the optimistic-concurrency token (#9). |
| 3 | **Request changes sets `fulfilment_status → 'in_progress'`; approve sets it to `'submitted'` and clears `draftValue`.** Both happen in the review's transaction. | This is the concrete "reopens exactly one". The existing `submitted` counts, the reserve status check and Stage 8's `all_submitted` all become correct for free. |
| 4 | **"Latest" = latest *completed* version** (it has a `file_asset` or `submission_answer`) on every read path, defined once as an `isCompletedVersion` SQL fragment. | Orphan reservations become invisible everywhere, and the recipient and requester sides cannot disagree. |
| 5 | **Recipient writes need an open assignment** (`pending`/`viewed`/`in_progress`), checked under the row lock in `recordAnswerSubmission`, `reserveSubmissionVersion`, `saveDraftAnswer` and `finalizeUpload`. | Closed items (awaiting review or approved) can't be overwritten. Only a requester reopen unlocks them. |
| 6 | **`supersedes_submission_id` is set when a version becomes completed:** at insert for answers, and inside `finalizeUpload`'s locked transaction for uploads (the reserved row is a reservation, not a submission, until that transaction commits). It is never changed afterwards. Adds a self-FK with `ON DELETE SET NULL`. | This makes the chain linear by construction, with no "stale reservation" rejection path. Reword the CHECKLIST line "set at insert" to match. |
| 7 | Acknowledgements are auto-accepted, keyed on the **stored answer's `fieldType === 'acknowledge'`**, not on `actionType`. | An optional acknowledgement item can be declared N/A, and that declaration should be reviewed. |
| 8 | Case status is a **pure derivation**. `case.completed_at` is a stamp synced **set and clear** in-transaction, audited `case.completed` / `case.reopened`. | Reversal and late optional submissions make completion non-monotonic. |
| 9 | Review forms post `submissionVersionId` + `expectedReviewNumber`. **One `ReviewConflictError`** covers stale version, number mismatch and a no-op decision ("This item changed since you loaded the page"). | Handles two tabs or two reviewers without separate error types. |
| 10 | **No new role check.** The review actions (ACL chokepoint 5) and the requester download route (chokepoint 1) get a `// Stage 11: can()` comment, not a meaningless `requireRole(session,'member')`. | Contributors review by default (roles-and-tenancy.md). `require_separate_reviewer` arrives in Stage 11. |

## Transaction and locking rules (these prevent deadlocks and lost updates)

1. Every write transaction **locks the assignment first**, using `.for('no key update', { of: schema.assignment })`. Change `findCaseAssignmentForUpdate` (`submission.ts:461`) to this form so it stops locking the joined `requirement` row.
2. `syncCaseCompletion` is the **last call** in its transaction. It takes the case row with `.for('no key update', { of: schema.caseTable })` **before reading anything**. Never use `FOR UPDATE`: every `withAudit` insert takes `KEY SHARE` on `case` via its FK (`schema/audit.ts:18`), and `FOR UPDATE` conflicts with `KEY SHARE`, which would deadlock a concurrent recipient submit against a requester review.
3. Every helper called inside a transaction reads **through `tx`**, never `s.db`, which is a different pooled connection (`scoped.ts:34`) and can't see uncommitted rows. Type executors as `Database | Tx`, export `Tx` from `src/db/audit.ts`, and delete the duplicate at `submission.ts:14`. `import type { Database }` is lint-safe.
4. Never call a function that opens its own transaction from inside another transaction's callback. `discardReservedSubmission` becomes `discardReservedSubmissionTx(tx, …)`.

## 1. Migration `drizzle/0003_*.sql` (`src/db/schema/submission.ts`)

- **`review`:**
  - Add `reviewNumber integer NOT NULL`.
  - Make `reviewedAt` `NOT NULL DEFAULT now()`.
  - **Drop the `'unreviewed'` default** on `review_status`, so a forgotten status fails loudly.
  - Replace `review_submission_version_id_idx` with UNIQUE `(submission_version_id, review_number)`.
  - Add `check('review_status_decision', sql\`review_status IN ('approved','changes_requested','rejected')\`)`.
  - Add `check('review_reason_required', sql\`review_status = 'approved' OR (reason IS NOT NULL AND btrim(reason) <> '')\`)`.
  - `check` is exported from `drizzle-orm/pg-core` 0.45.
- **`submissionVersion.supersedesSubmissionId`:** `.references((): AnyPgColumn => submissionVersion.id, { onDelete: 'set null' })`. Use a `foreignKey({ name })` if the generated name exceeds 63 characters.
- Confirm `SELECT count(*) FROM review` = 0 before migrating (nothing writes it). No backfill.
- No `case.overall_status` column. Decision 8 derives it instead.

## 2. Domain layer

**`src/lib/domain/submission-history.ts` (new)**
- `isCompletedVersion`: the shared SQL fragment.
- `latestCompletedVersion(ex, ws, assignmentId)`.
- `loadAssignmentHistory(ex, ws, assignmentId)` → completed versions newest first, each `{ submissionVersion, fileAsset, answer, reviews (by review_number desc), latestReview }`.

**`src/lib/domain/case-status.ts` (new)**
- **Pure `deriveItemState({ fulfilmentStatus, latestKind, latestReviewStatus })`.** Rules in order:
  1. `waived`/`cancelled` → that state.
  2. Latest review `changes_requested` → `changes_requested`.
  3. No completed version, or fulfilment open → `awaiting_recipient`.
  4. `approved` → `accepted`; `rejected` → `rejected` (unreachable, fails closed).
  5. `latestKind === 'acknowledge'` → `accepted`.
  6. Else `needs_review`.
- **Pure `deriveCaseStatus(items)` → `{ status: 'complete' | 'needs_review' | 'awaiting_recipient', counts }`.**
  - An item *blocks* if it is `needs_review`/`changes_requested`/`rejected` (any item), or if it is required and `awaiting_recipient`.
  - Counts use **required items as the denominator**: "3 of 5 accepted".
- **`loadCaseStatusInputs(ex, ws, caseIds[])`:** 3 queries regardless of case count.
  - Query 1: assignments ⋈ requirements.
  - Query 2: `selectDistinctOn([sv.assignmentId])` over versions LEFT JOIN `file_asset` / `submission_answer`, filtered by `isCompletedVersion`, `orderBy(asc(assignmentId), desc(versionNumber))`, with `answerKind` from `value->>'fieldType'`.
  - Query 3: `selectDistinctOn([review.submissionVersionId])` `orderBy(asc(svId), desc(reviewNumber))`, including `id` and `reason`.
  - Apply `scoped(ws).where` on each root table, early-return on empty id lists, and stitch the results together with Maps. The Plan-agent sketch is the template.
- **`syncCaseCompletion(tx, ws, caseId, actor, trigger)`:** lock the case (rule 2), load, derive, then set or clear `completed_at` and audit.
- **`listOutstandingForReminder(ws, caseId)`:** about 20 lines on the loader. Returns the recipient's-move items `{ assignmentId, requirementId, title, required, state, reason, reviewId }`, where the reason is present only for `changes_requested`. Stage 8 snapshots this into `reminder_dispatch.reason_snapshot`.

**`src/lib/domain/review.ts` (new):** `approveSubmission` / `requestChanges(ws, { caseId, submissionVersionId, expectedReviewNumber, reviewerUserId, ipAddress, userAgent, reason? })`. One transaction each:
1. Resolve version ⋈ assignment ⋈ requirement with `caseId` in the WHERE (the cross-case check), locked `no key update of assignment`.
2. Then check, in a fresh statement:
   - the version is the latest completed one;
   - it is not an acknowledgement;
   - `max(review_number) === expectedReviewNumber`;
   - the new status differs from the latest review's.

   Any failure throws `ReviewConflictError`, except the acknowledgement case, which throws `ReviewNotRequiredError`.
3. For request changes, trim the reason: it must be 1–1000 characters, else `InvalidReasonError`.
4. Insert the review, set fulfilment (and clear the draft on approve), `withAudit`, then `syncCaseCompletion` last.

**`src/lib/domain/submission.ts` (changes)**
- `recordAnswerSubmission`:
  - Add the open check under the lock. `AssignmentClosedError` carries human copy: *"This item has already been received — refresh the page."* The recipient actions already surface `err.message` (`actions.ts:167,217,265,333`).
  - Set `supersedesSubmissionId`, and add it to the `assignment.submitted` metadata.
  - Call `syncCaseCompletion` last.
- `reserveSubmissionVersion`: open check under the lock. No supersedes here (decision 6).
- `saveDraftAnswer`:
  - Switch to the locking lookup.
  - Only set `fulfilmentStatus` when promoting from `pending`/`viewed`; never write back a status it read (fixes problem 4).
  - On a closed assignment, **return silently**: `AnswerField` discards the result (`answer-field.tsx:45,182`).
- `finalizeUpload`: new control flow below.

**`finalizeUpload` control flow (replaces the current one; there is no unlocked fail-fast):**
1. Unlocked lookup: version ⋈ assignment ⋈ requirement, LEFT JOIN `file_asset`.
   - Missing, wrong case, or **wrong party** (new check) → `not_found`.
   - Already has a `file_asset` (a replayed confirm) → `{ ok: true, fileAssetId }`. **Never discard in this case.**
2. Outside any transaction (unchanged): `storage.complete()`, then the size cap, then the scan. On `too_large`/`infected`: `storage.delete`, then `s.db.transaction(tx => discardReservedSubmissionTx(tx, …))`.
3. `s.db.transaction`:
   - Lock the assignment. Re-read the version; if it's gone → `not_found`.
   - If a `file_asset` exists → ok (lost a replay race).
   - If the assignment is not open → `discardReservedSubmissionTx` (the delete has a `NOT EXISTS(file_asset)` guard), audit `submission.upload_rejected { reason: 'assignment_closed' }`, return rejected. This path **commits**.
   - Otherwise: set the version's `supersedesSubmissionId` to the current latest completed id, insert the `file_asset`, set the assignment `submitted` and clear the draft, write the three existing audits, then `syncCaseCompletion` last.
4. Only after commit, if rejected: best-effort `storage.delete(key)`, then return `{ ok: false, reason: 'closed' }`. Add a matching entry to `CONFIRM_UPLOAD_ERROR_MESSAGES` (`actions.ts:355`); TypeScript forces it.

**Read paths**
- `recipient-view.ts`: build `latestSubmission` and `latestReview` from `loadAssignmentHistory(...)[0]`, and delete the placeholder query and comment (`:132-144`). **No `previousSubmission`**: for a `changes_requested` item, `latestSubmission` already *is* the version changes were requested on.
- `case.ts`:
  - `getCaseDetail` gains per-item `history` + `state` and a case-level `status`.
  - `listCases` replaces `submittedRequirements` with the `deriveCaseStatus` summary via a single `loadCaseStatusInputs` call.
  - Both have only page consumers.

## 3. HTTP and actions

- **New route** `src/app/(app)/cases/[caseId]/file/[fileAssetId]/route.ts`:
  - No session → redirect to `/sign-in`.
  - Otherwise `presignFileDownload(ws, id, { actorType: 'user', actorId: userId, expectedCaseId: caseId, ip, ua })` → 302.
  - `FileNotFoundError` → 404, `FileNotScannedError` → 409.
  - Copy the structure from `src/app/r/c/[caseId]/file/[fileAssetId]/route.ts`. Link to it with a plain `<a>`, never `<Link>`, because prefetch would fire the audited presign.
- **`src/app/(app)/cases/actions.ts`:** `approveSubmissionAction` (also serves "Approve as-is") and `requestChangesAction` (also serves "Reopen").
  - Form fields: `caseId`, `submissionVersionId`, `expectedReviewNumber`, `reason`.
  - Follow the file's existing pattern: session check, record `errorMessage` inside `try`/`catch`, and call `redirect()` **once after** the block, like `reissueAndRedirect`.
  - Errors travel via `?error=`.

## 4. UI (design-revised.md)

- **`src/components/ui/text-area.tsx` (new):** mirrors `TextField` (`label`, `supportingText`, `errorMessage`, `aria-describedby`, "Error:" prefix) and the filled styling of `answer-field.tsx:87-96`. The four existing hand-rolled textareas stay as they are (known gap).
- **`src/lib/answer-format.ts` (new):**
  - Move `formatAnswerValue` here from `completed-item.tsx:5-21`.
  - Add `answerToFormValue(answer)`: text → text, date → date, choice → choice, `yes_no` → `'yes'`/`'no'`, anything else → `''`.
- **Requester case page `src/app/(app)/cases/[caseId]/`:** `page.tsx` plus server components `review-item.tsx`, `review-controls.tsx`, `submission-summary.tsx`. Zero client JS.
  - **Page top:** move the `?error=` banner here. Add a case status label (icon + text, never colour alone) and counts.
  - **Per-requirement card:** an outlined `Card` with the title and a state label. Awaiting-recipient items **keep their fulfilment sub-status** ("Waiting on recipient · Viewed"), which preserves the viewed signal the Stage 6 mail-scanner e2e depends on. Below that, the latest completed submission: "Version N · date", the answer value or file link.
  - **Controls:**
    - *Needs review:* **Approve** (`tonal`, so several cards don't stack competing filled buttons) and a **Request changes** disclosure. The disclosure is a `<details>` whose summary is styled as an outlined button (`cursor-pointer`, focus ring, no marker). Inside: `TextArea` "What needs to change?", `required`, `maxLength=1000`, supporting text *"Shown to the recipient on this item only. They aren't emailed until reminders ship — use Resend invite to nudge them."*, and a filled **Send request**.
    - *Changes requested:* the reason box (reviewer + date) and a `text` **Approve as-is**.
    - *Approved:* a `text` **Reopen** disclosure with the same form.
    - *Acknowledged:* "Received", no controls.
  - **History:** a `<details>` "Earlier versions (n)" listing every older completed version with its value or file and each review's decision, reason, reviewer and date, **ordered by `review_number`**.
- **Dashboard `dashboard/page.tsx`:** *switch* from `caseRow.completedAt` (`:54-59`, never written today) to the derived status: "Needs review · 2", "Waiting on recipient · 3 of 5 accepted", or "Complete".
- **Recipient side:**
  - `completed-item.tsx`: add "Received — awaiting review" and "Received" (acknowledgements).
  - `outstanding-item.tsx`: when changes were requested, show "You sent: `<file | answer>`" from `latestSubmission` under the reason box, and pass `initialValue={draftValue || answerToFormValue(latestSubmission.answer)}`. That works for all five field types with no `AnswerField` change.
  - `recipient.ts`: logic unchanged; update the comment (fulfilment is now reopened, and the OR-branch is belt-and-braces).

## 5. Audit vocabulary

| eventType | actor | object | metadata |
|---|---|---|---|
| `review.approved` | user | review | `{ assignmentId, submissionVersionId, versionNumber, reviewNumber, previousStatus }` |
| `review.changes_requested` | user | review | same + `reason` |
| `case.completed` | user \| party | case | `{ trigger, acceptedCount }` |
| `case.reopened` | user \| party | case | `{ trigger }` |
| `assignment.submitted` (existing) | party | assignment | + `supersedesSubmissionId` |
| `submission.upload_rejected` (existing) | party | submission_version | + `reason: 'assignment_closed'` |
| `file.downloaded` (existing) | **user** (new actor) | file_asset | unchanged |

## 6. Ordered steps

0. ✅ Overwrote `plans/stage7.md` with the final plan. Reworded the CHECKLIST "set at insert" line (decision 6).
1. ✅ Schema + migration (`drizzle/0003_pale_hellcat.sql`) — generated, applied, verified against the real dev Postgres (`review` confirmed empty first). 123 pre-existing tests unaffected.
2. ✅ Exported `Tx` from `src/db/audit.ts`. Added `src/lib/domain/submission-history.ts` (`isCompletedVersion`, `latestCompletedVersion`, `loadAssignmentHistory`) and `src/lib/domain/case-status.ts`. **Deviation from the step split below**: `loadCaseStatusInputs`/`syncCaseCompletion`/`listOutstandingForReminder` (originally slated for step 4) were written in the same pass as the pure `deriveItemState`/`deriveCaseStatus` functions, since they share the file and `submission.ts` needed `syncCaseCompletion` immediately in step 3. The pure functions were still unit-tested first (`case-status.test.ts`, 20 tests) before anything in `submission.ts` was touched — the ordering guarantee this step exists for.
3. ✅ `submission.ts`: open-assignment guards on `recordAnswerSubmission`/`reserveSubmissionVersion`/`saveDraftAnswer` (the last is now silent on a closed assignment, and fixed to stop writing back a fulfilment status it only read), `discardReservedSubmissionTx` (was `discardReservedSubmission`, now takes an existing `Tx` instead of opening its own), the new `finalizeUpload` control flow (replay-safe, party-checked, `supersedesSubmissionId` set inside the locked transaction, `syncCaseCompletion` called last). `findCaseAssignmentForUpdate` switched to `no key update`. **Converted `submission.test.ts:180`** into the guard test (`AssignmentClosedError`, v1 untouched) and added 6 more: the reserve-side guard, a party-mismatch finalize, a replayed-confirm finalize (never discards), an assignment-closed-mid-upload finalize (discards + deletes the object), and the draft-save silent no-op. 148 tests green, `review.ts` not built yet at this step as planned.
4. ✅ `src/lib/domain/review.ts` (`approveSubmission`/`requestChanges`, `ReviewConflictError`/`ReviewNotRequiredError`/`InvalidReasonError`) plus `src/lib/domain/__tests__/review.test.ts` — 16 integration tests against the real Postgres: the checklist's verify item (byte-for-byte snapshot of an untouched assignment), approve completing a case, both reversal directions (with `previousStatus` recorded), reason validation (empty/too-long/DB CHECK), four conflict scenarios (parallel approves, stale version, acknowledgement, cross-case), the concurrent-completion write-skew guard (no deadlock, exactly one `case.completed`), both rework chains (answer and upload, the latter through an abandoned reservation), and `listOutstandingForReminder`. 164 tests green.
5. ✅ `recipient-view.ts` refactored onto `loadAssignmentHistory` (dropped the placeholder `desc(reviewedAt)` query and the now-dead `previousSubmission` idea). New `src/lib/answer-format.ts` (`formatAnswerValue` moved out of `completed-item.tsx`, plus new `answerToFormValue`) with 9 unit tests. Recipient components updated: `completed-item.tsx` gains "Received"/"Received — awaiting review" states; `outstanding-item.tsx` shows "You sent: …" under a `changes_requested` reason and prefills `AnswerField` from it. `recipient.ts`'s comment updated to reflect that fulfilment really is reopened now. 173 tests green.
6. ✅ Widened `case.ts`: `getCaseDetail` now returns per-item `history` (from `loadAssignmentHistory`) and `state` (from `deriveItemState`), plus a case-level `status`; `listCases` replaced `submittedRequirements` with `deriveCaseStatus`'s `status`/`counts`, sourced from one batched `loadCaseStatusInputs` call across every case in the workspace rather than per-case. Updated the dashboard's only consumer to the new shape (`summaryLabel`: "Complete" / "Needs review · N" / "N of M accepted"). `next build` green.
7. ✅ Requester download route (`src/app/(app)/cases/[caseId]/file/[fileAssetId]/route.ts`) — mirrors the recipient route's structure, `actorType: 'user'`, redirects to `/sign-in` with no session. Exercised end-to-end by the Stage 7 e2e spec (step 10) rather than a dedicated unit test, since `presignFileDownload` itself is already covered by `file.test.ts` and this route is a thin wrapper.
8. ✅ `src/components/ui/text-area.tsx` — mirrors `TextField`'s API/styling for a multiline field; the review-changes reason field's home.
9. ✅ `approveSubmissionAction`/`requestChangesAction` in `cases/actions.ts` (no new role check — any workspace member may review, per decision 10). New `src/app/(app)/cases/[caseId]/{submission-summary,review-controls,review-item}.tsx`, all server components, zero client JS (plain forms, native `<details>`). Case page rewritten: `?error=` banner moved to the top, a case status summary line added (icon + text + counts, never colour-only), the flat requirements list replaced with `ReviewItem` per requirement (state badge, latest submission, changes-requested reason, review controls by state, "Earlier versions" history). `next build` and all 173 tests green.
10. ✅ E2E. Extracted `setupCaseForRecipientTests` into `e2e/helpers.ts` (generalized to accept an arbitrary requirement mix, since Stage 7 needed an acknowledgement in addition to Stage 6's upload/yes_no/date). Fixed the two broken assertions: `stage6-recipient.spec.ts`'s "Submitted" ×3 → "Needs review" ×3 (scoped to `<li>`, since the page's own status summary can also say "Needs review"); `stage5-templates-cases.spec.ts`'s "0 of 2 submitted" → "0 of 1 accepted" (one of that test's two requirements is optional). Wrote `e2e/stage7-review.spec.ts` — 4 tests: the rework loop (approve/request-changes/resubmit/approve, ending Complete on both the case page and dashboard, including a real file download through the new requester route), reopening a Complete case, the reason-required server-side guard, and acknowledgement auto-accept. **A real, pre-existing race found and fixed while extracting the shared helper**: it clicked "Publish" and immediately `page.goto('/cases/new')` with no wait in between; since Publish is a server action rather than a URL change, the follow-on navigation could cancel the publish request in flight, leaving the template stuck in `draft` and invisible to `/cases/new`'s picker — the eventual `selectOption()` would then hang until its own timeout. This was intermittently flaking the **pre-existing** Stage 5/6 specs too, at every worker count including fully sequential (`--workers=1`) — not a Stage 7 regression, but surfaced by consolidating the setup into one helper. Fixed by waiting for the "Published" confirmation text before navigating away. Verified: the full 13-test suite green twice in a row at the project's default parallelism (5 workers) and once sequentially, after being flaky before the fix at every concurrency level tried.
11. ✅ CHECKLIST.md: Stage 7 section flipped to complete with pointers to the actual files/tests, journey 2 flipped (noting the reminder half is Stage 8's), the content-confidentiality gap extended to name review actions as ACL chokepoint 5, and four new known gaps logged (download filename, textarea migration debt, unreachable `rejected` status, and the approve-vs-upload race).

## 7. Verification

**Existing tests that will break and must be updated**
- `submission.test.ts:180`: see step 3.
- `e2e/stage6-recipient.spec.ts:88-89,100`: assertions on `'Pending'`/`'Viewed'`. These keep passing only via the fulfilment sub-status; use exact-match locators.
- `e2e/stage6-recipient.spec.ts:146`: `'Submitted'` ×3 becomes "Needs review" ×3. Exact match is required, because "submitted on …" text would inflate a substring count.
- `e2e/stage5-templates-cases.spec.ts:89,94`: the dashboard copy changes (`'0 of 2 submitted'`).
- `src/db/testing.ts`:
  - `seedFixtureFileAsset` gains a `versionNumber` option (it hard-codes 1 at `:193`).
  - The `requirementIds` select gains `.orderBy(asc(requirement.sequence))` (`:147-150`, currently unordered).

**Unit (no DB)**
- `case-status.test.ts` covers every rule row:
  - acknowledgement → accepted, N/A → needs_review;
  - approved + open fulfilment → awaiting_recipient;
  - rejected blocks;
  - an untouched optional item doesn't block, a submitted optional item does;
  - needs_review outranks awaiting_recipient;
  - the denominator counts required items only.
- `answer-format.test.ts` covers `formatAnswerValue` and `answerToFormValue` across all kinds.

**Integration (real Postgres, `src/db/testing.ts`)**
- **The checklist's verify item:** snapshot the whole rows of assignment B plus all its versions, reviews, answers and files. Request changes on A. Every B row must `toEqual` its snapshot. Inverse: A is `in_progress`, with exactly one review and one `review.changes_requested` event.
- **Approve:** fulfilment `submitted` and the draft cleared. The last blocking item stamps `completed_at` and writes `case.completed`.
- **Reversal:**
  - approve → reopen: `completed_at` cleared, `case.reopened` written, review numbers 1 and 2, `previousStatus: 'approved'`;
  - approve-as-is: back to `submitted`.
- **Reason:** empty, whitespace and 1001 characters are rejected with nothing written. A direct insert with a blank reason fails the **DB CHECK**.
- **Conflicts:** two parallel approves with the same `expectedReviewNumber` → exactly one row plus one `ReviewConflictError`. A non-latest version, an acknowledgement, and a version from **another case in the same workspace** all throw and write nothing.
- **Concurrent completion (write-skew guard):** an acknowledgement submit on A1 in parallel with an approve on A2 → exactly one `case.completed`, and `completed_at` set, with no deadlock.
- **Chains:**
  - answer: v1 → request changes → v2, where `v2.supersedes = v1` and v1 plus its review are unchanged;
  - upload: v1 finalized → request changes → reserve (abandon) → reserve → finalize, where the final version supersedes v1 and the orphan is never surfaced by `getRecipientView`.
- **Guards:**
  - submitting on an awaiting-review or approved item → `AssignmentClosedError`;
  - a draft save on a closed item is a silent no-op that leaves fulfilment unchanged;
  - reopen → reserve → approve-as-is → finalize → rejected `closed` and the object deleted;
  - **a replayed finalize of an already-finalized ticket returns ok and deletes nothing**;
  - a finalize with a mismatched `partyId` → `not_found`.
- `listOutstandingForReminder`: the reason appears for A only, and disappears after A resubmits.

**E2E: `e2e/stage7-review.spec.ts`**
1. **Rework loop (journey 2 minus the reminder):**
   - Recipient: answers yes/no and uploads a file.
   - Requester: sees the value and filename, and the file link downloads. Approves the answer, and requests changes on the upload with a reason.
   - Recipient: sees the reason on the upload **only**, with the answer under Completed as Approved. Re-uploads.
   - Requester: sees v2 as Needs review and "Earlier versions (1)" with the reason. Approves. The case page and dashboard both show **Complete**.
2. **Reopen:** a complete case → Reopen with a reason → no longer complete; the recipient sees the item outstanding.
3. **Reason required:** strip the `required` attribute via `evaluate`, submit, and get an inline error with no state change.
4. **Acknowledgement:** auto-accepted, with no review controls.

**Manual**
- The requester page works with JS disabled: approve, request changes, reopen, and history expand.
- Two tabs on the same item → "This item changed since you loaded the page".
- 360px requester case page: no overflow.

**Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (all specs), `pnpm build`.

## 8. Risks and warts

1. **Completion is non-monotonic.** Stage 8's stop condition and Stage 9's "days open" must use `deriveCaseStatus` or respect `case.reopened`.
2. **"Approve as-is" mid-upload** discards the recipient's upload at finalize, with a clear message.
3. **An all-optional template** gives a case that is derived-complete at creation, with `completed_at` null (sync runs only on transitions). The UI reads the derivation, so what's displayed is consistent. The real fix is for `publishVersion` to require at least one required item (out of scope).
4. **Review reasons are content** (roles-and-tenancy.md). They also sit in audit metadata, so Stage 11's ACL must treat the audit view as a content read.
5. **Recipients see only the latest version** (plus the reason while changes are requested). Full recipient-side version history is deferred.
6. **`rejected` is unreachable** and fails closed.
7. **No recipient notification until Stage 8.** The request form's supporting text says so.
8. **Four hand-rolled textareas remain** after `TextArea` exists.
