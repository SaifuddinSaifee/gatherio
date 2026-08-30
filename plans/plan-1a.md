# Gather.io — Phase 1a Build Plan

## Context

`/Users/saifsaifee/Projects/gatherio` currently contains three documents and no code. This plan turns them into a running application.

The product is **external request completion software**: a requester defines a reusable procedure once, instantiates it as a *case* per counterparty, and the system owns that case until every item has been submitted, reviewed, and accepted. The external participant never creates an account — one link, only what they still owe.

The product doc is emphatic that the differentiation is **structural, not featural** — multi-party cases, the rework loop as a first-class event, and recurrence with carry-forward are schema decisions that are cheap now and expensive to retrofit. So the schema in the first migration models all three even though Phase 1a only ships single-party collection. Everything else follows the doc's Phase 1a list (§10).

**Decisions taken (confirmed with the user):**
- **India-first, US as expansion.** DPDP as the compliance story, WhatsApp is a real channel, e-sign will be Digio/Leegality/Zoho Sign when Phase 2 arrives.
- **Next.js (App Router) + TypeScript + Drizzle + Postgres**, per techstack.md.
- **Full Phase 1a scope.**
- **Cloudflare R2** for object storage.
- **Local-first with adapters** — Docker Postgres, filesystem storage, Mailpit. No cloud accounts or API keys needed to run it.

**Not in Phase 1a, but sequenced before MVP** (see *Roadmap seams* below): native signing, banking-detail collection, Aadhaar, AI extraction, conditional logic, payments, integrations. Phase 1a does not build these, but it leaves a named seam for each so none requires a schema rewrite.

**Still out of scope entirely:** persistent recipient accounts (they contradict the core thesis) and a generic automation builder.

### One open decision: storage residency

R2 has no India jurisdiction. It provides *location hints* (APAC included) but binding jurisdictional guarantees only for EU and FedRAMP. techstack.md offered R2 "if residency is loose," so this choice sets residency as loose — defensible, since DPDP permits cross-border transfer except to blacklisted countries and is not a localization mandate, and R2's zero egress materially helps a product whose core actions are downloads and ZIP exports.

The risk is commercial rather than legal: accounting practices holding client tax documents will ask where those documents live, and techstack.md notes that moving jurisdiction after real documents are in the bucket is a migration plus a customer conversation. The storage adapter keeps the endpoint a config change, so the fallback to S3 ap-south-1 stays open — but that answer should be chosen before the first pilot, not discovered during one.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 App Router, TypeScript strict, React 19 |
| DB | Postgres 16 (Docker locally), Drizzle ORM + drizzle-kit migrations |
| Jobs | pg-boss on the same Postgres, separate worker process |
| Styling | Tailwind v4 (`@theme` tokens), Material You per design.md |
| Auth | Better Auth (requester users only) |
| Storage | Cloudflare R2, private bucket, S3-compatible API |
| Uploads | Uppy client → presigned multipart (R2 in prod, signed local route in dev) |
| Validation | Zod at every trust boundary |
| Testing | Vitest (unit/integration), Playwright (the two critical journeys) |

Local toolchain verified present: Node 22.21, pnpm 11.24, Docker 29.1, psql 16.10.

**Status: Stages 1–5 built and verified.** Tracked in detail in `CHECKLIST.md` at the repo root.

---

## Stage 1 — Foundations

Scaffold `pnpm` project, Next.js App Router, TypeScript strict mode, ESLint/Prettier, `docker-compose.yml` with Postgres + Mailpit, `.env.example`, `README.md` with a one-command start.

Process split: `next` web process and a `worker` process (`src/worker/index.ts`) that both read the same env and share `src/db` and `src/lib`.

**Directory shape:**
```
src/
  app/(app)/…          requester dashboard, authenticated
  app/r/[token]/…      recipient page, server-rendered
  app/api/…            upload routes, webhooks
  db/schema/           one file per entity group
  db/scoped.ts         workspace-scoped query gateway
  lib/adapters/        storage, notify, scan, esign
  lib/domain/          state machines, reminder policy, carry-forward
  worker/jobs/         reminder, scan, export
  components/          UI primitives (Material You)
```

## Stage 2 — Schema and tenant isolation

