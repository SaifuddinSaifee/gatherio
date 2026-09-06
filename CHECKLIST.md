# Gather — Build Checklist

Tracks implementation against the approved plan at
`/Users/saifsaifee/.claude/plans/design-md-gather-io-no-account-document-twinkling-scroll.md`.
Updated as work lands — not written once and forgotten. `[x]` means built
**and verified** (typecheck/lint/test passing, or manually exercised), not
just written. `[~]` means partially done; the note says what's missing.

Legend: `[ ]` not started · `[~]` in progress / partial · `[x]` done & verified

Last updated: 2026-09-06 (fixed a real bug: `db:migrate`/`db:seed`/`db:reset`/`worker` all crashed on a missing `DATABASE_URL` in a fresh shell because `tsx` doesn't auto-load `.env` the way `next dev` does — added `--env-file=.env` to those scripts; see Stage 1)

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

**2026-09-06 — real bug found and fixed: every `db:*` script and the worker crashed with a Zod "DATABASE_URL required" error despite a correctly populated `.env`.** Root cause: `next dev` auto-loads `.env`/`.env.local` internally, but the `db:migrate`/`db:seed`/`db:reset`/`worker` scripts are plain `tsx src/....ts` invocations — tsx does not load any `.env` file on its own, so `src/lib/env.ts`'s `process.env` read saw nothing outside of Next.js. This had been masked so far by always having the vars already exported in the shell during earlier stages' verification; it reproduces on any fresh shell/clone, which is exactly how it was caught. `db:generate`/`db:studio` were unaffected because `drizzle-kit`'s own CLI has built-in `.env` loading. Fixed by adding Node 22's native `--env-file=.env` flag to the `db:migrate`, `db:seed`, `db:reset`, `worker`, and `worker:start` scripts in `package.json` — no new dependency (no `dotenv` package), since Node 20.6+ supports this natively and `tsx` passes the flag through. Verified by running all three (`db:reset` → `db:migrate` → `db:seed`) end to end in a fresh shell with no vars pre-exported.

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

- [x] Reconciled hand-written `auth.ts` schema against Better Auth 1.7.2's actual requirements — done by reading `@better-auth/core`'s `buildAuthTables()` directly (CLI package isn't installed), not by running `better-auth generate`. **Found and fixed a breaking bug**: `account.issuer` was missing entirely — Better Auth writes it unconditionally with no DB default, so every sign-up would have failed a NOT NULL violation. Also added `access_token_expires_at`/`refresh_token_expires_at` (replacing one combined `expiresAt`), `scope`, a composite unique index on `(issuer, account_id)`, and non-unique indexes on `session.user_id` and `verification.identifier`. ([auth.ts](src/db/schema/auth.ts))
- [x] Bumped `drizzle-orm` 0.38.4 → 0.45.2 and `drizzle-kit` to match — `@better-auth/drizzle-adapter`'s peer dependency requires `^0.45.2`, which the original pin didn't satisfy (pnpm installed anyway; peer warnings aren't fatal, but it was a real risk). Verified via a full clean migration regenerate + reseed + the whole test suite afterward.
- [x] Regenerated a single clean initial migration (deleted `drizzle/`, dropped and recreated the local schema, regenerated) rather than layering an ALTER migration onto a migration that had never shipped anywhere.
- [x] **Decision recorded in the plan**: kept hand-rolled `workspace`/`workspace_member` rather than adopting Better Auth's built-in `organization` plugin. The plugin's `organization` table has no typed equivalent for `default_authentication_policy` (the §4.7 auth-ladder default) short of an untyped `metadata` JSON blob, and all 25 Stage 2 tables already FK to `workspace.id`. See the plan file's Stage 4 section for the full reasoning.
- [x] Better Auth server config ([auth.ts](src/lib/auth.ts)) — `drizzleAdapter` + `emailAndPassword` + `nextCookies()` (required last-in-array so direct server-action calls to `auth.api.signUpEmail`/`signInEmail` persist the session cookie, not just calls through the mounted route)
- [x] Route handler ([api/auth/[...all]/route.ts](src/app/api/auth/[...all]/route.ts)) via `toNextJsHandler`
- [x] Client (`src/lib/auth-client.ts`) — created per the plan, but **currently unused**: sign-up/sign-in/sign-out ended up as server-rendered forms with server actions calling `auth.api.*` directly instead, consistent with the project's established minimal-client-JS ethos (same reasoning as the recipient page). Kept for a future stage that wants client-side reactivity (e.g. a live `useSession()` in a nav bar).
- [x] Session → `WorkspaceId` resolution helper — `getCurrentSession()` in [db/session.ts](src/db/session.ts), the one choke point every server action/route handler uses
- [x] Sign-up flow ([sign-up/actions.ts](src/app/(auth)/sign-up/actions.ts)): `auth.api.signUpEmail` then `createWorkspaceForUser` ([db/workspace.ts](src/db/workspace.ts)) in one `db.transaction()`; on failure, compensating deletion of the orphaned user row (not a single cross-library transaction — Better Auth's own commit isn't something our code can join)
- [x] Sign-in flow ([sign-in/actions.ts](src/app/(auth)/sign-in/actions.ts))
- [x] Sign-out ([app/actions.ts](src/app/(app)/actions.ts))
- [x] Route protection for `app/(app)/**` via [layout.tsx](src/app/(app)/layout.tsx) — server-side `getCurrentSession()` check, redirect to `/sign-in`
- [x] `requireRole(session, role)` helper in `db/session.ts` — built even though nothing calls it yet beyond the sign-up-creates-owner path
- [x] **Descoped from the original sketch**: the workspace switcher. With no invite-another-user flow built, sign-up is the only way a `workspace_member` row is ever created and it always creates exactly one workspace per user — a switcher for a state that cannot occur would be building for a hypothetical. Revisit once an invite flow exists.
- [x] **Real bug found and fixed in the Stage 2 ESLint tenant-isolation rule while extending it**: the `no-restricted-imports` rule only matched the literal `@/db/client` alias import — a relative import (`../../db/client`) bypassed it entirely. Added a `patterns` entry (`**/db/client`) to close that loophole; verified with two probe files (alias form and relative-path form), both now caught.
- [x] Simplified the rule's file-by-file `ignores` allowlist to a directory-level `src/db/**` ignore (plus `src/lib/auth.ts`) — the enumerated-file approach had already needed updating twice in this one stage (`session.ts`, `workspace.ts`) and would keep needing it for every future legitimate db-internal file.
- [x] First real cut of Stage 10's `TextField` primitive ([components/ui/text-field.tsx](src/components/ui/text-field.tsx)) — built here because the sign-up/sign-in forms are its first consumer, not deferred to Stage 10
- [x] Verified end-to-end with Playwright (not just "the page didn't error"): [e2e/stage4-auth.spec.ts](e2e/stage4-auth.spec.ts) — sign-up → dashboard shows the right workspace name and role → sign-out → unauthenticated `/dashboard` redirects → sign-in → wrong password shows an inline error, not a 500. [e2e/stage4-isolation.spec.ts](e2e/stage4-isolation.spec.ts) — two independent sign-ups in separate browser contexts, second user's dashboard never shows the first user's workspace name. Also spot-checked the DB directly: exactly one `workspace` row and one `workspace_member(role='owner')` row per sign-up.
- [x] `playwright.config.ts` written (assumes `pnpm dev` + Docker already running locally, matching how every other verification in this project has been done — no `webServer` auto-start)
- [x] Fixed a `vitest.config.ts` gap surfaced by adding `e2e/`: Vitest's default glob was picking up the new Playwright `*.spec.ts` files and failing to load them (wrong `test()` global) — added `exclude: ['e2e/**']`
- [x] Full `tsc --noEmit`, `eslint .`, `vitest run`, and `playwright test` all green after every change above, including after the `drizzle-orm` bump specifically (the point where a silent breakage from that version jump would have shown up)

## Stage 5 — Templates and cases

- [x] `workflowTemplate` gained an `archivedAt` column (migration `drizzle/0001_vengeful_blindfold.sql`) — archived templates keep their history but drop out of the case-creation picker.
- [x] Template CRUD scoped to workspace via `scoped()` — the first real consumer of `src/db/scoped.ts` beyond its own definition; `session.ts`/`workspace.ts` had been using the raw `db` handle directly (legitimate, since they're in `src/db/` and predate any workspace scope to filter by). Domain logic lives in [lib/domain/template.ts](src/lib/domain/template.ts) and [lib/domain/case.ts](src/lib/domain/case.ts), not `src/db/`, matching the plan's directory shape (`lib/domain` for state machines / business logic that consumes the db layer, not is the db layer).
- [x] **`template_version` immutability, resolved as: draft is the only mutable state.** A version starts `draft` (freely editable), `publishVersion` flips it to `active` (requires ≥1 requirement), and every mutation function (`addRequirementDefinition`/`updateRequirementDefinition`/`deleteRequirementDefinition`) asserts `status === 'draft'` and throws `VersionNotDraftError` otherwise. Case instantiation requires `status === 'active'`. This makes "a case can only ever reference an immutable version" true by construction rather than by checking case-references at edit time.
  - Editing a published template is **explicit, not an implicit auto-clone-on-edit-attempt**: `createDraftFromLatest` clones the latest version's requirement definitions into a brand-new draft version (fresh ids) only when the requester clicks "Create new draft version." Considered and rejected an auto-clone-on-first-edit design — it left genuine ambiguity about which definition in the clone corresponds to the one being edited, since a clone gets new ids. The explicit-clone-first design has no such ambiguity: the requester lands on the new draft's own page and edits its own definitions directly.
- [x] Requirement-definition builder (title, instructions, action_type, sequence, required, acceptance_criteria, sensitivity) — inline add/edit forms on the template detail page and a dedicated edit page, both server actions, no client JS.
- [x] Answer field type selector — exactly the five from §4.1 (short_text, long_text, date, choice, yes_no), shown via the new [`Select`](src/components/ui/select.tsx) primitive (styled to match `TextField`'s filled-field language — built here because this is the first form needing more than one select, e.g. action_type + answer_field_type + sensitivity on one form).
- [x] Case instantiation ([lib/domain/case.ts](src/lib/domain/case.ts) `instantiateCase`) — one transaction: snapshots the published version's requirement definitions into concrete `requirement` rows, creates the `party`, creates one `assignment` per requirement, and issues an `access_token` (hash stored via the existing `generateAccessToken`/`hashAccessToken` from Stage 3's seed script, reused rather than reimplemented). **Deliberately single-party per case**, even though the schema already supports multi-party — product.md's own Phase 1a list scopes "single-party assignment" and defers "multi-party assignment" to Phase 1b; building a multi-party case-creation UI now would be ahead of the product doc's own sequencing.
- [x] Case list ([dashboard/page.tsx](src/app/(app)/dashboard/page.tsx), replacing the Stage 4 stub) and case detail ([cases/[caseId]/page.tsx](src/app/(app)/cases/[caseId]/page.tsx)) — genuinely data-backed: template name, recipient, and a real per-requirement fulfilment-status readout, not a placeholder. Deliberately **not** the richer "what's blocking this case" computation (bounced deliveries, days-open, etc.) — that's explicitly Stage 9's job per the plan; Stage 5 only needed to stop the dashboard being a stub.
- [x] Verified two ways: (1) a unit-level guarantee in the domain layer — `updateRequirementDefinition`/`deleteRequirementDefinition`/`addRequirementDefinition` all throw on a non-draft version, so a published version literally cannot be mutated in place; (2) a full Playwright journey ([e2e/stage5-templates-cases.spec.ts](e2e/stage5-templates-cases.spec.ts)) that creates a template, publishes it, instantiates a case, **then** creates a new draft version and deletes one of its two requirements, and confirms the already-instantiated case still shows both of its original requirements untouched — the actual non-negotiable, exercised end-to-end rather than assumed from the domain-layer logic alone.
- [x] `requireRole` (built in Stage 4, unused until now) gets its first real call sites: archiving a template and publishing a version are owner-only; creating templates/requirements/cases and creating a new draft version remain available to any workspace member.
- [x] Extracted the `GATHER` wordmark into a shared [`Logo`](src/components/ui/logo.tsx) component and added [`AppHeader`](src/components/app-header.tsx) (wordmark + Cases/Templates nav + workspace name + role + sign-out) — resolves two previously-tracked known gaps ("only one Logo consumer," "no nav between dashboard and a second page") as a direct consequence of Stage 5 giving the app its first real multi-page navigation surface.
- [x] Fixed an unrelated environment blocker hit while running `db:generate`: `pnpm-workspace.yaml` had a literal placeholder (`esbuild: set this to true or false`) instead of real values for pnpm's build-script-approval gate, which made every `pnpm` script relying on a dependency install step fail outright. Set both `esbuild` and `unrs-resolver` to `true` (both are well-known toolchain dependencies — esbuild's postinstall fetches its platform binary, unrs-resolver backs ESLint's resolver) — not a Stage 5 feature, but nothing in this stage's verification could run until it was fixed.
- [x] Full `tsc --noEmit`, `eslint .`, `vitest run`, `playwright test` (all three specs, Stage 4's two plus the new Stage 5 one), and a full `next build` all green.

**2026-08-30, later same day — `/templates/new` redesigned per explicit product feedback** (the original two-step "name the template, then land on its detail page to add requirements" flow persisted a template with zero requirements the moment the name-only form was submitted):

- [x] `/templates/new` is now one page: template name plus a live-editable list of requirements, submitted together in a single server action ([lib/domain/template.ts](src/lib/domain/template.ts) `createTemplateWithRequirements`, one transaction — template + draft version + all requirement rows or nothing). The old name-only `createTemplate` domain function and its `createTemplateAction` are deleted, not deprecated — nothing else called them.
- [x] **No template is ever persisted with zero requirements** — the client keeps the whole draft in local state until submit; the server action validates a non-empty array (and a title on every row) and returns `{ error }` instead of writing anything if that fails.
- [x] This required breaking from the rest of the app's plain `<form action={serverAction}>` / FormData pattern: a dynamic add/remove/reorder list needs client state, so [new-template-form.tsx](src/app/(app)/templates/new/new-template-form.tsx) is a `'use client'` component that calls the server action directly with a typed object (`createTemplateWithRequirementsAction(input)`) and does `router.push()` on success — a deliberate, scoped exception to the project's minimal-client-JS default, not a drift away from it. One incidental benefit: validation errors now render inline via React state instead of a redirect-with-`?error=`-query-param round trip, so a failed submit no longer wipes the requester's in-progress rows (the old pattern used elsewhere in the app still does lose form state on error, which is an acceptable tradeoff there since those forms are single-field).
- [x] `Sequence` (a raw number input) removed — order is now the array position, changed via either a native HTML5 drag handle or (for keyboard/no-mouse use) explicit up/down icon buttons on every row, both driving the same reorder function.
- [x] Answer type field only renders when Action type is "Answer" — real conditional rendering, replacing the old always-visible-with-a-caveat-label workaround from before this page had client JS available to it.
- [x] Instructions, acceptance criteria, and sensitivity moved behind a per-row `<details>` "More options" disclosure (zero extra JS — native element) so a fresh row starts as one compact line (drag handle, title, action type, required toggle, remove) instead of every field stacked full-width — direct response to "the form is too boring and feels too heavy."
- [x] Action type is now a [`SegmentedButtons`](src/components/ui/segmented-buttons.tsx) control (Upload / Answer / Acknowledge) built directly against the canonical M3 segmented-button spec (m3.material.io/components/segmented-buttons), since `design-revised.md` doesn't cover this component — per the doc's own Source-of-Truth Order, current M3 guidance is next in line. Real state-layer hover (no background-alpha), outer pill shape built from per-button border/radius rather than a clipping `overflow-hidden` container (which would also clip the focus ring), and a leading checkmark on the selected segment so selection isn't color-only (§72).

**2026-08-30, second pass — card layout and Required control redesigned per explicit follow-up feedback:**

- [x] Card layout restructured: top row is drag handle + reorder arrows + title + a remove (✕) button at the card's top-right corner; the segmented action-type control now sits on its own row directly below the title (it competed with the title for width when they shared a row); the bottom row holds "More options" on the left and the Required control on the bottom right.
- [x] **Required is now a [`Switch`](src/components/ui/switch.tsx)**, not a checkbox — built directly against the canonical M3 switch spec (m3.material.io/components/switch), again since `design-revised.md` only names Switch in §40's form-control inventory without a spec. Track is 52×32dp (`w-13 h-8`, exact canonical-scale matches, not arbitrary values); the thumb genuinely grows 16px → 24px between off/on (the real M3 tell, not just a color change), shows a checkmark when on (§72 — not color-only), and its disabled state uses separate reduced-opacity container/thumb colors rather than one blanket `opacity-*` on the whole control (§10's named anti-pattern).
- [x] Verified end-to-end, not just visually: extended the Stage 5 Playwright lifecycle test to toggle the switch off for one requirement (asserting `aria-checked` flips), submit, and confirm the created template actually renders that requirement as "(optional)" — proving the value round-trips through the server action into the database, not just that the control looks right in the browser. Also caught and fixed a strict-mode Playwright selector collision this surfaced (`(optional)` text matching both the label and two unrelated "Instructions (optional)" / "Acceptance criteria (optional)" field labels).
- [x] Re-verified with a fresh screenshot after the relayout (previous screenshot is now stale) plus a console-error check. Full `tsc --noEmit`, `eslint .`, `vitest run`, `next build`, and all four Playwright specs green.
- [x] **Real bug caught by actually loading the page in a browser, not just by the automated test suite passing**: the initial row's React key was `crypto.randomUUID()`, evaluated inline in the `useState` initializer. That runs once during the server render and once again during client hydration — two independent random calls, two different ids — which produced a hydration mismatch on every single load of the page (visible as Next's dev-mode "1 Issue" indicator, and a real hydration-mismatch console error). Fixed by giving the very first row a stable literal key (`'initial'`) instead, since only *that* row's creation is shared between server and client; every row added later happens purely in a client event handler (the "Add requirement" button), where a fresh random key is safe. Re-verified with a Playwright-driven console-error check (zero errors) after the fix, not just re-running the existing DOM-assertion tests, since they wouldn't have caught a hydration warning either.
- [x] Verified: two new/updated Playwright cases in [e2e/stage5-templates-cases.spec.ts](e2e/stage5-templates-cases.spec.ts) — the main lifecycle test now builds a template through the new single-page flow (including selecting "Answer" via the segmented control and confirming the Answer-type select only appears once selected), and a dedicated second test confirms submitting with zero requirements is rejected with an inline error (no navigation, nothing written) and that the up/down reorder buttons actually swap row order. Also visually inspected a full-page screenshot of a populated form. Full `tsc --noEmit`, `eslint .`, `vitest run`, `next build`, and all four Playwright specs green.
- **On "why does Sensitivity exist"** (asked directly, answered here for the record): `requirement.sensitivity` is the Stage 2 non-negotiable data seam for §4.7's risk-tiered authentication ladder (magic link → link+email reverify → link+OTP → OTP+out-of-band) — it's per-requirement metadata that has to be captured at definition time because it can't be reconstructed later ("was this the tax-ID upload or the address field" isn't recoverable after the fact). It does nothing enforceable yet (Phase 1a only ever issues the lowest `link` auth tier regardless of this value) — it's schema-ready, not feature-complete. Kept in the UI (now demoted into "More options" rather than a top-level field) rather than removed, since hiding it entirely would mean nowhere to set it before step-up auth actually ships and every existing/future requirement would need a later backfill pass.

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

**2026-08-30: `design-revised.md` supersedes `design.md` as the source of truth for all UI work, per explicit user instruction.** An audit of everything built through Stage 4 found several direct contradictions — not just gaps — between what `design.md` said to do and what `design-revised.md` says is correct. The token foundation and all three existing primitives were rebuilt the same day; the items below reflect the rebuilt state, not the original Stage 4 delivery.

**Contradictions found and fixed** (old doc said do X, new doc names X as an anti-pattern):
- [x] Button hover/active states no longer change background alpha (`bg-md-primary/90` was the old pattern, explicitly called out in §9 as unpredictable when it mixes with whatever sits behind the element). Now a real overlay state-layer at 8%/12% opacity, unchanged base container — see `Button` below.
- [x] Removed `active:scale-95` from all buttons (§24: "a 5% scale reduction is often visually excessive... not a universal Material requirement"). State-layer + elevation is now the only press feedback; no scale at all, which §24 lists as the preferred order before reaching for spatial feedback.
- [x] Removed `transition-all` and the blanket 300ms duration from every interactive element (§23, §82 both name this directly). Buttons/inputs now transition only the specific property that changes (`transition-shadow`, `transition-colors`, `transition-opacity`), using the new spatial/effects duration tokens.
- [x] Error messaging no longer uses Tertiary (`bg-md-tertiary/10 text-md-tertiary` was the old pattern; §8 and §82 both name "tertiary as a substitute for error" directly as wrong). A real Error color family now exists and is used, with a text prefix ("Error: ...") so color isn't the only indicator (§39, §72).
- [x] Card radius corrected from 24px ("Large") to 12px ("Medium") for the three existing product-UI cards (sign-up, sign-in, dashboard) — §35 reserves 24px+ for marketing/hero surfaces specifically, and puts ordinary product UI at Medium.

**Token foundation rebuilt in `globals.css`** (was 11 color tokens with no error family, no elevation tokens, no type scale, no motion-token split; now):
- [x] Full required color-role families (§4.1): primary/secondary/tertiary/error, each with base + on- + container + on-container; full surface hierarchy (surface, surface-dim, surface-bright, surface-container-lowest through -highest, on-surface-variant, inverse-surface/on-surface/primary); outline + outline-variant; scrim + shadow. (Fixed accent roles — `*-fixed`/`*-fixed-dim` — deliberately skipped as optional.) Exact hex values from §5's published table; `surface-dim`/`surface-bright`/`scrim`/`shadow` (not enumerated in §5) sourced from the published M3 baseline scheme for this exact seed, documented inline in `globals.css` rather than invented.
- [x] Named Material type scale (§12) — all 15 roles (`text-display-large` through `text-label-small`), each pairing font-size + line-height via Tailwind v4's `--text-<name>--line-height` companion key; weight applied per-usage per a table documented in `globals.css` (400 for display/headline/title-large/body, 500 for title-medium/small/label-*). Verified the paired-line-height mechanism actually compiles correctly (checked generated CSS directly, not assumed).
- [x] Real elevation-level shadow tokens (§20) — `shadow-elevation-0` through `-5`, actual dual key+ambient-shadow Material values, not Tailwind's generic `shadow-sm/md/lg` treated as if they were the same thing (§82 names this directly).
- [x] Motion duration tokens split spatial vs. effects (§22-23) — `--duration-effects-fast/default/slow` and `--duration-spatial-fast/default/slow`. Note: Tailwind v4 has no themable `--duration-*` named-utility namespace (unlike color/radius/shadow/text) — these are referenced via the `duration-(--duration-effects-fast)` CSS-variable-reference syntax, confirmed working by inspecting compiled CSS.
- [x] State-layer opacity tokens (§9) — `--opacity-state-hover/focus/pressed/dragged` (8%/12%/12%/16%), referenced the same way (`opacity-(--opacity-state-hover)`).
- [x] Shape scale renamed to canonical Material naming, overriding Tailwind's own default radius scale directly rather than keeping a parallel `md-`-prefixed namespace (shape isn't a brand concern the way color is): `rounded-xs`(4) `rounded-sm`(8) `rounded-md`(12, standard-card baseline) `rounded-lg`(16) `rounded-xl`(24) `rounded-2xl`(32) `rounded-3xl`(36) `rounded-4xl`(48, the last three being Gather's expressive marketing-only additions per §16).
- [x] `body` background/text now use `--color-md-surface`/`on-surface` (the `md-background`/`md-on-background` names from the old doc no longer exist as tokens — confirmed no stale references remain anywhere in `src/`).
- [ ] Dark theme — intentionally scoped out for now, per the final checklist's explicit "exists or is intentionally scoped out" allowance. Revisit when a real need appears; generate a proper dark scheme from the same seed rather than inverting these values (§6).
- [ ] Fixed accent roles (`primary-fixed` etc.) — skipped as optional, per user's explicit scope choice for this rebuild.
- [ ] Emphasized typography variants (§13) — skipped; nothing built yet needs the hero-statement/important-metric treatment they're for.

**Primitives rebuilt in `src/components/ui/`:**
- [x] `Button` ([button.tsx](src/components/ui/button.tsx)) — filled/tonal/outlined/text variants (Elevated and FAB omitted until something needs them, per §28/§33's "don't reach for these just because"). Real state-layer overlay via an `aria-hidden` absolutely-positioned span, opacity-0 by default, `group-hover:opacity-(--opacity-state-hover)` / `group-active:opacity-(--opacity-state-pressed)` — content sits in its own `relative z-10` span to paint above the overlay (verified this is actually necessary: absolutely-positioned siblings paint after static in-flow content in the default CSS stacking order, so without the explicit z-index the overlay would sit on top of the button's own text).
- [x] `Card` ([card.tsx](src/components/ui/card.tsx)) — filled/outlined variants, `rounded-md` (12px) default, non-interactive by construction (no hover shadow/scale baked in — §36).
- [x] `TextField` ([text-field.tsx](src/components/ui/text-field.tsx)) — top-corner radius corrected to `rounded-t-xs` (4px, the canonical M3 filled-field shape; the old doc's 12px was an arbitrary guess). Added `errorMessage`/`supportingText` props, `aria-invalid` + `aria-describedby` programmatic association, and a text-prefixed error message so color isn't the sole indicator.
- [x] `cn()` helper added ([lib/cn.ts](src/lib/cn.ts), `clsx` + `tailwind-merge` v3) — **caught a real bug** while wiring `Card` into the sign-up page: a component's own default (`p-6`) and a caller's override (`p-8`) were both landing in the class string with no defined winner, since plain string concatenation can't resolve conflicting Tailwind utilities. All three primitives now merge classes through `cn()` instead of raw template strings.
- [ ] `Chip`, `StatusPill`, `FAB` — still unbuilt, add when a real consumer needs them.
- [x] Icons — `react-icons/md` (Google Material Symbols/Icons, matching §79's "coherent Material-oriented icon family") added 2026-08-30 across every page built so far: `AppHeader` nav + sign-out, all primary/destructive buttons (add/create/publish/archive/edit/delete/save/send/sign-in/sign-up), action-type icons on requirement rows (upload/answer/acknowledge), version-status icons (draft/published/archived), fulfilment-status icons on the case detail page (pending/viewed/in-progress/submitted/waived/cancelled), and every error banner (`MdError`). Sized `h-4.5 w-4.5` (18px, inline with button/label text) or `h-5 w-5`/`h-6 w-6` (20-24px, standalone section/empty-state icons), per §61/§79's "visible icon size ≠ interaction target size" and the 18/20/24px guidance. Every icon paired with visible text is `aria-hidden="true"` — the text remains the accessible name and the sole thing screen readers announce, so icons are reinforcement, never the only indicator (§72, §75).

**Known partial gaps in the rebuilt primitives** (real, not hidden — see also "Known gaps" below):
- [~] `TextField` label sits statically above the field rather than animating as a true floating label (part of §38's anatomy, not implemented).

**Marketing/product distinction (§81, §62) applied:** no atmospheric blur/gradient/glassmorphism/hover-lift decoration has been added anywhere — correctly, since nothing built so far is a marketing/hero surface. The recipient page's planned restraint (skip heavy decoration, render fast on a weak connection) turns out to already be the new doc's default for *all* product UI, not a special-cased exception.

**Verified:** `tsc --noEmit`, `eslint .`, `vitest run`, `playwright test` (both Stage 4 e2e specs, unchanged assertions still pass against the new markup), and a full `next build` all green after the rebuild. Spot-checked the actually-compiled CSS (not just the source) for `text-display-large`'s paired line-height, `shadow-elevation-1`'s dual-shadow value, `opacity-state-hover`, the overridden `rounded-md`, and the `duration-(--var)` / `rounded-(--var)` reference syntax — all confirmed correct, not just assumed from Tailwind's docs.

---

## Roadmap seams (not built now, but schema/interfaces must not block them later)

- [x] Signing: `signature_envelope` table exists, `sign` in `action_type` enum, `ESignAdapter` interface defined with no implementation
- [x] Banking details: `auth_level` enum includes `otp_out_of_band`; `requirement.sensitivity` includes `banking` — no field-level encryption or out-of-band verification flow built yet (correctly deferred)
- [x] Aadhaar: no column anywhere accepts a raw government ID; architectural rule documented in the plan — nothing to build until Phase 2's CCA-provider integration
- [x] AI extraction: seam is `submission_version` immutability + `file_asset.sha256_hash`; no `extraction` table yet (add when this feature is actually scheduled)
- [x] Conditional logic: `requirement_definition.visibility_condition` (jsonb, nullable) exists, unevaluated
- [ ] Requester-facing notifications: `NotificationPreference`, `Notification`, `MessageTemplate` entities, `reminder_dispatch.trigger_type`, the per-case Notifications tab (Sent/Scheduled/Send now), and the `@`/`#` mention system — all specified in product.md's "Notification and reminder model" (§5), none built yet. Targeted for Phase 1b. WhatsApp/SMS template-approval (Meta review, India DLT registration) is a real-world lead-time dependency for two of the three channels and should start well before Phase 1b needs it.
- [ ] Payments: no tables yet — deliberately deferred, bounded context, not started
- [x] Integrations: `audit_event` is the append-only stream future webhooks will read; no consumer built yet

## Cross-cutting verification (from the plan's Verification section)

- [x] Clean-start command works: `docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev`
- [x] Playwright installed and configured ([playwright.config.ts](playwright.config.ts)) — three specs live so far ([e2e/stage4-auth.spec.ts](e2e/stage4-auth.spec.ts), [e2e/stage4-isolation.spec.ts](e2e/stage4-isolation.spec.ts), [e2e/stage5-templates-cases.spec.ts](e2e/stage5-templates-cases.spec.ts)), covering Stages 4–5 rather than the plan's two full product journeys yet (those need Stage 6's recipient page and Stage 7's review flow to exist first)
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
- **`auth.ts` schema was hand-written and had a real bug** (missing `account.issuer`), found and fixed in Stage 4 by reading `@better-auth/core`'s source directly rather than running `better-auth generate` (the CLI package was never installed). Low but nonzero residual risk: a future Better Auth minor version bump could shift the schema again in a way this project won't catch until something breaks at runtime, since there's no automated check against the library's actual schema — worth revisiting if `better-auth` is ever upgraded.
- **`src/lib/auth-client.ts` is currently dead code.** Built per the original plan sketch, but the sign-up/sign-in/sign-out flows ended up as server actions calling `auth.api.*` directly instead (less client JS, consistent with the recipient-page precedent). Fine to leave for whichever later stage wants client-side session reactivity, but if that never happens it should eventually be deleted rather than left as an unused, silently-rotting file.
- ~~**Three buttons, one styling, zero shared component.**~~ **Resolved 2026-08-30** during the design-revised.md rebuild — extracted into `src/components/ui/button.tsx`, all three call sites now use it.
- **`TextField`'s label doesn't float.** It's a real `<label>`, correctly associated, but sits statically above the input rather than animating into the field per §38's full filled-field anatomy. Secondary piece of the spec, not urgent, but a real gap if a future reviewer checks this component against §38 line-by-line.
- ~~**Only one component consumes the Logo spec.**~~ **Resolved 2026-08-30** during Stage 5 — extracted into `src/components/ui/logo.tsx`; `page.tsx` and the new `AppHeader` both consume it.
- **Recipient link is shown once via a `?newToken=` query parameter** ([cases/[caseId]/page.tsx](src/app/(app)/cases/[caseId]/page.tsx)), following the same pattern already used for `?error=` messages elsewhere in the app. This is a real, deliberate tradeoff, not an oversight: it keeps the "no client JS" pattern for the case-creation flow, but a magic link to a case's documents sitting in a query string means it can land in the requester's own browser history and, if any analytics/logging is ever added to this app, potentially a server access log. Acceptable for Phase 1a's local-first, no-real-sensitive-data stage; should move to a flash-cookie or a client-side `useActionState` (never touching the URL) before this app ever issues links to real client documents.
- **Case-list and case-detail queries are N+1** ([lib/domain/case.ts](src/lib/domain/case.ts) `listCases`, and the equivalent pattern already established in `listTemplates`). Deliberate, matching the existing `listTemplates` precedent from before this stage, and fine at the product doc's own target scale (accounting practices with 20–200 clients) — revisit with a proper join if a workspace's case count ever makes this the app's real bottleneck.
- **`Select` primitive has no conditional field display.** The requirement-definition form always shows the "Answer type" select even when action type isn't "Answer" (labeled to say so) rather than hiding it via client JS — a deliberate no-JS tradeoff for now, not a bug; revisit if the form grows enough fields that this becomes confusing rather than just slightly redundant.
- **`pnpm-workspace.yaml`'s `allowBuilds` had a literal unfilled placeholder** (`esbuild: set this to true or false`) that silently blocked every `pnpm` script needing a dependency install. Fixed by setting real `true` values for both listed packages (Stage 5); flagging here in case a future new dependency triggers the same prompt and needs the same one-line fix.
- **`--duration-*` and `--opacity-state-*` aren't real Tailwind named-utility namespaces** (confirmed by testing — only `--color-*`, `--radius-*`, `--text-*`, `--shadow-*` support the `--namespace-<name>` → `<utility>-<name>` generation pattern in this Tailwind v4 version). Referencing them via `duration-(--duration-effects-fast)` / `opacity-(--opacity-state-hover)` works and is verified in compiled CSS, but it's more verbose than the color/radius/shadow tokens and easy to typo without a wrapper. If this pattern gets used in many more components, consider a small `cn()`-adjacent helper or documenting the exact syntax more prominently.
