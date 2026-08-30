# Gather.io — Phase 1a Build Plan

## Context

`/Users/saifsaifee/Projects/gatherio` currently contains three documents and no code. This plan turns them into a running application.

The product is **external request completion software**: a requester defines a reusable procedure once, instantiates it as a _case_ per counterparty, and the system owns that case until every item has been submitted, reviewed, and accepted. The external participant never creates an account — one link, only what they still owe.

The product doc is emphatic that the differentiation is **structural, not featural** — multi-party cases, the rework loop as a first-class event, and recurrence with carry-forward are schema decisions that are cheap now and expensive to retrofit. So the schema in the first migration models all three even though Phase 1a only ships single-party collection. Everything else follows the doc's Phase 1a list (§10).

**Decisions taken (confirmed with the user):**

- **India-first, US as expansion.** DPDP as the compliance story, WhatsApp is a real channel, e-sign will be Digio/Leegality/Zoho Sign when Phase 2 arrives.
- **Next.js (App Router) + TypeScript + Drizzle + Postgres**, per techstack.md.
- **Full Phase 1a scope.**
- **Cloudflare R2** for object storage.
- **Local-first with adapters** — Docker Postgres, filesystem storage, Mailpit. No cloud accounts or API keys needed to run it.

**Not in Phase 1a, but sequenced before MVP** (see _Roadmap seams_ below): native signing, banking-detail collection, Aadhaar, AI extraction, conditional logic, payments, integrations. Phase 1a does not build these, but it leaves a named seam for each so none requires a schema rewrite.

**Still out of scope entirely:** persistent recipient accounts (they contradict the core thesis) and a generic automation builder.

### One open decision: storage residency

R2 has no India jurisdiction. It provides _location hints_ (APAC included) but binding jurisdictional guarantees only for EU and FedRAMP. techstack.md offered R2 "if residency is loose," so this choice sets residency as loose — defensible, since DPDP permits cross-border transfer except to blacklisted countries and is not a localization mandate, and R2's zero egress materially helps a product whose core actions are downloads and ZIP exports.

The risk is commercial rather than legal: accounting practices holding client tax documents will ask where those documents live, and techstack.md notes that moving jurisdiction after real documents are in the bucket is a migration plus a customer conversation. The storage adapter keeps the endpoint a config change, so the fallback to S3 ap-south-1 stays open — but that answer should be chosen before the first pilot, not discovered during one.

---

## Stack

|Layer|Choice|
|---|---|
|App|Next.js 15 App Router, TypeScript strict, React 19|
|DB|Postgres 16 (Docker locally), Drizzle ORM + drizzle-kit migrations|
|Jobs|pg-boss on the same Postgres, separate worker process|
|Styling|Tailwind v4 (`@theme` tokens), Material You per design.md|
|Auth|Better Auth (requester users only)|
|Storage|Cloudflare R2, private bucket, S3-compatible API|
|Uploads|Uppy client → presigned multipart (R2 in prod, signed local route in dev)|
|Validation|Zod at every trust boundary|
|Testing|Vitest (unit/integration), Playwright (the two critical journeys)|

Local toolchain verified present: Node 22.21, pnpm 11.24, Docker 29.1, psql 16.10.

---

## Stage 1 — Foundations

Scaffold `pnpm` project, Next.js App Router, TypeScript strict mode, ESLint/Prettier, `docker-compose.yml` with Postgres + Mailpit, `.env.example`, `README.md` with a one-command start.

Process split: `next` web process and a `worker` process (`src/worker/index.ts`) that both read the same env and share `src/db` and `src/lib`.

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

**Entities** (per product doc §5): `workspace`, `user`, `workspace_member`, `workflow_template`, `template_version`, `requirement_definition`, `case`, `party`, `ledger_subject`, `requirement`, `assignment`, `submission_version`, `submission_answer`, `file_asset`, `review`, `document_validity`, `reminder_policy`, `reminder_dispatch`, `delivery_attempt`, `access_token`, `audit_event`, `signature_envelope` (table only, unused until Phase 2).

**Five independent status axes** (§4.2) — separate columns, never one enum:

|Axis|Values|
|---|---|
|Fulfilment|`pending, viewed, in_progress, submitted, waived, cancelled`|
|Review|`not_required, unreviewed, approved, changes_requested, rejected`|
|Validity|`not_applicable, current, expiring, expired`|
|Delivery|`queued, sent, delivered, bounced, suppressed`|
|Signature|`not_sent, opened, signed, declined, voided, expired`|

**Non-negotiable modelling choices, each from the doc:**

- `workspace_id` on **every** table from the first migration.
- `assignment` is its own entity joining requirement × party — never collapsed into requirement (§5, "the single most expensive shortcut available here").
- `submission_version` is append-only with `supersedes_submission_id`. Nothing is ever overwritten.
- `document_validity` hangs off `submission_version` and points at a **subject** (`ledger_subject_id`), not at the request item that happened to collect it (§4.3). This is what makes carry-forward possible later.
- `party.ledger_subject_id` lets a party persist across recurring cases.
- `review.reason` is structured input to the next reminder, not a note (§5).
- `audit_event` is append-only with `previous_event_hash`/`event_hash` columns present but chaining deferred.
- **Risk-tiered authentication is modelled now, enforced later.** `workspace.default_authentication_policy`, `requirement.sensitivity`, and `access_token.auth_level` exist from the first migration, implementing §4.7's ladder (magic link → link + email re-verification → link + OTP → OTP + out-of-band verification). Phase 1a only ever issues the lowest tier, but because banking-detail collection and Aadhaar eSign are now pre-MVP, step-up becomes a policy lookup against existing columns rather than a schema migration under deadline.

**Tenant isolation** — `src/db/scoped.ts` exposes the only query surface the app may use. It takes a branded `WorkspaceId` and returns a Drizzle instance with every workspace-scoped table pre-filtered. Direct `db.select()` on those tables is blocked by an ESLint `no-restricted-imports` rule. techstack.md's point stands: a solo builder will eventually forget a `WHERE` clause, so make the forgetting harmless.

**Audit writes happen in the same transaction as the state change.** `withAudit(tx, event)` in `src/db/audit.ts` — not a background write, not a log line.

## Stage 3 — Adapters

Interfaces first, local implementations second, cloud implementations left as stubs that will be filled in when the region and providers are provisioned.

- **Storage** — `presignUpload / presignDownload / complete / delete`. Local implementation signs a token for `/api/upload/[token]` so the client code is identical in both environments. Key format is fixed at `{workspace_id}/{case_id}/{submission_version_id}/{uuid}`; the real filename lives only in the DB. Bucket private, every read a short-lived signed URL, downloads logged as audit events.
    
    **R2 specifics that differ from S3 and will otherwise cost debugging time:** it is S3-compatible, so `@aws-sdk/client-s3` works pointed at the account endpoint with `region: "auto"` — but bucket CORS must be configured explicitly before browser multipart uploads succeed, and R2 has no S3 event notifications, so the malware-scan job is enqueued by our own `complete` call rather than by a bucket event. Config surface is endpoint + bucket + key pair, which keeps the S3 ap-south-1 fallback a config change rather than a code change.
    
- **Notify** — `send(channel, recipient, templateRef, variables)`. Message bodies are **template reference + variables, never free text**, because WhatsApp outside the 24-hour window only permits pre-approved templates (techstack.md §51). Local channel writes to Mailpit and the console.
    
- **Scan** — `scan(fileAssetId)`. Local returns clean immediately; files stay `quarantined` and undownloadable until a scan returns, so the state machine is exercised from day one.
    
- **ESign** — interface only, no implementation.

## Stage 4 — Requester auth and workspace

Better Auth with email+password, workspace creation on signup, `workspace_member` roles (`owner`, `member`). Session resolves to a `WorkspaceId` that every server action threads into `scoped()`.

## Stage 5 — Templates and cases

Template CRUD with versioning (`template_version` is immutable once a case references it). Requirement definitions carry `action_type` of `upload | answer | acknowledge` (`sign` deferred), plus title, instructions, required flag, sequence, acceptance criteria.

Instantiating a case snapshots the template version into concrete `requirement` + `assignment` rows, creates the `party`, and issues an `access_token`.

**Answer field types — exactly five** (§4.1): short text, long text, date, choice, yes/no. Not a form builder.

## Stage 6 — Magic links and the recipient page

**The link mechanics matter more than they look** (§4.7, techstack.md §43):