This is the stage that must be right; the rest is recoverable.

**Entities** (per product doc §5): `workspace`, `user`, `workspace_member`, `workflow_template`, `template_version`, `requirement_definition`, `case`, `party`, `ledger_subject`, `requirement`, `assignment`, `submission_version`, `submission_answer`, `file_asset`, `review`, `document_validity`, `reminder_policy`, `reminder_dispatch`, `delivery_attempt`, `access_token`, `audit_event`, `signature_envelope` (table only, unused until Phase 2).

**Five independent status axes** (§4.2) — separate columns, never one enum:

| Axis | Values |
|---|---|
| Fulfilment | `pending, viewed, in_progress, submitted, waived, cancelled` |
| Review | `not_required, unreviewed, approved, changes_requested, rejected` |
| Validity | `not_applicable, current, expiring, expired` |
| Delivery | `queued, sent, delivered, bounced, suppressed` |
| Signature | `not_sent, opened, signed, declined, voided, expired` |

**Non-negotiable modelling choices, each from the doc:**
- `workspace_id` on **every** table from the first migration.
- `assignment` is its own entity joining requirement × party — never collapsed into requirement (§5, "the single most expensive shortcut available here").
- `submission_version` is append-only with `supersedes_submission_id`. Nothing is ever overwritten.
- `document_validity` hangs off `submission_version` and points at a **subject** (`ledger_subject_id`), not at the request item that happened to collect it (§4.3). This is what makes carry-forward possible later.
- `party.ledger_subject_id` lets a party persist across recurring cases.
- `review.reason` is structured input to the next reminder, not a note (§5).
- `audit_event` is append-only with `previous_event_hash`/`event_hash` columns present but chaining deferred.
- **Risk-tiered authentication is modelled now, enforced later.** `workspace.default_authentication_policy`, `requirement.sensitivity`, and `access_token.auth_level` exist from the first migration, implementing §4.7's ladder (magic link → link + email re-verification → link + OTP → OTP + out-of-band verification). Phase 1a only ever issues the lowest tier, but because banking-detail collection and Aadhaar eSign are now pre-MVP, step-up becomes a policy lookup against existing columns rather than a schema migration under deadline.

**Tenant isolation** — `src/db/scoped.ts` exposes the only query surface the app may use. It takes a branded `WorkspaceId` and returns a Drizzle instance with every workspace-scoped table pre-filtered. Direct `db.select()` on those tables is blocked by an ESLint `no-restricted-imports` rule. techstack.md's point stands: a solo builder will eventually forget a `WHERE` clause, so make the forgetting harmless.

**Audit writes happen in the same transaction as the state change.** `withAudit(tx, event)` in `src/db/audit.ts` — not a background write, not a log line.

## Stage 3 — Adapters

Interfaces first, local implementations second, cloud implementations left as stubs that will be filled in when the region and providers are provisioned.

- **Storage** — `presignUpload / presignDownload / complete / delete`. Local implementation signs a token for `/api/upload/[token]` so the client code is identical in both environments. Key format is fixed at `{workspace_id}/{case_id}/{submission_version_id}/{uuid}`; the real filename lives only in the DB. Bucket private, every read a short-lived signed URL, downloads logged as audit events.

  **R2 specifics that differ from S3 and will otherwise cost debugging time:** it is S3-compatible, so `@aws-sdk/client-s3` works pointed at the account endpoint with `region: "auto"` — but bucket CORS must be configured explicitly before browser multipart uploads succeed, and R2 has no S3 event notifications, so the malware-scan job is enqueued by our own `complete` call rather than by a bucket event. Config surface is endpoint + bucket + key pair, which keeps the S3 ap-south-1 fallback a config change rather than a code change.
- **Notify** — `send(channel, recipient, templateRef, variables)`. Message bodies are **template reference + variables, never free text**, because WhatsApp outside the 24-hour window only permits pre-approved templates (techstack.md §51). Local channel writes to Mailpit and the console.
- **Scan** — `scan(fileAssetId)`. Local returns clean immediately; files stay `quarantined` and undownloadable until a scan returns, so the state machine is exercised from day one.
- **ESign** — interface only, no implementation.

