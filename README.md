# Gather

**External request completion software.** A requester defines a reusable
checklist once (a *template*), instantiates it per counterparty (a *case*),
and Gather owns that case until everything on it has been submitted,
reviewed, and accepted. The external party never creates an account — they
get one link, see only what they still owe, and are reminded about only
what remains.

Working domain: `gather.io`. Product name: **Gather**.

## Project status

This is a solo, pre-revenue build going stage-by-stage through a fixed
plan. **Stages 1–7, 8.5 and 8.6 are built and verified.** Stage 8
(automated reminders), Stage 9 (export) and Stage 11 (roles and access
control) are not started. Concretely, today you can:

- sign up, which creates your own workspace
- create a versioned template with upload/answer/acknowledge requirements,
  publish it, and instantiate a case from it
- send the recipient an invite email with a one-time magic link; the
  recipient opens it with no account, uploads files, answers questions and
  acknowledges items (files are held until malware-scan status allows download)
- review each submission: approve, request changes with a required reason,
  or reopen; every item keeps its version history
- see all your cases on a dashboard, as a sortable/filterable data table
  (the default) or a grouped list, showing who is blocking each case and on
  which items
- send a manual email reminder (one case, or in bulk from the table) that
  names only what is still missing, with an optional note and a cooldown

You **cannot yet**: receive automated, scheduled reminders (Stage 8),
export a completed case as a packet (Stage 9), or invite teammates and
restrict who can see a case (Stage 11 — today every workspace member can
see and review everything). Postmark and ClamAV are interface stubs.

For the authoritative, continuously-updated record of exactly what's built
and verified vs. not — down to the individual bug fixes and design
decisions — see **[CHECKLIST.md](CHECKLIST.md)**. This README explains how
to run what exists; it is not the source of truth for build status.

## Documentation map

This repo carries more planning documentation than is typical for its size,
because the build follows a plan rather than growing ad hoc. Read in this
order if you're new here:

| File | What it's for |
| --- | --- |
| [product.md](product.md) | **The product doc.** The business case, the competitive landscape, the data model reasoning, and the full MVP phasing (Phase 1a/1b/1.5/2). Start here to understand *why* the app is shaped the way it is. |
| [CHECKLIST.md](CHECKLIST.md) | **The build log.** What's actually implemented and verified, stage by stage, updated as work lands — including bugs found and fixed along the way. The ground truth for "is X built." |
| [plans/plan-1a.md](plans/plan-1a.md) | **The build plan.** Stage-by-stage implementation plan (schema, adapters, auth, templates/cases, recipient page, reminders, dashboard) that CHECKLIST.md tracks progress against. |
| [design-revised.md](design-revised.md) | **The design system — current source of truth.** Material You tokens and component specs actually implemented in `src/components/ui/`. |
| [design.md](design.md) | The original design doc. **Superseded by `design-revised.md`** (see CHECKLIST's Stage 10 notes for the specific corrections) — kept only for history, don't implement against it. |
| [techstack.md](techstack.md) | Infrastructure rationale — why Postgres/Drizzle/R2/pg-boss/Better Auth, and the tradeoffs considered. |

## Prerequisites

- Node.js 22+
- pnpm
- Docker (for local Postgres + Mailpit)

Nothing else. Every adapter (storage, email, malware scan) defaults to a
local implementation — no cloud account or API key is needed to run this.

## Quickstart

```bash
git clone <this-repo> && cd gatherio
cp .env.example .env.local   # read by `next dev`
cp .env.example .env         # read by drizzle-kit and the worker
docker compose up -d         # Postgres on :5434, Mailpit on :8025
pnpm install
pnpm db:migrate
pnpm db:seed                 # creates demo workspace/template/case data
pnpm dev                     # http://localhost:3000
```

**Two `.env` files, on purpose:** Next.js only reads `.env.local`, while
`drizzle-kit` and the worker process only read `.env`. Both need the same
values, so copy the example to both rather than symlinking or picking one.

**Postgres is on port `5434`, not `5432`,** specifically so it doesn't
collide with a Homebrew/system Postgres you might already have running.

**What `pnpm db:seed` actually gives you:** a demo workspace ("Demo
Accounting Practice"), a published template ("Monthly Bookkeeping Close")
with two requirements, and one live case with a working recipient link
printed to the console. It does **not** create a password you can sign in
with — the seeded user has no credential row, so `saifeemustafaq@gmail.com`
shown in the seed output isn't a working login. To actually use the app as
a requester, go to `/sign-up` and create your own account; that's the real
path Stage 4 built and verified.

Run the background worker (no jobs are registered yet — automated reminders
and exports are Stage 8/9) in a second terminal:

```bash
pnpm worker
```

Mailpit's web UI at http://localhost:8025 is where any outbound email
lands instead of a real inbox.

## A first walkthrough

1. Visit `http://localhost:3000`, click **Create your workspace**, sign up.
   You land on an authenticated dashboard scoped to your own new workspace.
2. Go to **Templates → New template**. Name it, add one or more
   requirements (upload / answer / acknowledge) inline — the whole thing is
   one page and nothing is saved until you submit with at least one
   requirement. Reorder rows by drag handle or the up/down buttons.
3. Open the template and **publish** the draft version. A published
   version is immutable — editing it again means explicitly creating a new
   draft version, which clones the requirements forward.
4. Go to **Cases → New case**, pick the published template, fill in the
   counterparty's details, and create the case. You'll get a one-time
   recipient link (`/r/<token>`) — this is what would normally go to the
   external party.
5. Open that link (or the invite email in Mailpit at
   http://localhost:8025): this is the recipient's no-account page. Upload a
   file or answer a question, then go back to the case as the requester to
   approve it or request changes.
6. Open **Dashboard** to see the case in the table/list views and try
   **Send reminder**; the email lands in Mailpit.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the Next.js app at `:3000` |
| `pnpm worker` | Start the background job worker (auto-restarts on change) |
| `pnpm build` / `pnpm start` | Production build and run |
| `pnpm test` | Vitest — schema/adapter unit and integration tests |
| `pnpm test:e2e` | Playwright — full browser journeys (see below) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, including the tenant-isolation rule (see below) |
| `pnpm db:migrate` | Apply pending Drizzle migrations |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:seed` | Populate demo data (see above) |
| `pnpm db:reset` | Truncate all tables, back to a clean slate |
| `pnpm db:studio` | Open Drizzle Studio against the local database |

## Project layout

```
src/
  app/(app)/…       requester-side pages — dashboard, templates, cases. Authenticated.
  app/(auth)/…       sign-up / sign-in
  app/r/…            recipient side — no account: [token] exchanges the magic link for a
                      session, c/[caseId] is the submission page
  app/api/…          upload/download routes, Better Auth's own route handler
  db/schema/         one file per entity group (workspace, template, case, requirement,
                      submission, reminder, access, audit, signature, auth)
  db/scoped.ts        the ONLY sanctioned way to query workspace-scoped tables —
                      a raw `db` import outside src/db/** is blocked by an ESLint rule
                      (see eslint.config.mjs), because a forgotten WHERE clause here
                      is a cross-tenant data leak, not a cosmetic bug
  lib/adapters/       storage (local filesystem / R2), notify (local console / SMTP /
                      Postmark), malware scan (noop / ClamAV), e-sign (interface only)
  lib/domain/         business logic that sits on top of scoped() — template
                      versioning/immutability, case instantiation, review,
                      case-status derivation, reminders, dashboard filtering
  worker/             background worker entrypoint — no jobs registered yet (Stage 8/9)
  components/ui/      Material You primitives (Button, Card, TextField, Select,
                      SegmentedButtons, Switch, Checkbox, Popover, …) and the
                      reusable data-table/ kit, built against design-revised.md
```

## Configuration

All of it lives in `.env.example` with working local defaults — copy it,
don't guess at values. The adapters that matter:

| Variable | Options | Notes |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` \| `r2` | `local` writes to `.storage/` on disk via signed tokens. `r2` talks to Cloudflare R2 through the S3-compatible API (`region: "auto"`) — needs `R2_*` vars filled in. |
| `NOTIFY_DRIVER` | `local` \| `smtp` \| `postmark` | `local` and `smtp` both point at Mailpit by default. `postmark` is an interface stub only — not implemented yet (Phase 1b). |
| `SCAN_DRIVER` | `noop` \| `clamav` | `noop` marks every upload clean immediately. `clamav` isn't implemented yet — files stay `quarantined` until a real scan lands; needed before any real client file. |

`AUTH_SECRET` signs recipient sessions and local upload tokens — the
`.env.example` default is fine for local dev, generate a real one
(`openssl rand -base64 32`) before this ever touches real data.

## Testing

```bash
pnpm test        # vitest — adapter unit tests (token round-trip, storage
                  # tamper/expiry/path-traversal), schema/domain logic
pnpm test:e2e     # playwright — real browser journeys against a running
                  # dev server + Docker Postgres (start both first)
```

The Playwright specs in [e2e/](e2e/) are the actual product verification,
not just smoke tests: sign-up → dashboard isolation between two separate
users, and a full template → publish → case → edit-after-instantiation
journey that checks the one non-negotiable in the whole schema — editing a
template after a case exists must never change that case's already-issued
requirements.

## Where this is going

The full stage-by-stage plan (schema, every remaining stage through
automated reminders/export/roles, and the roadmap seams for signing, banking
details, Aadhaar, AI extraction, and payments that the schema already
anticipates without building) is in [plans/plan-1a.md](plans/plan-1a.md).
[CHECKLIST.md](CHECKLIST.md) is updated every time something in that plan
actually lands — check there before assuming a feature described in
`product.md` already exists.
