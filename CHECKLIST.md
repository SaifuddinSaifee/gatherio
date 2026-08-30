# Gather — Build Checklist

Tracks implementation against the approved plan at
`/Users/saifsaifee/.claude/plans/design-md-gather-io-no-account-document-twinkling-scroll.md`.
Updated as work lands — not written once and forgotten. `[x]` means built
**and verified** (typecheck/lint/test passing, or manually exercised), not
just written. `[~]` means partially done; the note says what's missing.

Legend: `[ ]` not started · `[~]` in progress / partial · `[x]` done & verified

Last updated: 2026-08-30 (design-revised.md adopted as the UI source of truth; Stage 10 token foundation and all three primitives rebuilt against it after an audit found direct contradictions with the earlier design.md)

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

**Known partial gaps in the rebuilt primitives** (real, not hidden — see also "Known gaps" below):
- [~] `TextField` label sits statically above the field rather than animating as a true floating label (part of §38's anatomy, not implemented).
- [~] Logo — spec is fully in `design-revised.md` §15 now (supersedes the `design.md` version), matches what was already built in `page.tsx` (GATHER, Saira Extra Condensed Bold, Primary color, `-0.01em` tracking). Still not extracted into a shared `Logo` component — only one consumer exists so far.

**Marketing/product distinction (§81, §62) applied:** no atmospheric blur/gradient/glassmorphism/hover-lift decoration has been added anywhere — correctly, since nothing built so far is a marketing/hero surface. The recipient page's planned restraint (skip heavy decoration, render fast on a weak connection) turns out to already be the new doc's default for *all* product UI, not a special-cased exception.

**Verified:** `tsc --noEmit`, `eslint .`, `vitest run`, `playwright test` (both Stage 4 e2e specs, unchanged assertions still pass against the new markup), and a full `next build` all green after the rebuild. Spot-checked the actually-compiled CSS (not just the source) for `text-display-large`'s paired line-height, `shadow-elevation-1`'s dual-shadow value, `opacity-state-hover`, the overridden `rounded-md`, and the `duration-(--var)` / `rounded-(--var)` reference syntax — all confirmed correct, not just assumed from Tailwind's docs.

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
- [x] Playwright installed and configured ([playwright.config.ts](playwright.config.ts)) — two specs live so far ([e2e/stage4-auth.spec.ts](e2e/stage4-auth.spec.ts), [e2e/stage4-isolation.spec.ts](e2e/stage4-isolation.spec.ts)), covering Stage 4 rather than the plan's two product journeys yet
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
- **Only one component consumes the Logo spec.** `page.tsx` implements `design-revised.md` §15 directly (GATHER, Saira Extra Condensed, correct color/tracking) but there's no shared `Logo` component yet — fine with one consumer, needs extracting before a second page wants the wordmark (e.g. a nav bar in Stage 9).
- **`--duration-*` and `--opacity-state-*` aren't real Tailwind named-utility namespaces** (confirmed by testing — only `--color-*`, `--radius-*`, `--text-*`, `--shadow-*` support the `--namespace-<name>` → `<utility>-<name>` generation pattern in this Tailwind v4 version). Referencing them via `duration-(--duration-effects-fast)` / `opacity-(--opacity-state-hover)` works and is verified in compiled CSS, but it's more verbose than the color/radius/shadow tokens and easy to typo without a wrapper. If this pattern gets used in many more components, consider a small `cn()`-adjacent helper or documenting the exact syntax more prominently.
