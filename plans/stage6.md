# Stage 6 — Magic links and the recipient page

## Context

Gather's whole product argument is that the external recipient gets one link, no
account, and sees only what they still owe. That surface does not exist. A
requester can build a template, publish it, and instantiate a case — and the
resulting link lands on `src/app/r/[token]/page.tsx`, a 20-line placeholder that
prints the token in a `<code>` tag. Everything built through Stage 5 is
requester-side setup for a flow with nothing on the other end.

Stage 6 builds that other end. It is also the gate on four later stages: Stage 7
(review) has nothing to review, Stage 8 (reminders) has nothing to chase, Stage 9
(export) has nothing to export, and Phase 1b's case ACL has no content to protect
until uploads and reviews are real.

Two existing known gaps get closed here because Stage 6 is precisely what makes
them stop being theoretical:

- `/api/download/[token]` serves any file regardless of `malware_scan_status`
  (CHECKLIST line 308) — harmless only while no upload flow exists.
- The recipient link travels in a `?newToken=` query parameter (CHECKLIST line
  315), landing in browser history and any future access log.

**Outcome:** a recipient clicks a link in an email, lands on a mobile-first page
listing only what they still owe, uploads a file and answers a question, and the
requester's case page shows it. A corporate mail scanner that pre-fetches that
same link changes nothing.

---

## Decisions taken (settled — do not re-litigate during implementation)

| # | Decision | Why |
| --- | --- | --- |
| 1 | **Custom ~150-line uploader**, not Uppy/multipart | `StorageAdapter` is single presigned PUT only; multipart would need 4 new interface methods implemented in *both* drivers plus ~100KB of vendor JS on the page whose entire purpose is being light |
| 2 | **Invite email ships in this stage** via `getNotifyAdapter()` | Mailpit is already wired at `:1025` and the adapter has zero call sites. Delivery tracking, bounces and suppression stay in Stage 8 |
| 3 | **`viewed_at` written by a client beacon**, not by the GET | Mail scanners fetch HTML but do not run JS. Stage 8's unopened-vs-stalled distinction needs a genuine open signal |
| 4 | **`submission_version` created *before* the upload** | techstack.md fixes the key as `{workspace_id}/{case_id}/{submission_version_id}/{uuid}`; the id must exist to build the key. Cost: orphan versions and version-number gaps on abandonment |
| 5 | **Stateless HMAC-signed recipient cookie carrying `access_token.id`** | `.env.example` already documents `AUTH_SECRET` as *"Used to sign recipient sessions and local upload tokens."* Carrying the token id is what makes revocation enforceable on every POST |
| 6 | **Draft answers live on `assignment.draft_value`** | A draft is 1:1 with an assignment. `assignment` already carries mutable progress (`viewedAt`, `submittedAt`, `fulfilmentStatus`); a draft is the same category. Clears in the same transaction as the submit — no orphan-draft bug class |
| 7 | **`/r/[token]` becomes a Route Handler that redirects to `/r/c/[caseId]`** | A Server Component cannot set a cookie in Next 15. The redirect also takes the raw token out of the address bar, browser history, and `Referer` — which retires the `?newToken=` wart on both sides rather than relocating it |

---

## 1. Migration (`drizzle/0002_*.sql`)

Declare in the schema files, then `pnpm db:generate` and review the SQL by hand.
Drizzle 0.45 uses the array-returning third argument: `(t) => [index('…').on(t.x)]`.
All additive, all nullable, no backfill.

**`src/db/schema/requirement.ts`**

- `assignment.draftValue` — `jsonb('draft_value')`, nullable
- `assignment.draftUpdatedAt` — `timestamp('draft_updated_at', { withTimezone: true })`, nullable
- `requirement.options` — `jsonb('options').$type<string[] | null>()`, nullable

**`src/db/schema/template.ts`**

- `requirementDefinition.options` — same shape

> **`choice` is unshippable today.** Verified: neither `requirement_definition`
> nor `requirement` has anywhere to store what the choices *are*. This is Stage 5
> backfill landing in Stage 6 — unavoidable, since `choice` is one of the five
> mandated field types. Do **not** overload `acceptanceCriteria` (prose shown to
> the recipient) or `visibilityCondition` (a reserved roadmap seam).

**Indexes** — the schema currently has none on any of these join columns, and
every Stage 6 query path is a seq scan:

- `assignment(requirement_id)`, `assignment(party_id)`
- `requirement(case_id)`, `party(case_id)`, `access_token(case_id)`
- `submission_answer(submission_version_id)`, `file_asset(submission_version_id)`, `review(submission_version_id)`
- `audit_event(case_id, occurred_at)` composite
- **UNIQUE** `submission_version(assignment_id, version_number)` — makes the
  `max+1` race fail loudly instead of silently duplicating. Gaps stay legal
  (decision 4); duplicates become impossible.

---

## 2. New shared libraries

### `src/db/party-session.ts` — must live under `src/db/**`

