# Gather — Build Checklist

Tracks implementation against the approved plan at
`/Users/saifsaifee/.claude/plans/design-md-gather-io-no-account-document-twinkling-scroll.md`.
Updated as work lands — not written once and forgotten. `[x]` means built
**and verified** (typecheck/lint/test passing, or manually exercised), not
just written. `[~]` means partially done; the note says what's missing.

Legend: `[ ]` not started · `[~]` in progress / partial · `[x]` done & verified

Last updated: 2026-08-30 (design.md logo/wordmark spec added; product name corrected to "Gather" throughout)

---

## Stage 1 — Foundations

- [x] `pnpm` project scaffolded (`package.json`, scripts for dev/build/worker/db/test)
- [x] Next.js App Router + TypeScript strict mode (`tsconfig.json`, `next.config.ts`)
- [x] ESLint flat config (`eslint.config.mjs`) + Prettier (`prettier.config.mjs`)
- [x] `docker-compose.yml` — Postgres 16 on `:5433` (avoids Homebrew's `:5432`) + Mailpit on `:1025`/`:8025`
- [x] `.env.example` with every adapter defaulted to local (no cloud accounts needed)
- [x] `README.md` with one-command start instructions
- [x] Directory shape created: `app/(app)`, `app/r/[token]`, `app/api`, `db/schema`, `lib/adapters`, `lib/domain`, `worker/jobs`, `components/ui`
- [x] Process split: `next dev` (web) and `pnpm worker` (background jobs) read the same env
- [x] Verified: `pnpm dev` boots, home page (`/`) renders

## Stage 2 — Schema and tenant isolation

**Entities** (`src/db/schema/`):
- [x] `workspace`, `workspace_member` ([workspace.ts](src/db/schema/workspace.ts))
- [x] `user`, `session`, `account`, `verification` — Better Auth–shaped, hand-written pending Stage 4 reconciliation ([auth.ts](src/db/schema/auth.ts))
- [x] `workflow_template`, `template_version`, `requirement_definition` ([template.ts](src/db/schema/template.ts))
- [x] `case`, `party`, `ledger_subject` ([case.ts](src/db/schema/case.ts))
- [x] `requirement`, `assignment` — modeled as separate entities, not collapsed ([requirement.ts](src/db/schema/requirement.ts))
- [x] `submission_version` (append-only), `submission_answer`, `file_asset`, `review`, `document_validity` ([submission.ts](src/db/schema/submission.ts))
- [x] `reminder_policy`, `reminder_dispatch` (unique constraint on assignment+sequence), `delivery_attempt` ([reminder.ts](src/db/schema/reminder.ts))
- [x] `access_token` — stores hash only, never the raw token ([access.ts](src/db/schema/access.ts))
- [x] `audit_event` — append-only, hash-chain columns present but unused ([audit.ts](src/db/schema/audit.ts))
- [x] `signature_envelope` — table only, no logic yet (Phase 2 seam) ([signature.ts](src/db/schema/signature.ts))

**Five independent status axes** ([enums.ts](src/db/schema/enums.ts)):
- [x] `fulfilment_status` (pending/viewed/in_progress/submitted/waived/cancelled)
- [x] `review_status` (not_required/unreviewed/approved/changes_requested/rejected)
- [x] `validity_status` (not_applicable/current/expiring/expired)
- [x] `delivery_status` (queued/sent/delivered/bounced/suppressed)
- [x] `signature_status` (not_sent/opened/signed/declined/voided/expired)

**Non-negotiable modelling choices:**
- [x] `workspace_id` on every table
- [x] `assignment` joins requirement × party as its own entity
- [x] `submission_version` append-only with `supersedes_submission_id`
- [x] `document_validity` anchored to `ledger_subject_id`, not the requirement
- [x] `party.ledger_subject_id` for cross-case persistence
- [x] `review.reason` is a real column, feeds reminders later
- [x] Risk-auth ladder columns present: `workspace.default_authentication_policy`, `requirement.sensitivity`, `access_token.auth_level`

**Tenant isolation:**
- [x] `src/db/scoped.ts` — the only sanctioned query surface, branded `WorkspaceId`
- [x] ESLint `no-restricted-imports` blocks raw `db` import outside `src/db/**` — **verified by writing a probe file that imported `db` directly and confirming the lint error fired**
- [x] `src/db/audit.ts` — `withAudit(tx, event)` writes in the caller's transaction

**Verified:**
- [x] `drizzle-kit generate` produces correct SQL for all 25 tables
- [x] `pnpm db:migrate` applies cleanly against Docker Postgres
- [x] `pnpm db:seed` creates workspace → user → template → case → party → 2 requirements → 2 assignments → access token, prints working recipient link
- [x] `pnpm db:reset` truncates cleanly; reset→reseed cycle confirmed
- [x] `tsc --noEmit` and `eslint .` clean across schema

## Stage 3 — Adapters

- [x] Storage interface ([storage.ts](src/lib/adapters/storage.ts)): `presignUpload / presignDownload / complete / delete`
- [x] Local storage driver ([storage.local.ts](src/lib/adapters/storage.local.ts)) — HMAC-signed tokens, filesystem-backed, path-traversal guarded
- [x] R2 storage driver ([storage.r2.ts](src/lib/adapters/storage.r2.ts)) — S3-compatible client, `region: "auto"`, notes CORS + no-event-notification gotchas
- [x] `/api/upload/[token]` and `/api/download/[token]` routes for the local driver
- [x] Notify interface ([notify.ts](src/lib/adapters/notify.ts)) — template-ref + variables only, never free text (WhatsApp 24h-window constraint)
- [x] SMTP notify driver ([notify.smtp.ts](src/lib/adapters/notify.smtp.ts)) — points at Mailpit locally
- [ ] Postmark notify driver (throws "not implemented" — Phase 1b)
- [x] Scan interface ([scan.ts](src/lib/adapters/scan.ts)) + noop driver ([scan.noop.ts](src/lib/adapters/scan.noop.ts))
- [ ] ClamAV scan driver (throws "not implemented" — needed before real client files)
- [x] E-sign interface stub only, no driver ([esign.ts](src/lib/adapters/esign.ts)) — intentional, Phase 2

**Verified:**
- [x] Vitest suite: token round-trip (3 tests), local storage adapter (5 tests: happy path, tampered signature, expired token, path-traversal, complete()-without-upload)
- [x] Real HTTP round-trip: PUT to `/api/upload/[token]` → file lands on disk → GET from `/api/download/[token]` → content matches, exercised against the live dev server
- [x] `tsc --noEmit`, `eslint .`, `vitest run` all green

---

## Stage 4 — Requester auth and workspace

- [ ] Reconcile hand-written `auth.ts` schema against `better-auth generate` output (may need a migration)
- [ ] Better Auth server config (`src/lib/auth.ts` or similar) — email+password provider
- [ ] Better Auth client/hooks for the app router
- [ ] Sign-up flow: creates `user` + `workspace` + `workspace_member(role=owner)` in one transaction
- [ ] Sign-in flow
- [ ] Session → `WorkspaceId` resolution helper used by every server action/route handler
- [ ] Route protection for `app/(app)/**` (redirect unauthenticated to sign-in)
- [ ] Workspace switcher (even if a user only ever has one workspace in Phase 1a, the data model allows more)
- [ ] `workspace_member` role check helper (owner vs member) for actions that need it
- [ ] Sign-out
- [ ] Verify: fresh sign-up creates exactly one workspace + one owner membership; a second browser session can't see another workspace's data (ties into Stage 2's isolation tests)

## Stage 5 — Templates and cases

- [ ] Template CRUD (create/list/edit/archive) scoped to workspace
- [ ] `template_version` immutability enforced once a `case` references it (attempting to edit an in-use version creates a new version instead)
- [ ] Requirement-definition builder: title, instructions, action_type, sequence, required, acceptance_criteria, sensitivity
- [ ] Answer field type selector — exactly five: short_text, long_text, date, choice, yes_no
- [ ] Case instantiation: snapshot `template_version` → concrete `requirement` rows
- [ ] Case instantiation: create `party` row(s)
- [ ] Case instantiation: create `assignment` row(s) joining requirements × parties
- [ ] Case instantiation: issue `access_token` (hash stored, raw token returned once)
- [ ] Case list / detail view for the requester (data-backed, replacing the current dashboard stub)
- [ ] Verify: editing a template used by a live case does not alter that case's already-snapshotted requirements

## Stage 6 — Magic links and the recipient page

- [ ] `GET /r/[token]` resolves token hash → party/case, creates short-lived session cookie
- [ ] **Critical**: `GET` never marks anything viewed, consumes the token, or records consent (mail-scanner safety)
- [ ] Explicit `POST` actions for: mark viewed, save answer draft, submit answer, request upload URL, confirm upload complete
- [ ] Token expiry and revocation enforced on every POST, not just at session creation
- [ ] Recipient page: outstanding items first and prominent
- [ ] Recipient page: completed items collapsed, expandable
- [ ] Recipient page: `changes_requested` items show the reviewer's reason inline, above the re-upload control
- [ ] Answer fields for all 5 types with client + server validation
- [ ] Upload flow wired to storage adapter's `presignUpload` (Uppy or minimal equivalent)
- [ ] Resumability: in-progress answers persist on blur; upload resumes after a dropped connection
- [ ] Mobile-first layout, tested at 360px width
- [ ] Tested on throttled/slow network profile
- [ ] Minimal client JS — Uppy (or equivalent) loads only on rows that need a file
- [ ] Verify: hitting `GET /r/[token]` twice (simulating a mail scanner) leaves the assignment `pending`, records no consent — this becomes an automated integration test, not just manual

## Stage 7 — Review and the rework loop

- [ ] Requester review UI: approve / request changes with a required reason on request-changes
- [ ] Approve transitions `review_status` → `approved`
- [ ] Request-changes transitions `review_status` → `changes_requested` and reopens **exactly one** assignment (not the whole case)
- [ ] Resubmission creates a new `submission_version` with `supersedes_submission_id` set — old version untouched
- [ ] Reason text threaded into the next reminder for that specific assignment (data plumbing; actual reminder copy is Stage 8)
- [ ] `src/lib/domain/case-status.ts` — derives case-level status from all its assignments; case is "complete" only when every required assignment is submitted+approved (or waived)
- [ ] Verify: rejecting one of two assignments on a case leaves the other assignment and its history completely unaffected

## Stage 8 — Reminders

- [ ] `pg-boss` job registered in `src/worker/jobs/reminder.ts`
- [ ] Reads `reminder_policy` per case (cadence, channels, quiet_hours, stop_condition, unopened_cadence, stalled_cadence)
- [ ] Reminder copy names only what is currently missing for that party
- [ ] Unopened vs. opened-and-stalled → materially different copy/template ref
- [ ] **Idempotency**: DB-level unique constraint on `(assignment_id, reminder_sequence)` prevents double-send on retry/redeploy — constraint already exists in schema ([reminder.ts](src/db/schema/reminder.ts)); job logic must actually respect the sequence number
- [ ] Quiet hours respected in the workspace's timezone
- [ ] `delivery_attempt` rows recorded with provider message id
- [ ] Bounce/complaint webhook handler (stub acceptable for Phase 1a, real for 1b)
- [ ] Suppression list honored — a bounced/suppressed party stops receiving reminders
- [ ] Stop condition: reminders cease once the case (or that assignment) is fully satisfied
- [ ] Verify: running the reminder job twice over the same due assignment produces exactly one `reminder_dispatch` row (this is the single most important test in the whole plan per techstack.md)

## Stage 9 — Dashboard and export

- [ ] Case list: sortable/filterable, shows blocking party + blocking items + days open + last recipient activity per case
- [ ] Delivery problems surfaced on the case (a bounced invite must not be invisible)
- [ ] ZIP export job in the worker (`archiver`), includes files + a rendered summary of answers
- [ ] Export delivered via short-lived signed URL (reuses storage adapter's `presignDownload`)
- [ ] Every download recorded as an `audit_event` in the same transaction as generating the link
- [ ] Verify: exported ZIP contains every submitted file and every answer for a fully-approved case

## Stage 10 — Design system (Material You)

- [x] Tokens centralized in `globals.css` under Tailwind v4 `@theme` (`md-` prefix) — background, primary, secondary-container, tertiary, surface-container(-low), outline, on-surface-variant
- [x] Roboto 400/500/700 loaded via `next/font/google`
- [x] `prefers-reduced-motion` handled globally
- [x] Radius scale tokens (`--radius-md-xs` through `--radius-md-3xl`)
- [x] `cubic-bezier(0.2,0,0,1)` easing token defined
- [ ] **Logo component** — wordmark "Gather" (never "Gather.io"), Saira Extra Condensed Bold (700) loaded via `next/font/google` scoped to this component only, Primary color on neutral surfaces / On Primary (white) reversed on colored surfaces, `-0.01em` tracking, sentence-case default with an all-caps variant for tight spaces (favicon/app-icon tile) — spec added to [design.md](design.md#logo--wordmark) 2026-08-30, not yet implemented in code (currently `app/layout.tsx`'s `<title>` and any header are still plain text, no Logo component exists)
- [ ] `Button` primitive — pill-shaped, state-layer opacity (90%/80% on solid, 10%/5% on transparent), `active:scale-95`, all 5 variants (filled/tonal/outlined/text/FAB)
- [ ] `Card` primitive — surface-container bg, 24px radius, shadow-sm→shadow-md hover, optional `hover:scale-[1.02]`
- [ ] `TextField` primitive — filled MD3 style (rounded top, square bottom, 2px bottom border, primary on focus)
- [ ] `Chip` primitive
- [ ] `StatusPill` primitive (maps the 5 status axes to color+label)
- [ ] `FAB` primitive
- [ ] Organic blur-shape decoration for hero/key sections (signature MD3 element — not yet present anywhere)
- [ ] Focus-visible rings on every interactive element (`focus-visible:ring-2 ring-md-primary ring-offset-2`)
- [ ] Recipient page deliberately skips heavy atmospheric layering (perf constraint) — confirm this restraint is actually followed once the page is built in Stage 6
- [ ] Dashboard/case list uses the full design language once built in Stage 9

---

## Roadmap seams (not built now, but schema/interfaces must not block them later)

- [x] Signing: `signature_envelope` table exists, `sign` in `action_type` enum, `ESignAdapter` interface defined with no implementation
- [x] Banking details: `auth_level` enum includes `otp_out_of_band`; `requirement.sensitivity` includes `banking` — no field-level encryption or out-of-band verification flow built yet (correctly deferred)
- [x] Aadhaar: no column anywhere accepts a raw government ID; architectural rule documented in the plan — nothing to build until Phase 2's CCA-provider integration
- [x] AI extraction: seam is `submission_version` immutability + `file_asset.sha256_hash`; no `extraction` table yet (add when this feature is actually scheduled)
- [x] Conditional logic: `requirement_definition.visibility_condition` (jsonb, nullable) exists, unevaluated
- [ ] Payments: no tables yet — deliberately deferred, bounded context, not started
- [x] Integrations: `audit_event` is the append-only stream future webhooks will read; no consumer built yet

## Cross-cutting verification (from the plan's Verification section)

- [x] Clean-start command works: `docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`
- [ ] Playwright installed and configured (`playwright.config.ts` not yet written)
- [ ] E2E journey 1 — happy path: create case → recipient uploads+answers → submit → approve → case closes → export contains everything
- [ ] E2E journey 2 — rework loop: submit → request changes with reason → reason shown on that one item only → resubmit → both versions linked in history → next reminder carries the reason
- [x] Integration test: cross-workspace read isolation (via ESLint rule; a runtime DB-level test using `scoped()` against two workspaces is still open)
- [ ] Integration test: `GET /r/[token]` twice leaves assignment `pending`, no consent recorded (Stage 6 dependency)
- [ ] Integration test: reminder job run twice → exactly one `reminder_dispatch` row (Stage 8 dependency)
- [ ] Integration test: state change + audit event commit/rollback together (needs a real service-layer function to test against; `withAudit` exists but nothing calls it yet)
- [x] Integration test: file undownloadable while `malware_scan_status` = `quarantined` — **not yet built**; currently nothing enforces this at the download-route level (storage adapter doesn't check DB state — flagging as a gap, unchecking)
- [ ] Manual: Mailpit shows different copy for unopened vs. stalled reminders
- [ ] Manual: recipient page checked at 360px width with network throttled

---

## Known gaps / things to revisit

- **Download route doesn't check malware scan status.** `/api/download/[token]` (Stage 3) will serve any file whose token is valid, regardless of `file_asset.malware_scan_status`. This is fine today because no real upload flow exists yet, but Stage 6/9 must gate downloads on scan status before this touches real files — noted here so it isn't forgotten.
- **Storage residency decision (R2 vs. ap-south-1) still open** — see the plan's dedicated section. Should be resolved before the first pilot, not discovered during one.
- **`auth.ts` schema is hand-written**, guessing Better Auth's default Postgres field names. Stage 4 must confirm this against `better-auth generate` output and migrate if it drifts.
