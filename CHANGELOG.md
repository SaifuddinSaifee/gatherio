# Changelog

Notable changes to Gather, grouped by build stage (see `CHECKLIST.md` and `product.md`). This project ships in stages rather than versions, so entries are dated and named by stage instead of semver.

## Post-Stage-7 — Real download filenames (2026-09-12)

Suggested commit message:

```text
Fix: downloaded files keep their real filename

presignDownload now accepts an optional filename, threaded from
fileAsset.originalFilename through both storage drivers instead of
being discarded: the local driver's signed token carries it to
/api/download/[token], which sets a real Content-Disposition header
(quoted ASCII form plus an RFC 5987 filename* for non-ASCII names);
the R2 driver sets the equivalent ResponseContentDisposition on its
presigned URL. Both go through one shared, unit-tested
contentDispositionHeader() helper, including a header-injection-
attempt case (embedded CR/LF and quotes).

Retires the "opaque download filename" gap logged in Stage 7 — the
data was already there (presignFileDownload already returned it),
it just wasn't wired through to the response header.
```

- **Fixed:** `contentDispositionHeader()` added to `src/lib/adapters/storage.ts`; wired through `storage.local.ts` (via the signed download token), `storage.r2.ts` (via `ResponseContentDisposition`), `presignFileDownload`, and `/api/download/[token]/route.ts`.
- **Tests:** unit tests for the header helper (plain, non-ASCII, header-injection attempt) and for the local token round-trip; `stage7-review.spec.ts` now asserts `download.suggestedFilename()` instead of skipping it.

## Stage 7 — Review and the rework loop (2026-09-12)

Suggested commit message:

- **feature: Added requester review and the rework loop**
  - Introduced the review data model:
    - Includes `review_number`, DB-enforced requirement for a `reason` on request-changes, and a `supersedes_submission_id` foreign key.
  - Implemented a new domain layer to derive case/item status instead of storing it explicitly:
    - Added modules: `submission-history.ts`, `case-status.ts`, and `review.ts` (`approveSubmission` and `requestChanges` methods).
    - Uses optimistic concurrency control and a deadlock-safe NO KEY UPDATE locking protocol shared with recipient writes.
  - Upgraded requester case page:
    - Displays review controls (Approve, Request changes with a required reason, Reopen).
    - Shows per-item version history.
    - Added a requester-side file download route.
  - Modified recipient write behavior:
    - Recipient writes are now blocked for closed assignments (states: awaiting-review or approved).
  - Fixed three latent bugs uncovered during development:
    - **saveDraftAnswer**: Fixed a lost-update race (where a draft save could silently reopen an approved item).
    - **finalizeUpload**: Added party ownership check and ensured idempotent handling to prevent a replayed confirm from deleting completed submissions.
    - **e2e setup race**: Addressed a pre-existing test flake caused by navigating away immediately after clicking Publish, which impacted Stage 5/6 specs as well.
  - Added comprehensive test coverage:
    - 20 unit tests
    - 16 integration tests
    - 4 Playwright specs covering the full rework loop, reopening, reason validation, and auto-acceptance of acknowledgements.

### Added
- `review` row is now an insert-only decision with per-version `review_number` ordering (many reviews per version, latest wins) — approve and request-changes are both reversible.
- `src/lib/domain/case-status.ts`: pure derivation of per-item and per-case status (`awaiting_recipient`, `needs_review`, `changes_requested`, `accepted`, `rejected`, `waived`, `cancelled` → `complete`/`needs_review`/`awaiting_recipient`), replacing the old raw fulfilment-count display.
- `src/lib/domain/submission-history.ts`: shared "latest completed version" and full version+review history loader, used by both the requester and recipient views so they can't disagree.
- `src/lib/domain/review.ts`: `approveSubmission` / `requestChanges`, with a single `ReviewConflictError` covering stale version, stale review number, and no-op decisions.
- Requester case page ([src/app/(app)/cases/[caseId]/page.tsx](<src/app/(app)/cases/[caseId]/page.tsx>)): case-level status summary, per-item Approve / Request changes / Reopen controls, and an "Earlier versions" history disclosure — zero client JS.
- Requester-side file download route (`/cases/[caseId]/file/[fileAssetId]`), mirroring the recipient's.
- `TextArea` UI primitive (`src/components/ui/text-area.tsx`) for the request-changes reason field.
- Acknowledgements are auto-accepted and skip review entirely.
- `src/lib/answer-format.ts`: shared answer formatting/prefill helpers, used to show recipients what they previously submitted when changes are requested.

### Changed
- Recipient submission paths (`recordAnswerSubmission`, `reserveSubmissionVersion`, `saveDraftAnswer`, `finalizeUpload`) now refuse writes to closed (awaiting-review or approved) assignments — only a requester's Reopen unlocks them again.
- Case completion (`case.completed_at`) is now synced transactionally from the derived status on every write, and can be cleared again by a reopen (`syncCaseCompletion`).
- Dashboard and case pages now show accepted/required counts and review state instead of raw submission counts.

### Fixed
- `saveDraftAnswer` had a lost-update race: it read fulfilment status unlocked and wrote back what it read, which could silently reopen an item a requester had just approved. It now only ever promotes status forward, never overwrites it.
- `finalizeUpload` never checked the upload ticket's party and wasn't idempotent — a replayed confirm request could have deleted an already-completed submission and its review. It now checks party ownership and returns success without touching anything if already finalized.
- A pre-existing race in the shared e2e setup helper (`page.click('Publish')` immediately followed by `page.goto(...)`) could leave a template stuck in `draft`, intermittently flaking Stage 5/6 specs as well as the new Stage 7 spec. Fixed by waiting for the "Published" confirmation before navigating away.

### Known gaps (deferred, tracked in `CHECKLIST.md`)
- ~~Downloaded files get an opaque filename instead of their real one~~ — fixed in the post-Stage-7 follow-up above.
- Four textareas predating this stage (two template-builder forms, the requirement-edit page, the recipient's long-text `AnswerField`) are still hand-rolled rather than using the new `TextArea` primitive.
- `rejected` review status is defined (including a DB check) but unreachable from any UI path today.
- No recipient email/notification on request-changes yet — that's Stage 8's reminder engine; Stage 7 only does the data plumbing (`listOutstandingForReminder`).
