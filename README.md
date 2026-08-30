# Gather

External request completion software (domain: gather.io; product name: Gather —
see `design.md`'s Logo & Wordmark section). See `Gather.io_ no-account document
collection + e-signatures.md` for the product doc, `techstack.md` for the
infra rationale, and `design.md` for the Material You design system this
UI implements. The build plan (schema, stages, roadmap seams) lives at
`/Users/saifsaifee/.claude/plans/design-md-gather-io-no-account-document-twinkling-scroll.md`.

## Run it

Everything defaults to local adapters — no cloud accounts or API keys needed.

```bash
cp .env.example .env.local
cp .env.example .env        # drizzle-kit and the worker read this one
docker compose up -d        # Postgres on :5433, Mailpit on :8025
pnpm install
pnpm db:migrate
pnpm db:seed                # creates a workspace + a live case, prints the recipient link
pnpm dev                    # http://localhost:3000
```

Run the worker (reminders, scans, exports) in a second terminal:

```bash
pnpm worker
```

Mailpit's web UI at http://localhost:8025 shows every reminder the worker
sends instead of real email.

## Layout

```
src/
  app/(app)/…      requester dashboard, authenticated
  app/r/[token]/…  recipient page, server-rendered, minimal client JS
  app/api/…        upload routes, webhooks
  db/schema/        one file per entity group
  db/scoped.ts      the only workspace-scoped query surface (see eslint.config.mjs)
  lib/adapters/     storage (R2/local), notify (email/WhatsApp/local), scan, esign
  lib/domain/       state machines, reminder policy, carry-forward
  worker/jobs/      reminder, scan, export
  components/ui/    Material You primitives
```

## Tests

```bash
pnpm test        # vitest — schema, tenant isolation, reminder idempotency
pnpm test:e2e     # playwright — happy path + rework loop
```