## Stage 4 — Requester auth and workspace

### Why this section is more detailed than the others

Before writing code, `node_modules/better-auth` was read directly (source, not docs) to check the schema hand-written in Stage 2 (`src/db/schema/auth.ts`) against what the installed version (1.7.2, resolved from the `^1.2.0` pin — a large jump) actually requires. That surfaced a **real bug**: the `account` table is missing an `issuer` column that Better Auth's sign-up/sign-in code writes unconditionally and without a default (`createLocalAccountIssuer("credential")`, i.e. the literal string `"local:credential"`). Every email/password sign-up would fail a NOT NULL constraint against the current schema. It also surfaced a genuine architecture choice — Better Auth ships an official `organization` plugin that is a plausible alternative to the hand-rolled `workspace`/`workspace_member` tables — which is decided below rather than left open, since Stage 2's 25 tables already depend on the answer.

### Decision: keep hand-rolled `workspace`/`workspace_member`, do not adopt Better Auth's `organization` plugin

Better Auth's `organization` plugin (built into the core package, no extra install — `better-auth/plugins/organization`) provides `organization`/`member`/`invitation` tables, multi-org membership, and an `activeOrganizationId` column it adds to `session`. It would hand us invite flows and multi-workspace membership for free.

Not using it, because:
- Our `workspace` table already carries product-specific typed columns — `billing_plan`, `retention_policy_days`, `default_authentication_policy` (the §4.7 auth-ladder default, a Stage 2 "non-negotiable"). The plugin's `organization` table has no equivalent typed columns, only an untyped `metadata` JSON blob — using it would mean either downgrading `default_authentication_policy` to stringly-typed JSON or bolting a second table onto the plugin's table anyway, which gives up the plugin's main convenience.
- All 25 tables built in Stage 2 already reference `workspace.id` (uuid). Switching now means re-pointing every FK at a Better-Auth-managed `organization.id` (text) and redoing the already-migrated-and-tested schema for a plugin whose main benefit — invitations, multi-org switching — isn't in scope for Stage 4 (no invite flow is being built yet; see the workspace-switcher note below).
- "Workspace" is the vocabulary used everywhere already — product.md, techstack.md, every schema file, `CHECKLIST.md`. Renaming to "organization" purely to match a library's internal naming is churn with no product benefit.

Better Auth is therefore scoped narrowly to what it's actually for: authenticating requester users (`user`/`session`/`account`/`verification`). "Workspace" stays entirely our own concern, created by our own application code immediately after a Better Auth sign-up succeeds.

### Fix `src/db/schema/auth.ts` before building on it

Corrections, each confirmed against `@better-auth/core`'s `buildAuthTables()` (the function both the runtime adapter and the schema-gen CLI read from):