The token-hash lookup is inherently unscoped: you cannot know the workspace until
you have found the row. ESLint blocks the raw `db` import outside `src/db/**`
(both the `@/db/client` alias and the `**/db/client` relative pattern), so this
mirrors `src/db/session.ts`'s own stated reasoning — reuse the existing carve-out
rather than adding a second.

```ts
export interface RecipientSession {
  accessTokenId: string;
  workspaceId: WorkspaceId;   // scoped.ts's brand docstring names the "party token" path
  caseId: string;
  partyId: string;
}

/** READ-ONLY. Writes nothing, ever. The mail-scanner guarantee lives here. */
export async function resolveRecipientSession(rawToken: string): Promise<
  { ok: true; session: RecipientSession } | { ok: false; reason: 'not_found' | 'expired' | 'revoked' }
>;

/** Re-reads the access_token row. First call in EVERY recipient action. */
export async function assertTokenStillValid(accessTokenId: string): Promise<
  { ok: true } | { ok: false; reason: 'not_found' | 'expired' | 'revoked' }
>;
```

Reuses `hashAccessToken` from [token.ts](src/lib/token.ts) and `asWorkspaceId` /
`scoped` from [scoped.ts](src/db/scoped.ts).

> **Workspace scoping is not authorization here.** A token grants access to one
> *case*, not a workspace, and `assignment` has no `case_id` of its own. Every
> action must verify `assignment → requirement.caseId === session.caseId`.

### `src/lib/recipient-cookie.ts`

Stateless HMAC in the house format — `base64url(payload).base64url(hmac)`, the
same idiom as `storage.local.ts`'s token, deliberately parallel so there is one
signing pattern in the codebase.