- Store the **hash** of a high-entropy token, never the token.
- `GET /r/[token]` creates a short-lived session cookie and **never** consumes the link, records consent, or marks anything viewed. Corporate mail scanners pre-fetch every link in an email.
- Every consequential action — view acknowledgement, upload, answer, submit — is an explicit `POST` from the session.
- Tokens are revocable and expiring.

**The recipient page gets disproportionate engineering effort** (§6). It is the only surface most users of the product ever see and its completion rate is the core metric.

- Server-rendered, minimal client JS — Uppy loads only on requirement rows that need a file.
- Mobile-first, must work on a mid-range Android on a weak connection.
- Resumable across sessions: partial answers persist as `in_progress` on blur; uploads use R2 multipart so a dropped connection resumes.
- **Outstanding items first and prominent; completed items collapsed beneath and expandable** (§4.4). Hiding completed work causes the recipient to email and ask, which reintroduces exactly the chasing the product exists to remove.
- A `changes_requested` item shows the reviewer's reason inline, above the re-upload control.

## Stage 7 — Review and the rework loop

Requester approves or requests changes with a structured reason. `changes_requested` reopens **exactly one** assignment, not the case. Resubmission creates a new `submission_version` pointing at its predecessor. The reason is carried into the next reminder for that assignment only.

`src/lib/domain/case-status.ts` derives case-level status from its assignments — the case is closed only when every obligation is satisfied.

## Stage 8 — Reminders

pg-boss scheduled job reads `reminder_policy` (cadence, channels, quiet hours, stop condition, `unopened_cadence`, `stalled_cadence`).

- Reminders name **only what is missing**.
- The **unopened vs. opened-and-stalled** distinction selects materially different copy (§5).
- **Idempotency**: unique DB constraint on `reminder_dispatch (assignment_id, reminder_sequence)`. A redeploy mid-queue or a retry cannot double-send. techstack.md is right that sending a client three copies of the same chase is the exact failure the product claims to eliminate, and it is the first thing a pilot customer would notice.
- Quiet hours respected in the workspace's timezone.
- Delivery attempts recorded with provider message id; bounce/complaint webhook handler present, suppression honoured.

## Stage 9 — Dashboard and export

Case list answering **"what is blocking this case"** — not a status grid. Per case: blocking party, blocking items, days open, last recipient activity, delivery problems surfaced (a bounced invite is invisible otherwise).

ZIP export of a complete packet, generated in the worker, delivered via a short-lived signed URL, download recorded as an audit event.

## Stage 10 — Design system

Material You per design.md, tokens centralized in `src/app/globals.css` under Tailwind v4 `@theme` with the `md-` prefix the doc uses (`--color-md-primary: #6750A4` etc.). Roboto 400/500/700.

Component primitives in `src/components/ui/`: `Button` (all `rounded-full`, state-layer opacity for hover/active, `active:scale-95`), `Card` (surface-container background, 24px radius, `shadow-sm`→`shadow-md` on hover), `TextField` (filled style — rounded top, square bottom, 2px bottom border going primary on focus), `Chip`, `StatusPill`, `FAB`.

Signature elements that must be present: organic blur shapes with `blur-3xl` in hero and key sections, the tonal surface system with no pure white anywhere, large radii (24px cards, 32–48px major containers), `cubic-bezier(0.2,0,0,1)` easing, focus rings on everything interactive, and `prefers-reduced-motion` honoured.

One deliberate restraint: the recipient page uses the tonal system and pill buttons but skips the heavier atmospheric layering. It has to render fast on a weak connection, and that constraint outranks decoration.

---

## Roadmap seams

These are not Phase 1a work. Each is listed with the one structural decision Phase 1a must make so that adding it later is ordinary work rather than a rewrite. The cost of every seam below is a column or an interface — cheap now, per the same logic that puts multi-party in the first migration.

**Signing.** `signature_envelope` table, `sign` in the `action_type` enum, and the `ESign` interface all exist in Phase 1a. Adding provider-backed signing is then a renderer on the recipient page plus a webhook handler — the doc's estimate is 1–3 weeks.

One correction worth making explicitly, because it changes what "before MVP" costs: _integrating_ signing is weeks, _building_ signature infrastructure is a company. For India this is not a preference — statutory eSign requires a CCA-empanelled provider, so the Aadhaar and DSC flows cannot be self-built at any budget. The plan mirrors provider state and never reproduces the legal model. Alongside it, §4.6's constraint holds: the claim is "electronic signatures with a defensible evidence trail for supported document types and jurisdictions," never unqualified "legally binding," and a supported-jurisdiction matrix ships with the feature.