- **`account` table** (the breaking one): add `issuer` (`text`, **not null**, no DB default — Better Auth's application code always supplies it). Replace the single `expiresAt` column with two nullable columns, `accessTokenExpiresAt` and `refreshTokenExpiresAt`. Add `scope` (nullable text). Add a composite **unique index on `(issuer, accountId)`** — not a bare unique on `accountId`.
- **`session` table**: add a (non-unique) index on `userId`.
- **`verification` table**: add a (non-unique) index on `identifier`.
- Keep `timestamp(..., { withTimezone: true })` as already written, even though Better Auth's own generator emits timezone-less timestamps by default — a deliberate improvement, not a bug, and functionally compatible with how Better Auth reads/writes these columns.

Because nothing has shipped yet and only seed data exists locally, regenerate a clean single initial migration (delete `drizzle/` and re-run `drizzle-kit generate`) rather than layering an ALTER migration onto a migration that was never real — cleaner history for a schema that hasn't left this machine.

### Dependency fix

`@better-auth/drizzle-adapter@1.7.2`'s peer dependency requires `drizzle-orm ^0.45.2`; this project has `0.38.4` (pnpm installed it anyway — peer warnings aren't fatal, but it's a real compatibility risk to build on). Bump `drizzle-orm` (and `drizzle-kit` alongside it) to the `^0.45` line, then re-run `db:generate` + `db:migrate` + the existing Vitest suite to confirm the version jump didn't change generated SQL or break anything already built in Stages 2–3.

### Server config, routes, session helper

- `src/lib/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: 'pg', camelCase: false }), secret: env.AUTH_SECRET, baseURL: env.APP_URL, emailAndPassword: { enabled: true }, plugins: [nextCookies()] })`. `nextCookies()` (from `better-auth/next-js`) must be last in the plugins array — it's what makes a direct server-action call to `auth.api.signUpEmail()` actually persist the session cookie onto the Next.js response, which the sign-up flow below relies on. Confirmed this version's Next-integration uses the async Next 15 `cookies()`/`headers()` API, not an older sync one.
- This file imports the raw `db` handle, which lives outside `src/db/` and would otherwise trip the tenant-isolation ESLint rule from Stage 2. That's correct to flag, not silence blindly: Better Auth's tables are legitimately unscoped (a user's identity exists before and independent of any workspace membership), so add `src/lib/auth.ts` to the rule's `ignores` list in `eslint.config.mjs` with a comment explaining why, rather than disabling the rule inline.
- `src/app/api/auth/[...all]/route.ts` — `export const { GET, POST } = toNextJsHandler(auth)`.
- `src/lib/auth-client.ts` — `createAuthClient` from `better-auth/react`, used by the sign-in/sign-up client components (`authClient.signIn.email`, `authClient.signUp.email`, `authClient.signOut`, `authClient.useSession`).
- `src/db/session.ts` (deliberately placed inside `src/db/` so it's already covered by the existing ESLint ignore list, rather than adding a second carve-out) — `getCurrentSession()` calls `auth.api.getSession({ headers: await headers() })`, then looks up the caller's `workspace_member` row via the raw `db` handle (this file is one of the few legitimate places to use it directly), returning `{ userId, workspaceId, role } | null`. This becomes the one choke point every server action and route handler uses to obtain a `WorkspaceId` for `scoped()`.

### Sign-up flow (the transactional part)

Not a single cross-library transaction — Better Auth's own user-creation commit isn't something our code can join. Instead, a server action does two steps with an explicit compensating action if the second fails:

1. `auth.api.signUpEmail({ body: { email, password, name } })`.
2. On success, our own `db.transaction()` inserts `workspace` + `workspace_member(role: 'owner')` for the new user id.
3. If step 2 throws, delete the just-created user row as compensation and surface a generic error — acceptable at Phase 1a's volume; a saga/outbox pattern would be overbuilt here.

(The exact method name — `auth.api.signUpEmail` — matches the `/sign-up/email` endpoint path confirmed during research, but its precise signature wasn't independently checked against `node_modules/better-auth/dist/api/index.d.mts`; a two-minute type-check at implementation time, not a blocker to this plan.)

### Pages

- `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/sign-in/page.tsx` — client components using `authClient`.
- `src/app/(app)/layout.tsx` — calls `getCurrentSession()` server-side, redirects to `/sign-in` if absent. No middleware-based fast path for Phase 1a; that's an optimization for later, not a correctness requirement now.
- `src/app/(app)/dashboard/page.tsx` — replace the current static stub with a minimal auth-gated smoke test: show the session's workspace name and a sign-out control. The real case-list UI is Stage 9's job, not this stage's.
- `requireRole(session, role)` helper — small and built now even though nothing calls it yet beyond the sign-up-creates-owner path, matching the plan's existing pattern of building the seam before the feature that needs it.

### Descoped from the original Stage 4 sketch: the workspace switcher

`CHECKLIST.md` had listed a workspace switcher on the theory that the schema allows multi-workspace membership. It's being dropped from Stage 4: with no invite-another-user flow built yet, sign-up is the only way a `workspace_member` row is ever created, and it always creates exactly one workspace per user. A switcher for a state that cannot occur is building for a hypothetical, not a requirement — it becomes relevant once an invite flow exists, not before.

### Verification

- Fresh sign-up via the UI creates exactly one `workspace` row and one `workspace_member(role='owner')` row — checked directly against Postgres, not just "the page didn't error."
- Sign-in with a wrong password fails with a sane error, not a 500.
- Visiting `/dashboard` unauthenticated redirects to `/sign-in`; after sign-in it loads; after sign-out it redirects again.
- A second signed-up user's session cannot resolve the first user's `workspaceId` (spot-checks Stage 2's isolation guarantee end-to-end, not just via the lint rule).
- Full `tsc --noEmit`, `eslint .`, `vitest run` green after the `drizzle-orm` bump and the schema regeneration — this is the point where a silent breakage from the version jump would show up.

## Stage 5 — Templates and cases

**Built and verified.** Full details in `CHECKLIST.md`'s Stage 5 section; summary below.

Template CRUD with versioning, where immutability is enforced by construction rather than by checking for existing case references at edit time: a `templateVersion` starts `draft` (freely mutable), `publishVersion` flips it to `active`, and every requirement-definition mutation asserts `status === 'draft'` — so a published version simply cannot be edited in place, and a case can only ever be instantiated from an `active` version. "Editing" a published template is an explicit user action (`createDraftFromLatest` clones the latest version's requirement definitions into a brand-new draft with fresh ids), never an implicit auto-clone-on-edit-attempt — that alternative was considered and rejected because it leaves real ambiguity about which definition in the clone the user meant to edit.

Requirement definitions carry `action_type` of `upload | answer | acknowledge` (`sign` deferred), plus title, instructions, required flag, sequence, acceptance criteria, and sensitivity — built via a new `Select` primitive matching `TextField`'s visual language.

Instantiating a case snapshots the template version into concrete `requirement` + `assignment` rows, creates the `party`, and issues an `access_token` — deliberately single-party per case even though the schema already supports multi-party, since product.md's own Phase 1a list scopes multi-party assignment to Phase 1b.

**Answer field types — exactly five** (§4.1): short text, long text, date, choice, yes/no. Not a form builder.

The case list (replacing the Stage 4 dashboard stub) and case detail page are genuinely data-backed but deliberately minimal — no "what's blocking this case" computation yet, since that's explicitly Stage 9's job.

Verified two ways: the domain layer's own invariant (mutation functions throw on a non-draft version) and a full Playwright journey (`e2e/stage5-templates-cases.spec.ts`) that creates a template, publishes it, creates a case, *then* edits a new draft version of the template and confirms the already-created case is completely unaffected — the actual Stage 5 non-negotiable, exercised end-to-end.

Also: extracted the GATHER wordmark into a shared `Logo` component and added an `AppHeader` nav shell, since Stage 5 is the point this app first has more than one page to navigate between; gave `requireRole` (built but unused since Stage 4) its first real call sites (archiving a template and publishing a version are owner-only).

## Stage 6 — Magic links and the recipient page

**The link mechanics matter more than they look** (§4.7, techstack.md §43):
- Store the **hash** of a high-entropy token, never the token.
- `GET /r/[token]` creates a short-lived session cookie and **never** consumes the link, records consent, or marks anything viewed. Corporate mail scanners pre-fetch every link in an email.
- Every consequential action — view acknowledgement, upload, answer, submit — is an explicit `POST` from the session.
- Tokens are revocable and expiring.

**The recipient page gets disproportionate engineering effort** (§6). It is the only surface most users of the product ever see and its completion rate is the core metric.
- Server-rendered, minimal client JS — Uppy loads only on requirement rows that need a file.
- Mobile-first, must work on a mid-range Android on a weak connection.
- Resumable across sessions: partial answers persist as `in_progress` on blur; uploads use R2 multipart so a dropped connection resumes.
- **Outstanding items first and prominent; completed items collapsed beneath and expandable** (§4.4). Hiding completed work causes the recipient to email and ask, which reintroduces exactly the chasing the product exists to remove.
- A `changes_requested` item shows the reviewer's reason inline, above the re-upload control.

## Stage 7 — Review and the rework loop

Requester approves or requests changes with a structured reason. `changes_requested` reopens **exactly one** assignment, not the case. Resubmission creates a new `submission_version` pointing at its predecessor. The reason is carried into the next reminder for that assignment only.

`src/lib/domain/case-status.ts` derives case-level status from its assignments — the case is closed only when every obligation is satisfied.

## Stage 8 — Reminders

pg-boss scheduled job reads `reminder_policy` (cadence, channels, quiet hours, stop condition, `unopened_cadence`, `stalled_cadence`).

- Reminders name **only what is missing**.
- The **unopened vs. opened-and-stalled** distinction selects materially different copy (§5).
- **Idempotency**: unique DB constraint on `reminder_dispatch (assignment_id, reminder_sequence)`. A redeploy mid-queue or a retry cannot double-send. techstack.md is right that sending a client three copies of the same chase is the exact failure the product claims to eliminate, and it is the first thing a pilot customer would notice.
- Quiet hours respected in the workspace's timezone.
- Delivery attempts recorded with provider message id; bounce/complaint webhook handler present, suppression honoured.

## Stage 9 — Dashboard and export

Case list answering **"what is blocking this case"** — not a status grid. Per case: blocking party, blocking items, days open, last recipient activity, delivery problems surfaced (a bounced invite is invisible otherwise).

ZIP export of a complete packet, generated in the worker, delivered via a short-lived signed URL, download recorded as an audit event.

## Stage 10 — Design system

**Superseded mid-build.** This section originally specified the design system from `design.md`. A revised, substantially more rigorous spec — `design-revised.md` — now supersedes it as the source of truth for all UI work; `design.md` is kept only for historical reference. `design-revised.md` explicitly corrects several things `design.md` said to do: state-layer overlays instead of background-alpha hover states (`bg-primary/90`), no `active:scale-95` (too aggressive — omit scale or use 0.98–0.99), no `transition-all`/blanket 300ms (explicit `transition-property` lists, split spatial/effects motion timing), a real semantic Error color family (Tertiary was being used as a stand-in), and "medium" (12px) as the standard-card radius for product UI rather than 24px (24px+ is reserved for marketing/hero surfaces).

The token foundation and primitives were rebuilt against `design-revised.md` once this was caught (see `CHECKLIST.md`'s Stage 10 section for the full audit and what changed). Current state: `globals.css` carries the full required color-role families (primary/secondary/tertiary/error containers, full surface-container hierarchy, outline-variant, scrim, shadow, inverse-*), a named Material type scale (`text-display-large` … `text-label-small`), real elevation-level shadow tokens (`shadow-elevation-0`–`5`, not raw Tailwind `shadow-sm`/`md`), spatial/effects motion duration tokens, and state-layer opacity tokens. Dark theme is intentionally scoped out for now (an explicitly allowed option per the new doc's final checklist) — revisit when a real need appears.

Component primitives in `src/components/ui/`: `Button` (filled/tonal/outlined/text, real state-layer overlay, no scale feedback), `Card` (filled/outlined, medium radius, non-interactive by construction), `TextField` (filled style, corrected 4px top-corner radius, error state with text-based indicator + `aria-describedby`, not color-only). `cn()` (`clsx` + `tailwind-merge`) added in `src/lib/cn.ts` so component-default classes and caller overrides resolve correctly instead of both landing in the class list unresolved. `Chip`, `StatusPill`, `FAB` remain unbuilt — add when a real consumer needs them.

Any atmospheric/decorative techniques (blur shapes, radial gradients, glassmorphism, hover lift, image zoom) are now explicitly scoped to marketing/hero/onboarding surfaces only (`design-revised.md` §62), not applied to dense product UI — the recipient page's existing restraint (skip heavy decoration, render fast on a weak connection) was already directionally correct under the new doc, not just a performance-driven exception to the old one.

---

## Roadmap seams

These are not Phase 1a work. Each is listed with the one structural decision Phase 1a must make so that adding it later is ordinary work rather than a rewrite. The cost of every seam below is a column or an interface — cheap now, per the same logic that puts multi-party in the first migration.

**Signing.** `signature_envelope` table, `sign` in the `action_type` enum, and the `ESign` interface all exist in Phase 1a. Adding provider-backed signing is then a renderer on the recipient page plus a webhook handler — the doc's estimate is 1–3 weeks.

One correction worth making explicitly, because it changes what "before MVP" costs: *integrating* signing is weeks, *building* signature infrastructure is a company. For India this is not a preference — statutory eSign requires a CCA-empanelled provider, so the Aadhaar and DSC flows cannot be self-built at any budget. The plan mirrors provider state and never reproduces the legal model. Alongside it, §4.6's constraint holds: the claim is "electronic signatures with a defensible evidence trail for supported document types and jurisdictions," never unqualified "legally binding," and a supported-jurisdiction matrix ships with the feature.

**Banking details.** Depends entirely on the auth ladder above. Beyond step-up OTP it needs field-level encryption (separate key, not the row), restricted visibility so most requester roles never see full numbers, mandatory out-of-band verification on *change* rather than first entry, and a written customer operating policy. The fraud shape here is impersonation of a known vendor requesting a bank-detail change — the control that matters is the out-of-band step, not the encryption.

**Aadhaar.** The architectural rule is that **Gather never stores an Aadhaar number.** Aadhaar eSign is initiated through the CCA-empanelled provider (Digio/Leegality), which performs the e-KYC; we persist only the provider's envelope reference and evidence artifact. Phase 1a enforces this with a lint rule and a schema convention: no column accepts raw government identifiers, and masked display uses a `redacted` field type. Handling Aadhaar numbers directly means the UIDAI regulatory regime — licensing, audits, storage restrictions — which is a different undertaking from adding a feature.

**AI extraction.** The seam is immutability: `submission_version` is append-only and `file_asset` carries a sha256. Extraction results go in a separate `extraction` table keyed by `file_asset_id`, so extraction never mutates a submission and can be re-run or discarded. Extraction feeds the reviewer as a suggestion with a confidence value; it does not auto-approve. That keeps the review axis meaningful and keeps a wrong extraction from becoming an accepted document.

**Conditional logic.** `requirement_definition` gets a nullable `visibility_condition` JSON column in the first migration, unused. Case instantiation already snapshots definitions into concrete requirements, which is exactly the evaluation point. Recommended bound: "show requirement B when the answer to A equals X" — one hop, evaluated at instantiation and on answer change. Resist a rules engine; that is the road to the generic workflow builder the doc rejects.

**Payments.** Kept as a separate bounded context with its own tables (Razorpay for India). The only coupling is a `payment` action type letting a case block on settlement. Money does not go in the submission tables.

**Integrations.** `audit_event` is already the append-only stream that outbound webhooks read from, so no new capture layer is needed. Phase 1b's single storage export is the first consumer.

**Sequencing note.** Signing, banking details, and Aadhaar all sit downstream of the same prerequisite — the auth ladder and a real security posture. Doing that once, before any of the three, is roughly half the work of doing it three times. That argues for the order: auth ladder → signing → banking details / Aadhaar, with AI extraction and conditional logic independent and schedulable anywhere.

---

## Verification

**Runs clean from zero:**
```
docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
```
Seed creates a workspace, a user, a "Monthly Bookkeeping Close" template, and one live case with a printed recipient link.

**Two Playwright journeys — these are the product:**
1. *Happy path* — requester creates case → recipient opens link on a mobile viewport → uploads a file and answers two fields → submits → requester approves → case closes → ZIP export contains the file and the answers.
2. *Rework loop* — recipient submits → requester requests changes with a reason → recipient's page shows that reason on that one item only, other items untouched → recipient resubmits → both versions exist in history with `supersedes_submission_id` linked → next reminder for that assignment carries the reason.

**Integration tests (Vitest against a real test Postgres):**
- A query built without a workspace scope fails to compile / is caught by lint.
- A cross-workspace read returns zero rows.
- `GET /r/[token]` twice, simulating a mail scanner, leaves the assignment `pending` and records no consent.
- Running the reminder job twice over the same due assignment produces exactly one `reminder_dispatch` row.
- A state change and its audit event either both commit or both roll back.
- A file stays undownloadable while `malware_scan_status` is `quarantined`.

**Manual:** Mailpit at `localhost:8025` shows reminder copy differing between the unopened and stalled cases. Recipient page checked at 360px width with network throttled.

---

## Notes on sequencing

Stages 1–3 are the expensive-to-reverse ones and should be reviewed before Stage 4 begins. Stages 5–9 are ordinary product work and can be reordered freely.

The product doc's own closing caveat is worth restating: everything above is reasoning rather than evidence, and zero customer interviews have been conducted. This plan builds the thing the doc specifies — it does not validate that anyone will pay for it. §12 of the product doc is the parallel track.