- Name `gather_r_${caseId}` (per-case, so two live links in one browser don't clobber each other)
- `HttpOnly`, `SameSite=Lax`, `Path=/r`, `Secure` when `APP_URL` is https, `Max-Age = RECIPIENT_SESSION_TTL_SECONDS`
- Payload `{ accessTokenId, workspaceId, caseId, partyId, exp }`

### `src/lib/upload-ticket.ts`

Same HMAC format. Signs `{ submissionVersionId, key, contentType, originalFilename, maxBytes, exp }`
at presign time, verified at confirm time. Without it, `confirmUploadAction` would
be accepting a client-supplied `storageKey`, `originalFilename` and `mimeType` for
a table where all three are NOT NULL — the server must only ever persist values it
authored.

### `src/lib/domain/answer.ts` — isomorphic, imported by client island *and* server action

`validateAnswer(requirement, raw)` → `{ ok: true; value: StoredAnswer } | { ok: false; message: string }`.
Hand-rolled, no zod (zod is confined to `env.ts` by existing convention).

| Type | Control | Rules (identical both sides) |
| --- | --- | --- |
| `short_text` | `TextField`, `maxLength=200` | trim; required ⇒ non-empty; ≤200 |
| `long_text` | `<textarea>` styled to match `TextField` | trim; required ⇒ non-empty; ≤5000 |
| `date` | `<input type="date">` | `YYYY-MM-DD`; **real calendar date** (round-trip through `new Date(y, m-1, d)` and compare parts — rejects `2026-02-30`); 1900 ≤ d ≤ now+100y |
| `choice` | native `<select>` via `Select` | must `===` a member of `requirement.options`; null/empty options ⇒ server error |
| `yes_no` | two native `<input type="radio">` | strictly boolean |

- **`yes_no` uses native radios, not the `Switch` primitive.** A switch means an
  on/off setting that takes effect immediately; a yes/no *answer* is a choice
  between two options. Radios also participate in a plain form — `Switch` has no
  `name`/hidden input and cannot.
- **Optional requirements get an explicit "This doesn't apply to me" button.**
  product.md §4.1 names this outcome directly; an empty string loses the
  distinction between *skipped* and *declared inapplicable*.

**`submission_answer.value` shape** — nothing in the repo writes this table, so
we define it:

```ts
type AnswerValue =
  | { fieldType: 'short_text';     text: string }
  | { fieldType: 'long_text';      text: string }
  | { fieldType: 'date';           date: string }              // 'YYYY-MM-DD', never a Date
  | { fieldType: 'choice';         choice: string; options: string[] }
  | { fieldType: 'yes_no';         yes: boolean }
  | { fieldType: 'acknowledge';    acknowledged: true; statement: string }
  | { fieldType: 'not_applicable'; declaredBy: 'party' };

type StoredAnswer = AnswerValue & { requirementId: string; answeredAt: string };
```

Ship an `isStoredAnswer(v: unknown): v is StoredAnswer` guard for reading the
untyped jsonb back. Three deliberate choices: `requirementId` is denormalised in
(the column doesn't exist and the row is otherwise a two-hop join away);
`choice` **snapshots the options as offered**, same immutability principle that
makes `requirement` a snapshot of `requirement_definition`; `acknowledge`
snapshots the rendered statement, because evidence of what they agreed to is the
entire point and a bare `true` is worthless. `date` is a string because
`new Date('2026-03-01')` is UTC midnight and renders as Feb 28 west of Greenwich.

### Remaining small libs

- **`src/lib/domain/upload-policy.ts`** — `ALLOWED_MIME_TYPES` as a code constant
  (not env; it isn't deployment-varying): pdf, jpeg, png, heic, webp, docx, xlsx,
  csv, txt. Extension↔MIME cross-check.
- **`src/lib/request-context.ts`** — `clientIp(headers)`, `userAgent(headers)`.
  `audit_event.ip_address` is pg `inet`: a malformed value **throws at insert and
  rolls back the state change it was meant to record**. `x-forwarded-for` is a
  comma-separated list. Take the first segment, trim, strip an IPv4 `:port`,
  validate, return `undefined` otherwise. This is a real crash source.
- **`src/lib/domain/recipient.ts`** — `partitionItems()`, pure and DB-free.
  Outstanding = `fulfilmentStatus ∈ {pending, viewed, in_progress}` **OR**
  `latestReview.reviewStatus === 'changes_requested'`. That `OR` is the only
  place Stage 6 and Stage 7 touch, and it keeps the page correct regardless of
  what Stage 7 does to `fulfilmentStatus` when it reopens an assignment.
- **`src/lib/domain/messages.ts`** — `templateRef → { subject, body }`, holding
  only `case_invite` for now. [notify.ts](src/lib/adapters/notify.ts)'s docstring
  already says copy lives in `src/lib/domain`; `notify.smtp.ts` currently renders
  a placeholder `[template: ref]` body, which is fine for reminders nobody sends
  yet but not for a real invite a human reads. Stage 8 extends this map.
- **`src/lib/domain/invite.ts`** — `sendCaseInvite(...)`. Called **outside** the
  `instantiateCase` transaction (never hold a transaction open across network IO)
  and **non-fatal** on failure — the case still exists and the requester still
  gets the link on screen.

### `src/lib/env.ts` additions (mirror in `.env.example`)

```ts
UPLOAD_MAX_BYTES: z.coerce.number().default(26_214_400),   // 25 MB
UPLOAD_PRESIGN_TTL_SECONDS: z.coerce.number().default(900),
RECIPIENT_SESSION_TTL_SECONDS: z.coerce.number().default(3600),
```

---

## 3. Widen `StorageAdapter.complete()`

`file_asset.sha256_hash` is NOT NULL and the server never sees the bytes on a
direct-to-R2 upload. Client-side `SubtleCrypto` needs the whole file in an
ArrayBuffer, which product.md §6's "functional on a mid-range Android device"
rules out. A worker-side hash would make Stage 6 depend on a running worker,
breaking Playwright's deliberate no-`webServer` setup.

So: hash server-side at confirm time, inside a widened `complete()`. There are
zero existing call sites, so the change is free.

```ts
export interface CompletedObject {
  byteSize: number;
  contentType: string | null;   // null for local — it stores no metadata
  sha256: string;               // lowercase hex
}
complete(key: string): Promise<CompletedObject>;
```

- **local** — already `stat()`s; add a `createReadStream` → `createHash('sha256')` pass
- **r2** — `HeadObjectCommand` for length/type, `GetObjectCommand` streamed through the hash

**`byteSize` from `complete()` is load-bearing, not a nicety:** the R2 driver
ignores `maxBytes` entirely, so the confirm-time server-measured size is the only
place an upload cap is enforceable in production.

---

## 4. Malware scan gate

The download route sees an opaque HMAC token, and under `STORAGE_DRIVER=r2` **is
not in the request path at all** — the browser hits Cloudflare directly. A
route-level gate would be theatre that only works in dev. The gate goes at the
only sanctioned way to obtain a download URL:

```ts
// src/lib/domain/file.ts
export async function presignFileDownload(
  workspaceId: WorkspaceId, fileAssetId: string, actor: DownloadActor,
): Promise<{ url: string; expiresAt: Date; filename: string }>;
```

Throws `FileNotScannedError` unless `malwareScanStatus === 'clean'`, and writes
the `file.downloaded` audit event in the same transaction as minting the link.
Stage 7 (reviewer download) and Stage 9 (export) reuse it. **Add a comment to
[api/download/[token]/route.ts](src/app/api/download/[token]/route.ts) recording
why the gate is not there**, so nobody later "fixes" it.

The scan itself runs **inline at confirm time** via `getScanAdapter()` — the noop
driver returns instantly and Playwright has no worker. On `infected`: delete the
object, delete the reserved `submission_version`, audit, and return an error the
recipient can act on. Structure it as one `finalizeUpload()` in
`src/lib/domain/submission.ts` so Stage 8's move to a pg-boss job is a call-site
change.

---

## 5. HTTP and action surface

### Route Handlers (exactly two)

**`GET /r/[token]` — `src/app/r/[token]/route.ts`** — *deletes and replaces
`page.tsx`; `route.ts` and `page.tsx` cannot coexist at one path.*

- `resolveRecipientSession(token)`; on failure → `303 → /r/expired?reason=…`
- On success → `303 → /r/c/{caseId}` with the signed cookie set
- **Writes nothing.** No assignment update, no audit event. Header comment stating
  this and naming the mail-scanner reason.

Static segments win over dynamic ones at the same level, so `/r/expired` and
`/r/c/[caseId]` never collide with `/r/[token]` (tokens are 43 base64url chars).

**`GET /r/c/[caseId]/file/[fileAssetId]/route.ts`** — verify cookie →
`assertTokenStillValid` → verify the file's case matches the cookie's →
`presignFileDownload` → `302`. Linked with a **plain `<a>`, never Next `<Link>`**
(a `<Link>` would prefetch). A scanner cannot reach it: no cookie.

### Server Actions — `src/app/r/c/[caseId]/actions.ts`

Every action opens with `const s = await requireRecipient(caseId)`, which reads
the cookie, verifies the HMAC and expiry, and calls `assertTokenStillValid`.
That is the checklist's "expiry *and* revocation enforced on every POST, not just
at session creation" made non-optional. **The raw token never appears in any POST
payload** — a side benefit of the redirect design.

| Action | Signature | Notes |
| --- | --- | --- |
| `markViewedAction` | `(caseId) => Promise<void>` | Beacon target. Idempotent: one UPDATE `WHERE fulfilment_status='pending' AND viewed_at IS NULL AND requirement_id IN (…)` with `.returning({id})`. Audits `case.viewed` **only if** rows returned |
| `saveAnswerDraftAction` | `({caseId, assignmentId, value}) => {ok} \| {error}` | Style A (object arg). Sets `draftValue`/`draftUpdatedAt`, promotes `pending\|viewed → in_progress`. Audits `assignment.started` **only on first promotion**, never per blur |
| `submitAnswerAction` | `(prev, formData) => State` | `useActionState` shape — works with JS off. Tx: lock assignment `FOR UPDATE`, `versionNumber = max+1`, insert `submission_version` + `submission_answer`, null the draft, set `submitted`, `withAudit`. Then `revalidatePath('/r/c/'+caseId)` |
| `acknowledgeAction` | `(prev, formData) => State` | As above with `{fieldType:'acknowledge', statement}` |
| `declareNotApplicableAction` | `(prev, formData) => State` | Optional requirements only |
| `requestUploadAction` | `({caseId, assignmentId, filename, contentType, byteSize}) => {uploadUrl, method, headers, key, ticket} \| {error}` | `validateUploadRequest` first. Tx: lock, compute version, insert the **reserved** `submission_version`, audit. Then outside the tx: `presignUpload({key: '{ws}/{case}/{sv}/{uuid}'})` + mint ticket |
| `confirmUploadAction` | `({caseId, ticket}) => {ok} \| {error}` | Verify ticket; re-verify the case chain; `complete(key)` → enforce `byteSize <= ticket.maxBytes` (**the R2 size fix**); `scan()`; infected → delete object + reserved row + audit + error; clean → tx: insert `file_asset` (status `clean`), set `submitted`, audit |

Server Actions rather than Route Handlers because they need no Better Auth
session (they read our own cookie via `next/headers`), Next's Action-ID
indirection gives no stable URL for a crawler, and the form-shaped ones get typed
progressive enhancement for free. The only two things that genuinely cannot be
actions are cookie-setting on redirect and the download redirect.

> **`revalidatePath` is a new convention** — the repo has never used it. It becomes
> justifiable *here specifically* because the redirect design gives the page a
> stable, action-constructible path that contains no secret. If the URL design
> ever reverts to token-in-path, that justification evaporates.

---

## 6. Component tree

```
src/app/r/[token]/route.ts              Route Handler — resolve, set cookie, 303
src/app/r/expired/page.tsx              server — "This link is no longer valid", tells them
                                        to reopen the link from their email
src/app/r/c/[caseId]/page.tsx           server, async  ← the whole recipient surface
  │  cookie → assertTokenStillValid → getRecipientView() → partitionItems()
  │
  ├─ <ViewedBeacon caseId />            'use client', ~15 lines — decision 3
  ├─ <RecipientHeader />                server — workspace, case name, "2 of 5 done", due date
  ├─ <noscript> banner                  server — "File uploads need JavaScript"
  │
  ├─ <section> Outstanding              server
  │    └─ <ul>, one <li> per item       server — NOT wrapped in Card (design §48);
  │         │                             divider-separated rows in outline-variant (§49)
  │         ├─ title / instructions / acceptance criteria / "Optional"
  │         ├─ <ChangesRequestedNotice reason />   server — error-container, ABOVE the control
  │         └─ exactly one of:
  │              ├─ <AnswerField … />         'use client'
  │              ├─ <UploadField … />         'use client'
  │              └─ <AcknowledgeControl … />  'use client', ~20 lines
  │
  └─ <details> Completed (3)            server — NATIVE disclosure, ZERO JS
       └─ per item: status, submittedAt, answer value or filename,
                    plain <a> download, review outcome
```

**The client JS budget, itemised.** The biggest saving is that answer and
acknowledge submits are real `<form action={serverAction}>` posts wrapped in
React 19's `useActionState`. They work with JS disabled; the islands exist only
to add draft-on-blur and inline validation *on top of* a form that already
functions. `AnswerField`'s only JS-exclusive jobs are `onBlur → saveAnswerDraftAction`
and client-side `validateAnswer`.

`UploadField` is the only part that genuinely requires JS. `XMLHttpRequest`, not
`fetch` — `xhr.upload.onprogress` is the only way to get real progress. It PUTs
to `presignUpload().url` **read generically from the response**, never a
hardcoded `/api/upload/`, because under `STORAGE_DRIVER=r2` the browser goes
straight to Cloudflare. Retry: 3 attempts, exponential backoff, whole-file
restart. Progress is a determinate linear bar (§54) built inline as a 4px
`bg-md-primary` track — one bar in one component doesn't justify extracting a
primitive.

> **Deliberate deviation from the checklist.** It says "Uppy (or equivalent) loads
> only on rows that need a file," written assuming Uppy's ~200KB. With a ~150-line
> uploader, lazy-loading costs an extra round trip on exactly the bad connection
> the requirement exists to protect. Static-import all three islands; record the
> reasoning in a comment.

**Mobile-first, verified at 360px:** `<main className="mx-auto max-w-lg px-4 py-6">`,
single column at every width (add no breakpoints). Every interactive element
≥48×48px (§61) — `Button`'s `h-10` is 40px, so the recipient page's primary
actions use `fullWidth` with `h-12`. The file input's visible affordance is a
full-width 48px label, not a bare `<input type=file>`. Long filenames `break-all`,
long case names `line-clamp-2`. Upload errors are persistent inline
`p[role="alert"]` in the existing error-container style, never a snackbar (§51).
No decorative effects (§62/§81).

---

## 7. Audit vocabulary

Stage 6 defines the first vocabulary and `withAudit`'s first call sites. Every one
is written with the transaction handle of the state change it describes.

| eventType | actor | object | metadata |
| --- | --- | --- | --- |
| `access_token.issued` | user | access_token | `{ expiresAt, reason: 'case_created'\|'resend'\|'reissue' }` |
| `access_token.revoked` | user | access_token | `{ reason: 'reissue'\|'manual' }` |
| `case.invite_sent` | user | case | `{ channel, recipient, providerMessageId, templateRef }` |
| `case.viewed` | party | case | `{ assignmentsMarked }` — first view only |
| `assignment.started` | party | assignment | `{ actionType }` — first draft save only |
| `assignment.submitted` | party | assignment | `{ submissionVersionId, versionNumber, actionType }` |
| `submission.upload_requested` | party | submission_version | `{ key, originalFilename, contentType, declaredBytes }` |
| `submission.upload_confirmed` | party | submission_version | `{ fileAssetId, byteSize, mimeType, sha256 }` |
| `file.scan_completed` | system | file_asset | `{ outcome, driver }` |
| `file.scan_rejected` | system | submission_version | `{ key, outcome, details }` |
| `file.downloaded` | party \| user | file_asset | `{ storageKey }` |

> **There is deliberately no event for the GET.** Opening a link is not an act, and
> a scanner opening it is not the recipient. `case.viewed` from the beacon is the
> earliest evidence Gather is willing to claim. Say so in the route comment.

---

## 8. Invite email and link handling (decision 2, and the `?newToken=` fix)

**`src/app/(app)/cases/actions.ts`**

- `createCaseAction` — after `instantiateCase` returns, call `sendCaseInvite`
  (outside the transaction, non-fatal). Set a signed single-use flash cookie
  `gather_case_link` (`HttpOnly`, `Path=/cases`, `Max-Age=300`) and
  `redirect('/cases/{caseId}')` — **no query parameter**.
- `resendInviteAction` — mints a **new** token and **leaves the old alive** until
  its natural expiry, emails, audits, sets the flash cookie.
- `revokeAndReissueAction` — sets `revokedAt = now()` on every live token for the
  case, mints a new one, emails, audits.

Splitting resend from revoke is the point: "the client lost the email" and "the
link was forwarded to the wrong person" are different problems. If resend always
revoked, a requester helpfully resending would kick a recipient out mid-upload;
without revoke, a leaked link stays live for 30 days.

**`src/app/(app)/cases/[caseId]/page.tsx`** — drop the `searchParams` prop and the
`newToken` branch; read the flash cookie instead (Server Components may *read*
cookies). Replace the "shown once, copy it now" copy with a "Recipient access"
card: invite-sent status, link expiry, and the two forms.

**`e2e/stage5-templates-cases.spec.ts` must be updated.** Line 77 waits on
`/\/cases\/[^/]+\?newToken=/` and will fail once the parameter is gone; lines
80–81 (`page.locator('code')` containing `/r/`) still pass against the flash-cookie
reveal.

---

## 9. Ordered steps

**Progress log** (updated as each step lands — see CHECKLIST.md's Stage 6 section for the fuller writeup):

- [x] 1. **Schema + migration** (§1). `drizzle/0002_youthful_agent_brand.sql` — all additive/nullable, applied cleanly.
- [x] 2. **Carry `options` through** — `instantiateCase`'s snapshot map, `RequirementDefinitionInput`, `createDraftFromLatest`, both template-builder UIs, and the single-requirement edit page.
- [x] 3. **Pure libs, no I/O** — `answer.ts`, `upload-policy.ts`, `recipient.ts`, `request-context.ts`. Unit-tested first, before any wiring.
- [x] 4. **Crypto libs** — `hmac-token.ts` (shared, extracted), `recipient-cookie.ts`, `upload-ticket.ts`, with tamper/expiry tests.
- [x] 5. **`src/db/party-session.ts`** + `src/db/testing.ts` fixtures + the mail-scanner test — landed before any page existed, against the real Postgres.
- [x] 6. **Env + `.env.example`.**
- [x] 7. **Widened `complete()`** across `storage.ts`/`.local.ts`/`.r2.ts`, with a local-hash adapter test.
- [x] 8. **`src/lib/domain/file.ts`** — `presignFileDownload` + the scan gate, plus an `expectedCaseId` check added when the download route needed it (see §11 below).
- [x] 9. **`src/lib/domain/recipient-view.ts`** — `getRecipientView` + `getRequirementForAssignment` (added during step 12 so no write action trusts a client-supplied requirementId).
- [x] 10. **`src/lib/domain/submission.ts`** — all five write paths (`markCaseViewed`, `saveDraftAnswer`, `recordAnswerSubmission`, `reserveSubmissionVersion`, `finalizeUpload`), with explicit `requirement.caseId` checks rather than relying on the single-party-per-case coincidence. Found and fixed a real pre-existing type bug in `src/db/audit.ts`'s `Tx` type along the way (see §11).
- [x] 11. **Route handler** `/r/[token]/route.ts`, deleted the placeholder `page.tsx`, added `/r/expired`.
- [x] 12. **Server actions** `/r/c/[caseId]/actions.ts` — all seven.
- [x] 13. **Recipient page + server components** — `page.tsx`, `outstanding-item.tsx`, `completed-item.tsx`.
- [x] 14. **Islands** — `ViewedBeacon`, `AnswerField`, `AcknowledgeControl`, `NotApplicableControl`, `UploadField` (+ `xhr-upload.ts`).
- [x] 15. **Download route** `/r/c/[caseId]/file/[fileAssetId]/route.ts` — required widening `presignFileDownload` with an `expectedCaseId` param, since the recipient route needs case-scoping that a workspace-wide requester download wouldn't.
- [x] 16. **Invite email, flash cookie, resend/reissue** (§8) — `messages.ts` + `invite.ts` (`sendCaseInvite`, called outside the transaction, non-fatal), `issueCaseAccess`/`recordInviteSent` in `case.ts`, `case-link-flash.ts` for the signed `gather_case_link` cookie, `createCaseAction`/`resendInviteAction`/`revokeAndReissueAction` in `cases/actions.ts`, and the "Recipient access" card replacing the one-shot `?newToken=` reveal on the case detail page. Both Stage 5 and Stage 6 e2e specs updated together. Verified live: a real `case_invite` email lands in Mailpit with rendered subject/body.
- [x] 17. **Playwright spec** `e2e/stage6-recipient.spec.ts` — 5 tests, all green against a real dev server + Postgres: mail scanner (double-GET via the `request` fixture, then a real browser confirming `Viewed`), happy path (yes/no + date + upload, all reaching Completed), resumability (draft survives reload and a fresh session), 360px with no horizontal overflow, and an unresolvable link redirecting to `/r/expired`.
- [x] 18. **CHECKLIST.md** — kept up to date incrementally throughout; Stage 6 section marked complete, both the malware-scan-gate and `?newToken=` known gaps retired, and the three now-resolved cross-cutting verification items (mail-scanner GET test, audit atomicity test, malware-scan-gate test) flipped from `[ ]`/inconsistent to `[x]` with pointers to their actual tests.

**Step 16 — real deviations found while implementing:**
- `NotifyAdapter.send()` was widened to take a required `subject`/`body` pair instead of only `templateRef`/`variables`/an optional `subject`. `notify.ts`'s own docstring says rendering belongs in `src/lib/domain`, not the adapter, but `notify.smtp.ts` had been doing exactly that (a placeholder `[template: ref]\nkey: value` renderer) since nothing had ever called `send()` before this step. `messages.ts` now owns rendering; the adapter only ever sends what it's handed.
- `instantiateCase` itself now writes the `access_token.issued` audit event (`reason: 'case_created'`) — the plan's own audit vocabulary table named this case, but the original Stage 6 implementation pass hadn't wired it into `instantiateCase`'s transaction. Caught by a failing assertion in the existing mail-scanner integration test (it expected zero audit events immediately after fixture setup) rather than by design review — the fix was to update that test's baseline to 1 and strengthen its "untouched by the GET" assertion to whole-array equality instead of a hardcoded count, matching how the same test already treats the `assignment`/`access_token` rows.
- A `redirect()`-inside-`try`/`catch` bug was caught and fixed before it ever shipped: an early draft of `reissueAndRedirect` called `redirect()` for the missing-recipient-email case from inside the same `try` block whose own `catch` also calls `redirect()`. Next's `redirect()` works by throwing, so that throw would have been caught by the surrounding `catch` and reported as a generic "could not send the invite" error instead of actually redirecting. Fixed by only ever recording an outcome (`errorMessage: string | null`) inside `try`/`catch`, then calling `redirect()` exactly once after both have fully exited — the same shape `createCaseAction` already used correctly.

**Real deviations from the plan as originally written**, found while implementing:
- `src/db/audit.ts`'s `withAudit(tx, ...)` was typed to accept `NodePgDatabase<typeof schema>`, but that is **not** what `db.transaction(async (tx) => …)` actually hands its callback (a real transaction object is missing `$client: Pool`). Invisible until this stage became the first real caller of `withAudit` — fixed by deriving the type structurally instead of hand-typing it (`src/lib/domain/submission.ts` needed the identical fix for its own transaction callbacks).
- `recordAnswerSubmission`'s original design took a client-supplied `requirementId` to stamp into the stored answer. Changed to derive it from the already-authorized assignment row instead (`assignment.requirementId`), closing a class of forgeable-mismatch bug the original design allowed.
- `presignFileDownload` needed a new `expectedCaseId` field on `DownloadActor` — the plan didn't anticipate that the recipient's own download route needs case-scoping on top of the function's existing workspace-scoping.
- Every `assignment` lookup in `submission.ts` explicitly joins to `requirement.caseId` rather than relying on partyId equality alone — the plan named this as the correct design in prose (§2) but the first implementation pass didn't actually do it; caught and fixed before writing tests, not after.

**A critical bug the e2e run caught that nothing else could have**: `initialAnswerFormState` (a plain object) was originally exported from `actions.ts` alongside the server actions. Next.js requires **every** export of a `'use server'` file to be an async function — a non-function export doesn't fail typecheck, doesn't fail lint, doesn't fail `next build`, and doesn't fail a unit test that calls the underlying domain functions directly. It only throws at actual request time: `Error: A "use server" file can only export async functions, found object`, on every single POST to any of the seven recipient actions. This was caught only because the Playwright spec exercised the real HTTP path against a running dev server rather than importing the action functions directly. **Fixed** by moving `AnswerFormState`/`initialAnswerFormState` into their own plain module (`answer-form-state.ts`) with no `'use server'` directive, imported by both `actions.ts` (type-only) and the three client islands that need the initial state. Two smaller e2e-only fixes alongside it: waiting for a transient "uploaded" message that `router.refresh()` already replaces by the time the assertion runs (wait for the actual end state instead), and using a locator's `.blur()` rather than `keyboard.press('Tab')` to reliably trigger a blur event in headless Chromium.

---

## 10. Verification

**Unit (Vitest, no DB)**

- `answer.test.ts` — five types × {valid, empty-required, empty-optional,
  over-length, malformed}. Explicitly: `2026-02-30` rejected, `2026-02-29`
  rejected (not a leap year), `2028-02-29` accepted, choice outside options
  rejected, choice with null options rejected.
- `upload-policy.test.ts` — disallowed MIME, extension/MIME mismatch, over
  `UPLOAD_MAX_BYTES`, zero bytes.
- `recipient.test.ts` — `changes_requested` with `fulfilmentStatus='submitted'`
  lands in **outstanding**; ordering; empty case.
- `recipient-cookie.test.ts` / `upload-ticket.test.ts` — round-trip, bad
  signature, truncated payload, expired, wrong `AUTH_SECRET`.
- `request-context.test.ts` — `"203.0.113.7, 70.41.3.18"` → `203.0.113.7`;
  `"unknown"` → `undefined`; `"::1"` → `::1`; `"1.2.3.4:5678"` → `1.2.3.4`.
  **This is what stops an `inet` cast from rolling back a submission.**

**Integration (Vitest + real DB, `src/db/testing.ts` fixtures)**

- **The mail-scanner test.** Seed a case; snapshot *whole rows* for every
  assignment and the access_token plus `count(audit_event)`; call
  `resolveRecipientSession` **twice**; assert every row `deepEqual` to its
  snapshot and the audit count still 0. Whole-row equality is stronger than
  checking three fields — it also fails if someone later adds a `usedAt` column
  and writes to it. **Then the inverse:** call the viewed path once and assert
  statuses flip and exactly one `case.viewed` row appears. A test that only
  asserts "nothing happened" passes vacuously when the whole flow is broken.
- Expired and revoked tokens rejected by `resolveRecipientSession` **and
  separately** by `assertTokenStillValid` — that second assertion is the
  "every POST, not just session creation" requirement.
- **Cross-case authorization** — two cases in one workspace; a session for case A
  submitting against an assignment in case B must fail. This is the check
  workspace scoping does not give you.
- `presignFileDownload` throws for `pending`/`quarantined`/`infected`/`scan_failed`,
  succeeds for `clean` (retires CHECKLIST line 297).
- **Audit atomicity** (CHECKLIST line 296, untestable until now because nothing
  called `withAudit`) — force a throw after the audit insert, assert both the
  `submission_version` and the `audit_event` rolled back.
- Concurrency — two parallel `reserveSubmissionVersion` calls on one assignment:
  one wins, the other fails on the unique index.

**E2E (Playwright)** — `e2e/stage6-recipient.spec.ts`

1. **Mail scanner** — use the `request` fixture (its own cookie jar, no JS
   execution — an accurate scanner model; `page.request` shares browser cookies
   and is wrong here). `GET` the link twice following redirects, then reload the
   requester's case page and assert "Viewed" has `toHaveCount(0)` and "Pending"
   count equals the requirement count. Then open the same link in a real `page`,
   wait for the beacon, reload, assert "Viewed" now appears.
2. **Happy path** — answer a `yes_no` and a `date`, upload `e2e/fixtures/sample.pdf`,
   all three move into the collapsed Completed section, expand `<details>` and
   verify values and filename, requester's case page shows "Submitted".
3. **Resumability** — type into a `long_text`, blur, `page.reload()`, value still
   there; then `page.goto(link)` fresh (new session) and it is *still* there.
4. **360px** — `test.use({ viewport: { width: 360, height: 740 } })`; assert
   `document.documentElement.scrollWidth <= 360` and the primary button's
   bounding box height ≥ 48.
5. **Expired link** — revoke via the requester UI, `page.goto(link)`, expect `/r/expired`.

**Manual**

- Mailpit at `:8025` shows the `case_invite` mail with a working `/r/<token>` link.
- DevTools "Slow 4G" + 4× CPU throttle at 360px: interactive, progress bar moves, no layout shift.
- **JavaScript disabled entirely**: page renders, completed section expands
  (native `<details>`), an answer submits, upload area shows the `<noscript>` explanation.
- Two different case links open in one browser, both usable (validates the
  per-case cookie name).

**Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (all specs,
including the updated Stage 5 one), and `pnpm build` all green.

---

## 11. Risks and warts, stated plainly

1. **Widening `complete()` makes the R2 path read every uploaded file back through
   the app** to hash it. Zero egress on R2, but real latency on a large file, and
   it partly undoes "the browser never touches Next." Least-bad of three bad
   options; the fix is known — Stage 8's scan job must fetch the bytes anyway, so
   scan and hash become one pass and `finalizeUpload` moves wholesale into the
   worker. Written to make that a call-site change.
2. **Orphan `submission_version` rows and version-number gaps** from abandoned
   uploads — accepted per decision 4, unavoidable given the mandated key format.
   The unique index keeps gaps legal and duplicates impossible. Wants a Stage 8
   sweeper (delete reserved versions with no `file_asset` older than the presign TTL).
3. **`revalidatePath` is a new convention**, justified only by the token-free
   `/r/c/[caseId]` path.
4. **`choice` options are Stage 5 backfill** landing here. Two columns and ~25
   lines of builder UI. Unavoidable.
5. **Uploads require JavaScript.** Everything else is progressively enhanced;
   there is no honest no-JS path to presigned direct-to-storage uploads.
6. **`withAudit`'s `Tx` type is identical to `db`**, so nothing stops a future call
   site from skipping the transaction and silently breaking the same-commit
   guarantee. Stage 6 adds eleven call sites. Mitigation is the atomicity test
   plus comments; the real fix is a branded `Tx` type — worth proposing, out of
   scope here.
7. **Vitest integration tests hit a shared, never-reset database.** Every fixture
   must be uniquely named and must never assert on global counts — only on rows it
   created. `src/db/testing.ts` should enforce this by always returning a fresh workspace.
8. **`clientIp` returning `undefined` behind an unexpected proxy** silently loses
   IP evidence. Strictly correct — a rolled-back submission is far worse than a
   null IP — but log at warn level so a misconfigured proxy is discoverable.
9. **The flash cookie lives its full 300s** because a Server Component cannot
   delete it. Strictly better than a URL that lives in history forever.
10. **Recipient session TTL is 1 hour** while the token is valid 30 days. A
    returning recipient re-clicks the email link and gets a fresh session with
    their drafts intact — but `/r/expired` must say exactly that, or it reads as
    "your link is dead."
