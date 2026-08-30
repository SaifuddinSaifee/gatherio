Before the stack itself, one question decides several of the choices below: are the launch customers Indian accounting practices or US/UK ones? That drives hosting region, e-sign provider, whether WhatsApp matters, and whether DPDP or GDPR is the compliance story. I'll assume India-first with US as the expansion path, and flag where that changes things.

## Recommended stack

One language, one repo, one deploy target, managed everything else.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router), TypeScript | Recipient page server-renders with almost no JS, dashboard is a normal SPA-ish app, one codebase |
| DB | Postgres (managed: Neon, Supabase, or RDS ap-south-1) | The case model is deeply relational. Nothing else is a candidate |
| ORM | Drizzle | SQL-first, readable migrations. Your schema is the product, so you want to see it |
| Jobs | pg-boss or Graphile Worker, on the same Postgres | Reminders are low-volume and scheduled. Avoid a second datastore |
| Storage | S3 ap-south-1 (or Cloudflare R2 if residency is loose) | Private bucket, direct-to-storage uploads only |
| Uploads | S3 multipart via presigned part URLs, Uppy on the client | Gives you resumable large-file uploads on bad connections with very little custom code |
| Email | Postmark or Resend, with bounce/complaint webhooks | Delivery status is product state, not logging |
| WhatsApp | Meta Cloud API through an Indian BSP (AiSensy, Interakt, Gupshup) | Simpler template approval and billing than going direct |
| SMS/OTP | MSG91 (India) or Twilio | Only needed at Phase 1b |
| Requester auth | Better Auth or Auth.js, self-hosted | No per-MAU cost, and you only have internal users |
| E-sign | Zoho Sign, Digio, or Leegality for India; DocuSeal or SignWell for US | Mirror provider state via webhook, never model the legal layer yourself |
| Hosting | Fly.io (Mumbai), Render, or Railway as a single container plus one worker process | Long-running worker for reminders, region control, predictable cost |
| Errors | Sentry | |

Total infra cost at pilot scale is roughly $30 to $80 per month, most of it Postgres and email.

## The Python alternative

You have a working FastAPI service already, so this is a real option: FastAPI + Postgres + ARQ (or Celery) + React for the dashboard. It costs you two deploys and duplicated types across the boundary. If you take it, still server-render the recipient page with Jinja plus htmx rather than making it part of the React SPA. That page has to work on a mid-range Android on a bad connection, and shipping a 300KB bundle to it for what is essentially a list and a file input is the wrong trade.

Pick whichever you write faster in. The recipient page rendering strategy matters more than the language.

## Choices that are expensive to reverse

**Tenant isolation.** Put `workspace_id` on every table from the first migration and enforce it below the query layer, either with Postgres RLS or a repository layer that will not compile a query without a workspace scope. A solo builder will eventually forget a WHERE clause. Make the forgetting harmless.

**Storage key format.** Never use original filenames or anything guessable. `{workspace_id}/{case_id}/{submission_version_id}/{uuid}` with the real filename in the database. Bucket fully private, every read through a short-lived signed URL, downloads logged as audit events.

**Job idempotency.** Every reminder send needs a unique key like `(assignment_id, reminder_sequence)` with a database constraint, so a redeploy mid-queue or a retry cannot double-send. Sending a client three copies of the same chase is the exact failure the product claims to eliminate, and it will be the first thing a pilot customer notices.

**Audit events in the same transaction as the state change.** Not a background write, not a log line. Same commit or it did not happen.

**Region.** Once real client tax documents are in the bucket, moving jurisdiction is a migration plus a customer conversation. Decide before the first pilot.

**Magic link handling.** Store the hash, not the token. Issue a short-lived session on click and require an explicit POST for anything consequential, because corporate mail scanners pre-fetch every link in an email. This is the detail that turns into a weekend of confused support tickets if you get it wrong.

## Do not build

Signing infrastructure, a queue, a scheduler, an auth service, a file scanner (use ClamAV in the worker or a scanning API, and keep files quarantined until it returns), a workflow engine, GraphQL, microservices, containers orchestrated by anything, or a mobile app. The recipient page being a fast web page is the whole mobile strategy.

## One WhatsApp constraint worth knowing now

Outside a 24-hour window from the recipient's last message, you can only send pre-approved template messages. Your reminder copy is exactly that case. This means reminder text is semi-static and approved in advance, with variables interpolated. Design the ReminderPolicy so message bodies are template references plus variables rather than free text, or you will rebuild it later.