**Banking details.** Depends entirely on the auth ladder above. Beyond step-up OTP it needs field-level encryption (separate key, not the row), restricted visibility so most requester roles never see full numbers, mandatory out-of-band verification on _change_ rather than first entry, and a written customer operating policy. The fraud shape here is impersonation of a known vendor requesting a bank-detail change — the control that matters is the out-of-band step, not the encryption.

**Aadhaar.** The architectural rule is that **Gather never stores an Aadhaar number.** Aadhaar eSign is initiated through the CCA-empanelled provider (Digio/Leegality), which performs the e-KYC; we persist only the provider's envelope reference and evidence artifact. Phase 1a enforces this with a lint rule and a schema convention: no column accepts raw government identifiers, and masked display uses a `redacted` field type. Handling Aadhaar numbers directly means the UIDAI regulatory regime — licensing, audits, storage restrictions — which is a different undertaking from adding a feature.

**AI extraction.** The seam is immutability: `submission_version` is append-only and `file_asset` carries a sha256. Extraction results go in a separate `extraction` table keyed by `file_asset_id`, so extraction never mutates a submission and can be re-run or discarded. Extraction feeds the reviewer as a suggestion with a confidence value; it does not auto-approve. That keeps the review axis meaningful and keeps a wrong extraction from becoming an accepted document.

**Conditional logic.** `requirement_definition` gets a nullable `visibility_condition` JSON column in the first migration, unused. Case instantiation already snapshots definitions into concrete requirements, which is exactly the evaluation point. Recommended bound: "show requirement B when the answer to A equals X" — one hop, evaluated at instantiation and on answer change. Resist a rules engine; that is the road to the generic workflow builder the doc rejects.

**Payments.** Kept as a separate bounded context with its own tables (Razorpay for India). The only coupling is a `payment` action type letting a case block on settlement. Money does not go in the submission tables.

**Integrations.** `audit_event` is already the append-only stream that outbound webhooks read from, so no new capture layer is needed. Phase 1b's single storage export is the first consumer.

**Sequencing note.** Signing, banking details, and Aadhaar all sit downstream of the same prerequisite — the auth ladder and a real security posture. Doing that once, before any of the three, is roughly half the work of doing it three times. That argues for the order: auth ladder → signing → banking details / Aadhaar, with AI extraction and conditional logic independent and schedulable anywhere.

---

## Verification

**Runs clean from zero:**

```
docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Seed creates a workspace, a user, a "Monthly Bookkeeping Close" template, and one live case with a printed recipient link.

**Two Playwright journeys — these are the product:**

1. _Happy path_ — requester creates case → recipient opens link on a mobile viewport → uploads a file and answers two fields → submits → requester approves → case closes → ZIP export contains the file and the answers.
2. _Rework loop_ — recipient submits → requester requests changes with a reason → recipient's page shows that reason on that one item only, other items untouched → recipient resubmits → both versions exist in history with `supersedes_submission_id` linked → next reminder for that assignment carries the reason.

**Integration tests (Vitest against a real test Postgres):**

- A query built without a workspace scope fails to compile / is caught by lint.
- A cross-workspace read returns zero rows.
- `GET /r/[token]` twice, simulating a mail scanner, leaves the assignment `pending` and records no consent.
- Running the reminder job twice over the same due assignment produces exactly one `reminder_dispatch` row.
- A state change and its audit event either both commit or both roll back.
- A file stays undownloadable while `malware_scan_status` is `quarantined`.

**Manual:** Mailpit at `localhost:8025` shows reminder copy differing between the unopened and stalled cases. Recipient page checked at 360px width with network throttled.

---

## Notes on sequencing

Stages 1–3 are the expensive-to-reverse ones and should be reviewed before Stage 4 begins. Stages 5–9 are ordinary product work and can be reordered freely.

The product doc's own closing caveat is worth restating: everything above is reasoning rather than evidence, and zero customer interviews have been conducted. This plan builds the thing the doc specifies — it does not validate that anyone will pay for it. §12 of the product doc is the parallel track.