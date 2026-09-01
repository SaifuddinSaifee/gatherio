# **What is Gather.io?**

**Working name:** Gather.io (brand and domain decision deliberately open) **Owner:** Saifuddin Saifee **Status:** Pre-build. Zero primary customer interviews completed. **Version:** 1.0 **Date:** August 2026

Gather.io is **external request completion software**.

A requester defines a reusable procedure once, instantiates it as a case per counterparty, and Gather owns that case until every required item has been submitted, reviewed, and accepted. The external participant never creates an account. They receive one link, see only what they still owe, and are reminded about only what remains.

The emphasis matters and it is the whole product argument. Every competitor in this category helps you **send** a request. Gather is accountable for the case reaching **closed**.

---

## **Executive summary**

**The problem is real and severe.** Every business that needs things from people outside the business runs the same broken loop: assemble a list from memory, send it by email or chat, wait, get partial or wrong submissions, chase manually, and lose days to round trips that nobody is measuring. The substitute for a product here is currently a person whose job is partly to remember who owes what.

**The recipient thesis is correct and is the strongest part of the proposal.** External parties do not want another account, portal, or workspace. A task-specific link with no password, showing only outstanding items, is directionally excellent and is supported by the accounting and procurement evidence in the market validation report.

**The horizontal positioning is not differentiated.** "Get anything from anyone, signed or uploaded, without an account" is a good internal principle and a weak market category. Portico is close to a feature-for-feature competitor and starts free. Content Snare is a mature, ISO 27001 certified competitor at $35 to $119 per month. Competing on that feature list is a losing move.

**The differentiation has to be structural, not featural.** Cleaner UX and lower price are copied in a quarter. Three things are not, because they are schema decisions rather than features:

1. **Multi-party cases.** One case, several counterparties, each owing different items, chased independently, closed only when every obligation is satisfied. Tools built around one form and one respondent cannot retrofit this cheaply.  
2. **The rework loop as a first-class event.** Rejection with a reason reopens exactly one obligation and drives the next reminder for that item only. Most tools treat review as a status flag.  
3. **Recurrence with carry-forward.** Recurring cases that consult a per-party ledger and skip re-asking for what is already held and still valid. The carry-forward half is the valuable half, and almost nobody implements it.

**Where this document disagrees with the market validation report.** The report recommends mid-market vendor onboarding as the launch wedge, scored 8.0 against accounting at 6.6. Those scores optimize for the best **company**. They do not optimize for **best first shipped product by a first-time solo builder**, which is the actual constraint here. Mid-market vendor onboarding means a Finance or Procurement buyer, a security questionnaire, a buying committee, and the report's own estimate of three to five months to a version safe for sensitive documents. That is a company, not a first app.

**Recommended path.** Build the horizontal engine internally. Launch on **recurring professional-services document cycles**, specifically accounting and tax practices, narrowed to the monthly and quarterly close rather than "another accounting client portal." The recurring nature of that work exercises the strongest part of the product from day one, the buyer is a single person with a card, there is no procurement cycle, and the segment is reachable by hand. Keep vendor onboarding and subcontractor compliance as the expansion path once the engine works and paying customers exist.

**Decision:** Conditional GO, collect-first, vertical launch. NO-GO on the generic horizontal product and NO-GO on native signing infrastructure. Kill condition: fewer than three paid live pilots from the first 20 to 25 qualified interviews.

---

## **1\. The executive conclusion**

### **What is validated**

**The recipient experiences a thesis.** External participants have no reason to build a habit around the requester's software. A vendor may interact with one customer once. A tax client uploads documents a few times a year. A candidate applies once. Forcing an account on those people produces password resets, abandonment, support load, duplicate accounts, and resentment. Task-specific links beat "log into the portal" instructions, and the market validation report's accounting evidence supports this directly.

**Problem severity.** The pain is not a preference. Missing paperwork delays vendor activation, delays payment, delays filings, delays hiring, and blocks site access. The report's procurement evidence describes three-week email chains involving tax forms, insurance certificates, internal handoffs, and repeated rejection by Finance. That is a business cost, not an annoyance.

**Collect-first sequencing.** Shipping collection before signing is right. Collection exercises nearly the whole shared engine while avoiding the hardest legal and evidentiary questions.

**Expiry as an expansion path.** A document that is merely collected is a one-time transaction. A document with an effective date, an expiry, a responsible owner, renewal reminders, and replacement history creates recurring operational value. This is why compliance-shaped verticals retain better than onboarding-shaped ones.

**The completion framing.** Reframing the product from "document collection" to "case completion" is validated by the shape of the pain itself. The expensive part is never the sending. It is the rejection, the correction, and the not knowing where things stand.

### **What is not validated**

**The horizontal category.** "Get anything from anyone" tells a buyer what the software mechanically does, not which expensive problem it eliminates. It puts Gather directly against products whose public positioning is already one link, no client account, forms and uploads, signatures, reminders, progress tracking, and export.

**The freelancer and agency wedge.** Easy to reach, but low urgency, low willingness to pay, high churn, irregular volume, and heavily commoditized. Google Drive plus email is genuinely considered good enough by much of that segment.

**The differentiators themselves.** Multi-party, rework, and carry-forward are strong reasoning. They are not evidence. No customer has said "I would pay for this because my cases involve three parties." Until interviews confirm which of the three actually drives the purchase, treat all three as hypotheses.

**Any claim about demand.** Zero primary interviews have been conducted. Desk research validates the pain and invalidates the claim of horizontal novelty. It cannot establish that this product achieves product-market fit. This is the single largest open risk in the document and no amount of internal coherence substitutes for it.

**That the engine is IP.** Request, assignment, state, notification, submission, and reminder engines are widely implemented. The engine is a platform primitive, not a moat. Engineering elegance does not create customer differentiation.

### **Final business decision**

**Build a horizontal engine internally. Sell one vertical outcome externally.**

The engine must be general from day one, because retrofitting multi-party and recurrence into a single-respondent schema is expensive. The *marketing* must be narrow from day one, because a generic pitch has no reason-to-switch against free incumbents.

**Amendment to the market validation report's conclusion:** choose the launch vertical by *reachability and sales-cycle length for a solo first-time builder*, not by theoretical ACV. The report is correct that vendor onboarding is the best business. It is the wrong first customer for someone who has not yet shipped a product, because mid-market finance teams do not buy document infrastructure from unknown solo vendors without a compliance story that takes quarters to build.

Sequence: prove the engine on a segment that buys in days, then move up-market to the segment that pays more.

---

## **2\. Competitive landscape**

## **Direct and adjacent competitors**

| Product | Overlap with Gather | Positioning and pricing | Implication |
| ----- | ----- | ----- | ----- |
| **Portico** | Forms, uploads, native e-signatures, reminders, one link, magic-link access, dashboard, branding, integrations | Free tier; paid from $29 to $119/month billed annually | Almost feature-for-feature. The most important competitive finding. |
| **Content Snare** | Information and document requests, direct client links, reminders, review and rejection, dashboard, export, templates | $35, $71, $119/month billed annually. ISO 27001 certified | Mature collection-focused competitor. Sets the trust baseline a new entrant must clear. |
| **Clustdoc** | Forms, document collection, signatures, multi-party workflows, approvals, portal, onboarding | Higher-end regulated client onboarding | Already owns the "everything in one onboarding flow" message. |
| **FileInvite** | Document requests, signatures, portal, reminders, review, audit trail, secure collection | From roughly $9,900/year, complex lending focus, SOC 2 Type II | Proves the verticalized version supports strong ACV. |
| **Superdocu** | Document workflows, forms, reminders, validation, branded portal, DocuSign integration | Roughly €27, €97, €247/month | Another horizontal collection workflow product. |
| **TaxDome, Karbon, Ignition** | Documents, client requests, signatures, reminders, billing, practice workflow | Bundled into practice platforms | A vertical buyer may already receive the feature set from its system of record. The bundling risk. |
| **DocuSeal, SignWell, BoldSign, PandaDoc API** | Embedded signing infrastructure | Roughly $0.20 to $0.85 per completed document at entry volumes | Makes building signature infrastructure economically pointless. |
| **Google Forms, Drive, email, WhatsApp** | None of the workflow, all of the habit | Free | The actual incumbent. Underrated and undefeated in the low end. |

Two lessons from this table.

**First:** horizontal completion software is cheap; vertical completion infrastructure can be expensive. FileInvite charges roughly 25 times what Portico charges for a recognisably similar mechanic, because it sells a lending outcome rather than a feature set.

**Second:** the real competitor in the smallest segments is not any of these products. It is a chat thread that already works badly and requires zero learning. Behaviour change, not feature parity, is the barrier.

## **Why the competition does not automatically kill the idea**

Competition proves the workflow is valuable. It does not prove there is room for another generic version.

| Potential advantage | Defensibility | Assessment |
| ----- | ----- | ----- |
| Cleaner recipient UX | Weak | Useful hook, copied within a quarter |
| Lower price | Weak | Incumbents already start at $0 to $35 |
| More generic workflow builder | Weak | Increases complexity and competitive surface |
| Channel flexibility (email, SMS, chat) | Weak | Roughly one sprint of work for anyone who decides to match it |
| **Multi-party case model** | **Strong** | Schema decision, expensive to retrofit into single-respondent products |
| **Rework loop as first-class event** | **Moderate to strong** | Requires event-driven chasing, not a status flag |
| **Recurrence with carry-forward** | **Strong** | Requires a per-party ledger separate from per-case submissions |
| Industry-specific templates and terminology | Moderate | Compounds with every customer |
| Integration with the vertical's system of record | Strong | Expensive but durable |
| Expiry and renewal compliance model | Strong | Turns a transaction into a subscription-shaped need |
| Security and compliance reputation | Strong but expensive | Years and money, not a launch strategy |
| Distribution through associations or service providers | Strong | The most underrated line in this table |
| Completion benchmark data | Potentially strong over time | Only obtainable by operating the loop at volume |

**Where the durable moat actually comes from.** None of the above is patentable and most is copyable given enough quarters. The realistic moat is accumulation: template library depth in a chosen vertical, switching cost once live cases and the party ledger sit inside the system, and completion data revealing which templates and phrasings actually close. Plan for a two-year moat built on accumulation, not a day-one moat built on features. Anyone claiming otherwise about a product in this category is selling something.

---

## **3\. Where your thesis is correct**

### **3.1 "No account for the recipient" is correct**

This is the best part of the proposal and it should survive every subsequent revision.

The friction removed is real: password resets, abandoned onboarding, support requests, duplicate accounts, account sharing, and active resentment toward yet another portal. Adoption of portal-based tools reliably collapses at the moment the professional accepts an email attachment because a client complained. Removing the account removes the complaint.

**The critical distinction:** no account is not the same as no authentication.

For low-risk requests, possession of the emailed link may be sufficient. For tax forms, identity documents, banking details, or significant contracts, step-up verification is required. The product promise is **"no password or account required,"** never "anonymous access." See section 4.7 for the risk-tiered model.

### **3.2 The shared request primitive is architecturally correct**

Collect and Sign genuinely share infrastructure: requester, external party, assignment, deadline, notification, recipient access, activity events, completion, reminder suppression, and audit history. Building that once and adding action types later is correct architecture and will materially reduce duplication.

**Where the thesis overstates itself:** calling the shared engine the "actual IP." It is the platform primitive. The moat sits above and around it, in the case model, the vertical templates, and the accumulated completion data. This distinction matters practically, because it determines whether engineering time goes into generalising the engine (low return) or deepening a vertical (high return).

### **3.3 Collect-first is the right sequencing**

Collect validates almost everything that matters while avoiding the hardest problems:

* whether requesters create repeated workflows;  
* whether recipients complete them;  
* whether reminders measurably improve completion;  
* whether the dashboard actually replaces manual tracking;  
* whether customers will entrust real documents to an unknown vendor;  
* whether buyers will pay.

The one adjustment: the first version must not be literally upload-only. See section 4.1.

### **3.4 Expiry-aware documents are a strong expansion path**

Correct, and it is the mechanism that converts a transactional product into a retained one. A certificate with an effective date, expiry, responsible owner, renewal reminder, approval, replacement history, and a current compliance state is a subscription-shaped need rather than a one-time job.

**One addition the report understates:** expiry has a sibling that is more immediately valuable and less discussed. **Carry-forward.** If a recurring case can consult a per-party ledger and know that an identity document is already held and still valid, it can skip asking for it entirely. Not re-asking is a more visceral customer benefit than expiry alerting, because the requester's client notices it immediately and thanks them for it. Build both; lead with carry-forward.

### **3.5 Your scope exclusions are mostly disciplined**

Correctly excluded from early versions: marketplace, payments, in-person signing, AI extraction, broad integrations, and complex workflow routing. Resisting the pull toward a full client portal, CRM, procurement suite, or document-management platform is the right instinct and will need to be defended repeatedly.

**Three items are misclassified as scope creep when they are core:**

* **Structured answers.** Not optional. See 4.1.  
* **Review and resubmission.** This is the loop the product exists to close. Without it, Gather is a nicer Dropbox file request.  
* **Multi-party**, eventually. Not v1, but the schema must anticipate it from the first migration.

---

## **4\. Where your proposal is incomplete or wrong**

### **4.1 "Upload or sign" is missing a third core action**

The most important product correction in this document:

**upload | answer | sign | acknowledge**

The target workflows do not operate through files alone. Vendor onboarding needs legal business name, address, entity type, tax classification, contacts, payment preferences, service category, and ownership declarations. Accounting requests routinely need a client to answer a question, confirm that an item does not apply, or explain a discrepancy, not just upload something.

A Typeform competitor is not required. Five field types are sufficient initially: short text, long text, date, choice, and yes/no confirmation.

Without them, customers run a Google Form alongside Gather and the entire "one link" value proposition collapses. This is not a nice-to-have; it is load-bearing.

### **4.2 Your status enum mixes different dimensions**

The proposed single enum (`pending, viewed, submitted, expiring, expired, rejected, approved`) is incorrect. A document can simultaneously be submitted, approved, expiring, delivered by a bounced-free email, and part of an incomplete case. These are independent dimensions, not mutually exclusive states.

Use separate axes:

| Dimension | States |
| ----- | ----- |
| **Fulfilment** | `pending, viewed, in_progress, submitted, waived, cancelled` |
| **Review** | `not_required, unreviewed, approved, changes_requested, rejected` |
| **Validity** | `not_applicable, current, expiring, expired` |
| **Delivery** | `queued, sent, delivered, bounced, suppressed` |
| **Signature** | `not_sent, opened, signed, declined, voided, expired` |

This prevents state explosion, makes reporting tractable, and is close to free now and expensive later. Do this in the first migration.

### **4.3 `expiry_date` alone is not enough**

Expiry cannot be a column on a request item, because a certificate belongs to a vendor, worker, property, vehicle, or project, not to the request that happened to collect it. When it is replaced, the old version must remain in history while the new version becomes current.

DocumentRequirement  
  document\_type  
  subject\_type  
  subject\_id  
  valid\_from  
  expires\_at  
  expiry\_warning\_policy  
  responsible\_owner  
  verification\_status  
  supersedes\_submission\_id  
  renewal\_request\_id

The `subject_type` and `subject_id` pair is what makes carry-forward possible. It is the difference between a collection tool and a compliance system, and it costs almost nothing to model correctly at the start.

### **4.4 "Outstanding items only" needs a history view**

Focusing recipients on what remains is right. Hiding what is done is wrong.

Recipients need to verify what they already uploaded, when it was received, whether it was accepted, whether changes were requested, which version is current, what they signed, and how to download the completed document. Absent that, they email to ask, which reintroduces exactly the chasing the product exists to eliminate.

**Interface rule:** outstanding items first and prominent, completed items collapsed beneath them and expandable.

### **4.5 Single-party signing conflicts with the agency wedge**

Excluding multi-party routing from v1 is defensible for a signing add-on but it undermines the agency and contract use case, which routinely involves a client signer plus a countersignature, multiple directors, a client plus guarantor, approvals before signing, and payment after.

If Sign launches with one signer, position it narrowly as acknowledgements, consent forms, policy acceptance, declarations, waivers, and receipt confirmation. **Do not position one-signer Sign as a contract workflow.** That mismatch produces churn and refund requests rather than feedback.

### **4.6 "Legally binding" is too absolute**

This is the largest messaging risk in the product.

A typed or drawn signature is valid for many transactions. Software cannot make every document binding merely by recording IP address, timestamp, email, typed name, and a PDF hash. Enforceability depends on legal capacity, intent, consent to transact electronically, signer attribution, authentication method, exact document version, delivery and retention, applicable formalities, governing law, document type, and jurisdiction.

* **United States.** The ESIGN Act generally prevents a record or signature from being denied legal effect solely because it is electronic, requires certain records to be retainable and accurately reproducible, and imposes consent and disclosure conditions for some consumer records. It carries exceptions including wills, some family-law matters, and particular UCC records.  
* **European Union.** eIDAS distinguishes simple, advanced, and qualified signatures. Only a qualified electronic signature receives explicit EU-wide equivalence to a handwritten signature.  
* **India.** This deserves particular caution. The Controller of Certifying Authorities describes the statutory eSign framework as involving signer consent, e-KYC authentication, a Digital Signature Certificate, licensed Certifying Authorities, and a digital audit trail. **A generic typed-name flow must never be marketed as equivalent to the statutory eSign or DSC framework.**  
* **England and Wales.** The Law Commission states an electronic signature is capable of executing a document where the signer intends to authenticate it and document-specific formalities are satisfied.

**Safer product claim:** *Capture electronic signatures and a defensible evidence trail for supported document types and jurisdictions.*

Publish a matrix covering supported countries, supported signature levels, excluded document types, authentication methods, retention policy, signing provider, and customer responsibilities.

This is product-risk analysis, not legal advice. Formal claims must be reviewed by counsel before launch.

### **4.7 Magic links are UX, not strong proof of identity**

A bearer link establishes that someone possessed the link. It does not establish who clicked it, whether the email was forwarded, whether a shared inbox was used, whether an assistant acted for an executive, or whether an attacker had mailbox access.

Authentication should therefore be risk-based:

| Risk level | Experience |
| ----- | ----- |
| General asset upload | Magic link only |
| Routine business document | Magic link plus email re-verification |
| Tax or identity documentation | Magic link plus OTP |
| Banking detail change | OTP plus independent out-of-band change verification |
| High-value agreement | Signing provider with stronger authentication |
| EU transaction requiring QES | Qualified trust service provider |
| India statutory eSign use case | CCA-compatible eSign provider |

"No account" remains the UX promise. Authentication happens invisibly, or only when the risk warrants it.

**One implementation detail that will otherwise cost a support crisis:** never consume or permanently activate a magic link because an HTTP GET occurred. Corporate email scanners pre-fetch links automatically. A scanner must not invalidate a recipient's link, record consent, or create a signing event. Use the link to create a short-lived session, then require an explicit user action for anything consequential.

### **4.8 The freelancer/agency wedge is easier, but not better**

The advantages are real: easy founder access, short sales cycles, low credential burden, an understandable flow, and the ability to dogfood.

The disadvantages matter more: low urgency, low willingness to pay, high churn, irregular request volume, Drive and email genuinely considered good enough, strong bundled incumbents (HoneyBook, Dubsado, Bonsai, ManyRequests, Ignition), and a crowd of indie products chasing the same users. Portico explicitly targets agencies with the exact proposed experience: questionnaire, asset collection, contract signature, payment, one link, no account.

**Verdict: design partners, not the primary market thesis.**

**A further correction, on a point raised during development of this document.** Channel reach (WhatsApp, SMS) was at one stage considered the differentiator. It is not. It is genuinely useful and genuinely one sprint away for any competitor who decides to match it. Build multi-channel delivery because buyers in some geographies need it; never build the pitch on it. The pitch must rest on the case model.

---

## **5\. A better data model**

## **Recommended hierarchy**

Workspace / Organization  
└── WorkflowTemplate (versioned)  
    └── RequirementDefinition

Case / Packet  
├── Party / Recipient  
├── Requirement  
│   └── Assignment  
│       └── SubmissionVersion  
│           ├── FileAsset  
│           ├── Review  
│           └── DocumentValidity  
├── ReminderPolicy  
└── AuditEvent

"Case" or "Packet" is clearer than having both Collection and Request. Pick one word and use it everywhere, including in the UI.

## **Core entities**

**Workspace**: the paying organization. `id, name, billing_plan, retention_policy, default_authentication_policy`

**User**: an authenticated internal user. `id, workspace_id, role, email`

**WorkflowTemplate**: a reusable definition such as "Monthly Bookkeeping Close" or "Vendor Onboarding." `id, workspace_id, name, version, status`

**Case / Packet**: one live instance, such as "Q2 Close: Acme Traders." `id, workspace_id, template_version_id, name, overall_status, due_at, created_by, completed_at`

**Party**: an external person or organization. `id, case_id, party_type, display_name, email, phone, organization_name, ledger_subject_id`

The `ledger_subject_id` is what allows a party to persist across recurring cases and makes carry-forward possible.

**Requirement**: one thing that must be completed. `id, case_id, action_type (upload|answer|sign|acknowledge), title, instructions, required, due_at, sequence, acceptance_criteria`

**Assignment**: connects a requirement to one or more parties. `id, requirement_id, party_id, fulfilment_status, viewed_at, submitted_at`

This entity is non-negotiable, because one recipient can hold multiple requirements, one requirement can involve multiple recipients, and assignment-specific status can differ. Collapsing assignment into requirement is the single most expensive shortcut available here.

**SubmissionVersion**: never overwrite a submitted file or answer. `id, assignment_id, version_number, submission_type, submitted_at, submitted_by_party_id, supersedes_submission_id`

**FileAsset** `id, submission_version_id, storage_key, original_filename, mime_type, byte_size, sha256_hash, malware_scan_status`

**Review** `id, submission_version_id, review_status, reviewed_by, reviewed_at, reason`

The `reason` field is not a note. It is the input to the next reminder for that assignment. This is what makes the rework loop a first-class object rather than a status change.

**DocumentValidity** `id, submission_version_id, valid_from, expires_at, validity_status, responsible_user_id, renewal_case_id`

**SignatureEnvelope**: mirror the provider rather than reproducing its legal model. `id, requirement_id, provider, provider_envelope_id, document_hash, signature_status, completed_document_asset_id, evidence_asset_id`

**ReminderPolicy** `cadence, channels, quiet_hours, stop_condition, unopened_cadence, stalled_cadence, notify_requester_on_send`

Separate policy from messages. The two-state distinction (never opened versus opened and stalled) lives here and drives materially different copy. This policy governs reminders **to the recipient** only — see "Notification and reminder model" immediately below for the separate, requester-facing system.

**DeliveryAttempt** `recipient, channel, status, provider_message_id, sent_at, delivered_at, bounced_at`

**AuditEvent**: append-only. `id, workspace_id, case_id, actor_type, actor_id, event_type, object_type, object_id, occurred_at, ip_address, user_agent, metadata, previous_event_hash, event_hash`

Hash-chaining is optional at launch. Immutability and reliable event retention are not.

## **Notification and reminder model**

Two systems, one shared delivery layer, two different audiences, two different triggers. This split was implicit in the entities above; it is made explicit here because collapsing both into one "notification setting" — the natural first instinct, by analogy to something like Google Calendar's per-event reminder — produces the wrong schema and the wrong UI.

### The two audiences

| | Recipient reminders | Requester notifications |
| ----- | ----- | ----- |
| Who receives it | The external party — the vendor, client, candidate | The internal user — the requester's own team |
| Purpose | Get the outstanding item submitted | Keep the requester aware of case state without having to check the dashboard |
| Trigger | A schedule (cadence) | A discrete event — something changed |
| Already modeled above? | Yes — `ReminderPolicy`, `DeliveryAttempt`, `reminder_dispatch` (§10) | No — new in this section |
| Available channels | Email, SMS, WhatsApp — never push | In-app, email, browser/desktop push |

**Why the Calendar model doesn't transfer to the requester side.** Calendar reminders are time-offset, anchored to one scheduled event: "notify me 10 minutes before." A case has many independent items on independent lifecycles at once — one overdue, one awaiting review, one just submitted — so the right shape is event-driven, closer to how GitHub or Slack notify on activity than to how Calendar notifies before an appointment. Recipient reminders are legitimately schedule-driven; requester notifications are not, and forcing them into the same cadence-based shape is the mistake to avoid.

### Recipient reminders — sequencing, not new mechanism

Nothing new is added to the engine itself; this only makes explicit how policy applies across the hierarchy:

- **Template-level default.** `WorkflowTemplate` carries a default `ReminderPolicy` (cadence, channels, quiet hours). Every case instantiated from that template inherits it at creation time — the same snapshot-then-independent posture already used for requirement definitions: editing a template's default policy later never reaches back into a live case.
- **Case-level override.** A requester can tighten or loosen cadence for one specific case — a chronically slow client gets a tighter cadence — without touching the template.
- **Never a push channel.** Recipients never install anything and never hold an account (§3.1), so push is structurally unavailable to them. Only email, SMS, and WhatsApp apply.
- **Idempotency and quiet hours** are unchanged from Stage 8 of the build plan: one `reminder_dispatch` row per `(assignment_id, reminder_sequence)`, respected in the workspace's own timezone.

### Requester notifications — the actual gap

Today the only way a requester learns a case's state is opening the dashboard (§9, pull-only) or reading the append-only `AuditEvent` log. Nothing pushes state changes to the requester. Two new entities close this:

**NotificationPreference** — one row per user, per event type: `id, user_id, event_type, in_app_enabled, email_enabled, push_enabled`. Lets each requester tune which events reach them and by which channel, matching the shape Slack and GitHub already use for this — deliberately not reinvented.

**Notification** — the requester-facing feed, append-only like `AuditEvent` but user-addressed and read-tracked: `id, workspace_id, user_id, case_id, event_type, payload, read_at, created_at, delivered_channels`.

**Event taxonomy.** The concrete triggers, each with a sensible default so the feature is usable out of the box rather than requiring configuration first:

| Event | Default channel | On by default? |
| ----- | ----- | ----- |
| Recipient viewed the link for the first time | In-app | Yes |
| Recipient submitted or resubmitted an item | In-app, email | Yes |
| A submission is awaiting review | In-app, email | Yes |
| Due date is approaching (configurable lead time, e.g. 3 days out) | In-app | Yes |
| Due date has passed and the item is still outstanding | In-app, email | Yes |
| Case fully completed | In-app, email | Yes |
| A reminder to the recipient failed to deliver (bounced, suppressed) | In-app, email | Yes — actionable, not informational: it means the recipient isn't being chased at all |
| A reminder was successfully sent to the recipient | In-app | **No** |
| A held document is expiring or has expired (Phase 1.5, tied to `DocumentValidity`) | In-app, email | Yes |

The "reminder sent" row is off by default on purpose. It's the one place a naive, Calendar-style "notify me every time something fires" implementation would actively hurt the product — it would relocate the exact notification fatigue Gather exists to spare recipients from onto the requester instead. The requester already trusts the system to send reminders; they need to hear about it only when something needs their attention (a bounce, a due date, a submission).

**Channels, concretely:**

- **In-app** — always on, feeds the Notifications tab below. No new infrastructure.
- **Email** — reuses the transactional email provider already in the architecture (§6). Per-event for Phase 1a/1b; a digest mode is a reasonable Phase 2 addition once volume justifies it.
- **Browser/desktop push** — genuinely new infrastructure: Web Push with a service worker and VAPID keys. Not in the current adapter list (Storage, Notify, Scan, ESign) — needs its own adapter (`WebPush.subscribe / send`) following the same interfaces-first pattern as the others. Opt-in per user, per browser.

### The Notifications tab (per case)

The concrete surface the requester looks at, split into two sections so "what have we sent" and "what's coming next" are never conflated:

- **Sent** — every reminder actually dispatched to the recipient, read directly off `reminder_dispatch` / `DeliveryAttempt`: timestamp, channel, delivery status (queued, sent, delivered, bounced). A read view, not a new data source.
- **Scheduled** — the next reminder time, computed from the case's `ReminderPolicy` cadence, the last dispatch, and whether `stop_condition` has already been met. If nothing further is scheduled — the recipient already submitted, or the policy's stop condition was reached — the tab says so explicitly ("No further reminders scheduled") rather than showing an empty list, which would be indistinguishable from a load failure.
- **Send now** — a composer for an immediate, manual message outside the automatic cadence entirely. See the next subsection for what this can and can't do per channel.
- The same feed also surfaces that case's requester-facing events from the taxonomy above (due date passed, review needed), visually distinguished from the "Sent" entries so the requester never confuses "a reminder went to the vendor" with "something happened that needs my attention."

### On-demand messaging — "Send now"

The Notifications tab is not only a read-only history. It carries one more card: a single message the requester composes and dispatches immediately, outside the automatic cadence — the manual-chase equivalent of "I'm just going to ping them right now." It is explicitly **not** a chat: there is no reply channel back into Gather. If the recipient hits reply on the email, or replies on WhatsApp, that reply lands in the requester's own inbox or phone exactly as it would today, never inside the product. This keeps faith with §3.1's recipient thesis — the recipient still never needs an account or a place to log back into, even for this.

**The channel constraint this runs into, and why it isn't optional:**

| Channel | Can the requester type freeform text right now? |
| ----- | ----- |
| Email | Yes, always |
| WhatsApp | Only within a 24-hour window opened by the recipient's own inbound message to that number — which essentially never happens here, since recipients aren't expected to message back. Outside that window, the WhatsApp Business API only permits a **pre-approved template** with fixed wording and named variable slots (§4.8's constraint, made concrete) |
| SMS (India) | TRAI's DLT regime requires every commercial SMS template to be pre-registered with the carrier before it can be sent; an unregistered freeform message is silently dropped, not merely discouraged |

So the composer has to branch by channel, not present one universal text box: **email gets a plain text field; WhatsApp and SMS get a picker constrained to that requirement's approved `MessageTemplate` rows, with only the variable slots editable.** Building this as one universal "type and send" box would work in every demo and then silently fail to deliver on WhatsApp the first time it's used against a real recipient.

Two schema consequences: `reminder_dispatch` gains a `trigger_type` column (`scheduled | manual | conditional`) so a manual send doesn't compete with the automated cadence's `(assignment_id, reminder_sequence)` uniqueness constraint — it's its own row, not a slot in that sequence. And a manual send never raises the "reminder was sent" requester-notification event from the taxonomy above — the requester just did it themselves and doesn't need to be told about their own action.

### Message templates and custom copy

Today's `ReminderPolicy` only carries cadence and channel — no actual words. That gap gets its own entity: **`MessageTemplate`** — `id, workflow_template_id, case_id, event_type, channel, body, provider_template_id, created_by, updated_at`. Exactly one of `workflow_template_id` / `case_id` is set — a template defines the default copy, a case can override it, the same inheritance already used for `ReminderPolicy` itself.

`body` stores the raw text with variable tokens still in place (`{{party.name}}`, not the resolved value) — rendering happens at send time. A message like *"If you have not completed this step, please do that right now"* is exactly a `MessageTemplate.body` attached to whichever event type it belongs to.

For WhatsApp and SMS, `body` is not arbitrary even in this editor: it has to mirror a template already submitted to and approved by the provider (`provider_template_id` links to that approved template), and only the variable values are actually editable here — the surrounding wording is fixed the moment it's approved. For email, `body` is genuinely free text. The editor should say this plainly per channel, rather than let someone edit WhatsApp copy that will later fail to match what the provider approved.

### Conditional, per-event messaging — a lookup, not a rules engine

The product doc already takes an explicit, repeated stance against a general conditional-logic engine (§4, §10's "Do not build" list, and the `requirement_definition.visibility_condition` seam, itself deliberately bounded to one hop). This feature stays inside that discipline rather than becoming the exception to it.

What "conditional" means here is narrow and concrete: **the event taxonomy already defined above — due date passed, review needs changes, delivery bounced, and so on — can each carry an optional `MessageTemplate`, optionally scoped to one specific requirement instead of the whole case.** "If `#insurance-certificate`'s due date passes, send this exact message" is a lookup — `(event_type, requirement_id | null) → MessageTemplate` — not an if/then condition builder. There is no AND/OR logic, no cross-requirement conditions, no user-authored boolean expressions. If a real customer need for that shows up later, it gets evaluated as its own decision then, the same way `visibility_condition` was deliberately scoped and left unevaluated until a real need appears — not built speculatively now.

### Message variables — `@` and `#` references

The mechanism that makes the two features above actually usable — and, not incidentally, the same mechanism that makes WhatsApp/SMS template variable slots fillable in the first place, since an approved template's `{{1}}`/`{{2}}` slots need to come from *something* structured.

Two reference namespaces, resolved by stable id rather than by text match so a later rename doesn't silently break an existing message:

- **`@`** — the recipient: `@party.name`, `@party.email`, `@party.phone`, `@party.organization_name`, all existing columns on `Party`. A second, distinct token, `@me.name`, reaches the requester's own name for sign-offs ("regards, @me.name") — kept separate from `@party.*` rather than overloading `@` for both audiences, so an author is never unsure which person a given mention resolves to.
- **`#`** — a requirement within the same template or case, by title: `#insurance-certificate`. Stored as `{{requirement:<id>}}`, not as the literal text "insurance-certificate," so renaming the requirement later updates every message that references it automatically.

Authoring UX: typing `@` or `#` opens an autocomplete list — the standard mention-picker pattern (Slack, Notion, GitHub all do this; not a novel interaction to design). At the **template** level the list is that template's own requirement definitions and the generic party-field placeholders (no live party exists yet, so `@party.name` shows as the token itself, not a resolved value). At the **case** level — specifically the "Send now" composer — the list is that case's actual live party and requirements, and can show a live preview of the resolved text before sending.

**One failure mode worth naming rather than leaving implicit:** a `#`-referenced requirement can be deleted after a message template already references it. The editor must show a visible "this reference no longer exists" warning on that template rather than silently sending a message with a blank or broken substitution — the same posture §4.4 already takes toward never leaving someone to guess at broken state.

### What this adds to the entity list above

- `ReminderPolicy` gains `notify_requester_on_send: boolean` (default `false`) — the switch behind the one non-default row in the taxonomy table.
- `WorkflowTemplate` gains a default `ReminderPolicy` reference, inherited by cases at instantiation, mirroring how requirement definitions already snapshot into a case.
- Two new entities: `NotificationPreference` and `Notification`, both defined above.
- A third new entity: `MessageTemplate` (above) — carries actual message copy, inherited from template to case the same way `ReminderPolicy` is, optionally scoped to a single requirement for the conditional-messaging case.
- `reminder_dispatch` gains `trigger_type: scheduled | manual | conditional`, so manual and event-triggered sends never collide with the automated cadence's idempotency constraint.

### Sequencing

This is schema-touching, so where it lands matters:

- **Recipient reminders** (the existing `ReminderPolicy` engine) stay exactly where §10 already puts them — Phase 1a, since the unopened/stalled distinction is load-bearing for the core thesis.
- **Requester notification center** (in-app feed, Notifications tab, email channel, `NotificationPreference`) belongs in **Phase 1b** — "before charging beyond pilots" is exactly when a requester running a real case stops tolerating a dashboard they have to remember to check.
- **On-demand "Send now," `MessageTemplate`, per-event message overrides, and the `@`/`#` mention system** all belong in **Phase 1b** alongside the notification center — same surface (the Notifications tab), same underlying entities, no new infrastructure beyond the `Notify` adapter already planned.
- **WhatsApp and SMS template approval is an operational dependency, not a build task.** Meta's WhatsApp template review and India's DLT SMS registration both take real calendar time and happen outside this codebase entirely. Start that process before Phase 1b needs it, not when it's already blocking a release — email needs none of this and can ship first regardless.
- **Browser/desktop push** is **Phase 2 or later** — new infrastructure (a Web Push adapter) that doesn't touch the completion-engine thesis actually being tested in the pilots, so building it early would be the same kind of scope creep §10 already warns against elsewhere.

---

## **6\. Technical practicality**

## **Collect is practical**

A capable full-stack developer can build a useful Collect beta on standard managed infrastructure.

| Milestone | Approximate effort, one experienced developer |
| ----- | ----- |
| Concierge prototype using existing tools | 1 to 2 weeks |
| Minimum shippable Collect (single-party, upload \+ answer, reminders, review) | 4 to 6 focused weeks |
| Functional Collect beta (full Phase 1 list) | 6 to 10 focused weeks |
| Production version appropriate for sensitive business documents | 3 to 5 months |
| Signing-provider integration after Collect stabilizes | 1 to 3 additional weeks |
| Credible native e-signature infrastructure | Not advisable as a founder build |

These are engineering estimates, not delivery promises. Security review, customer requirements, and integrations expand scope substantially. At side-project pace rather than full-time, multiply by roughly two.

## **Practical architecture**

* PostgreSQL for workflow and audit metadata  
* S3-compatible object storage  
* Direct-to-storage uploads via short-lived signed URLs  
* A queue for reminders, scans, exports, and webhook processing  
* A transactional email provider with bounce and complaint webhooks  
* A Web Push adapter (service worker \+ VAPID keys) for requester-facing browser/desktop notifications — Phase 2+, see "Notification and reminder model" in §5  
* A managed authentication provider for requester accounts only  
* An external e-signature API  
* Server-side PDF generation only where genuinely needed  
* An append-only audit event model  
* Optional email or SMS OTP

**The recipient page deserves disproportionate engineering effort.** It must be mobile-first, resumable across sessions, tolerant of large files on weak connections, and functional on a mid-range Android device. It is the only surface most users of the product will ever see, and its completion rate is the product's core metric.

## **Security features that are part of the product, not polish**

Because users will upload tax forms, identity documents, contracts, and financial records, the following belong in the production baseline rather than a later hardening pass:

* Strict tenant isolation  
* Encrypted transport and encrypted storage  
* High-entropy invitation tokens, hashed in the database  
* Revocable and expiring access  
* File size and type limits, MIME and magic-byte validation  
* Malware scanning  
* Rate limiting and upload quotas  
* Audit logs  
* Backup and restore procedures  
* Configurable retention and deletion  
* Privacy and data-processing documentation, subprocessor transparency  
* Requester-side role-based access control  
* Secure, expiring document download links  
* Monitoring for unusual download activity

Competitor positioning shows buyers already expect this: Content Snare advertises ISO 27001, FileInvite carries SOC 2 Type II with malware detection, MFA, and audit controls. A new entrant will be asked.

**India-specific note.** Under the DPDP Act, storing financial statements, identity documents, and salary records carries real obligations. Avoid handling Aadhaar entirely in early versions; it is its own regulatory regime with additional restrictions and is not a fight worth having in a first product.

---

## **7\. Build or integrate Sign?**

## **Recommendation: integrate**

The user experience of signing is trivial to reproduce. The difficult parts are document finalization, evidence generation, signer attribution, audit integrity, signature validation, retention, jurisdiction-specific levels, delivery of completed copies, certificate and timestamp handling, dispute support, and provider uptime and security controls.

Infrastructure is cheap enough that building it produces almost no economic advantage:

| Provider | Indicative API cost |
| ----- | ----- |
| SignWell | First 25 documents monthly free, then from roughly $0.85 per document, falling with volume |
| DocuSeal | Around $0.20 per completed document, including multiple files or parties per submission |
| BoldSign | Around $0.75 per document |
| PandaDoc | $40/month developer plan for 40 documents; free developer tier of 60 documents per year |

For India-specific statutory signing, evaluate Digio, Leegality, or Zoho Sign rather than the US and EU providers above, since Aadhaar eSign and DSC flows require a CCA-compatible provider.

**The value is not drawing the signature.** The value is knowing which signature is needed, from whom, alongside which uploads and answers, what remains incomplete, when to remind, when the whole packet is complete, and what expires later.

Own the orchestration layer. Rent the signature infrastructure. Keep the provider invisible or lightly branded so the unified recipient experience holds.

---

## **8\. Market attractiveness by launch wedge**

## **Wedge comparison**

The market validation report scored wedges on market attractiveness. That is the right analysis for choosing a company and the wrong analysis for choosing a first shipped product. Two columns are added below for the constraint that actually applies here.

| Wedge | Pain | Freq | Pricing power | Competition | Product fit | Solo reachability | First-app feasibility | Market score | First-app score |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Freelancers / agencies | 5 | 5 | 3 | 2 | 8 | 9 | 8 | 4.6 | 5.5 |
| **Accounting / bookkeeping** | 8 | 8 | 6 | 3 | 8 | 8 | 8 | 6.6 | **7.5** |
| **Vendor onboarding** | 9 | 8 | 8 | 5 | 9 | 3 | 3 | **8.0** | 6.0 |
| Subcontractor compliance | 9 | 9 | 8 | 5 | 9 | 3 | 2 | 8.2 | 5.9 |
| General HR onboarding | 7 | 8 | 7 | 3 | 7 | 5 | 6 | 6.4 | 6.3 |
| Legal client intake | 8 | 7 | 7 | 3 | 8 | 6 | 6 | 6.6 | 6.6 |

These are comparative analytical judgments, not survey statistics. The precision implied by one decimal place is false; treat gaps under one point as noise.

**The reading:** vendor onboarding and subcontractor compliance win on market and lose badly on feasibility, because both require a security posture, a procurement cycle, and a buying committee. Accounting wins the combined view. The correct strategy is not to choose one permanently but to sequence: **launch on accounting, migrate up-market to vendor and subcontractor compliance once the engine is proven and a security story exists.**

### **8.1 Freelancers and agencies**

**Verdict: product feedback, not the core market.**

Real, but heavily commoditized at the low end. Using US County Business Patterns data for 2023, roughly 15,500 advertising-agency employer establishments and more than 52,000 marketing-consulting employer establishments imply a crude employer-only US TAM of about $48 million ARR at $59 per month, before nonemployers or international customers. Theoretical TAM is not serviceable demand; much of this segment already uses bundled software or will stay on email and Drive permanently.

Likely pricing band $29 to $79 per month, which makes paid acquisition unworkable and puts all weight on self-serve onboarding and organic distribution.

**Use them as design partners.** They give fast feedback, they will dogfood, and they cost nothing to reach. Do not build the thesis on them.

### **8.2 Accounting and bookkeeping**

**Verdict: the recommended launch wedge, entered through a narrow workflow.**

This segment validates nearly every part of the recipient thesis: specific document requests, repeated chasing, monthly and seasonal cycles, sensitive data, signatures, review and rejection, reusable lists, and prior-period history.

Crucially, it is the only high-pain segment that exercises **recurrence and carry-forward** from the first customer. That matters enormously, because recurrence is where the product's structural differentiation lives, and it is the reason to choose accounting over the easier agency wedge and the richer vendor wedge.

**The risk is bundling.** TaxDome, Karbon, and Ignition now offer client requests, file exchange, signatures, reminders, and workflow automation inside the practice platform. Launching as "another accounting client portal" walks directly into that.

**Enter through one of these narrower workflows instead:**

* Monthly and quarterly bookkeeping-close document collection  
* Prepared-by-client audit request lists  
* Outsourced CFO monthly reporting packs  
* One-off information requests across many client entities  
* Document chasing that deliberately works *outside* the firm's primary portal

That last one is worth dwelling on. A practice that already owns TaxDome still chases documents by chat, because the portal is where documents are stored, not where clients actually respond. Positioning as a complement rather than a replacement removes the strongest objection in the segment.

**Recommended launch ICP:** accounting and tax practices with roughly 20 to 200 recurring clients, where one person owns the chasing, the buyer is the practice owner or manager, and the current process is a spreadsheet plus a chat thread.

### **8.3 Vendor onboarding**

**Verdict: the best business, the wrong first customer. Expansion target for month nine onward.**

The workflow is a natural fit: structured company information, tax forms, insurance certificates, signed policies, NDAs, approvals, internal handoffs, expiry, auditability, and reminders. All four action types appear, and expiry is intrinsic rather than bolted on.

The evidence shows both severity and the implementation trap. Mid-market teams describe email-and-spreadsheet workflows; suppliers complain that complicated vendor portals create work without giving them any value. One large-organization user reported their dedicated vendor platform was universally disliked and the previous spreadsheet worked better. That is a direct endorsement of the no-account thesis.

Incumbents are broader rather than better: Gatekeeper combines vendor onboarding with contracts, third-party risk, screening, spend, performance, and lifecycle management; Precoro embeds onboarding inside a full procure-to-pay suite. **The opportunity is the missing middle:** not procurement, not spend management, not contract lifecycle management. Just get the vendor packet complete.

**Why it is nonetheless wrong as a first launch:** the buyer sits in Finance or Procurement, a security questionnaire is near-certain, the decision involves several people, and the report's own estimate for a version safe enough to handle this data is three to five months. A first-time solo builder attacking this first spends a quarter building and a further quarter learning that mid-market finance does not buy from unknown vendors without certifications.

### **Recommended initial ICP**

For the vendor-onboarding phase, once reached:

* 50 to 1,000 employees  
* Roughly 10 to 100 new or renewed vendors per month  
* Finance, AP, Operations, Procurement, or Legal owns the workflow  
* Current process uses email, PDFs, spreadsheets, or Forms  
* Enterprise procurement software is considered excessive  
* Missing documentation demonstrably delays vendor activation or payment

That final bullet is the qualifying question. If missing paperwork costs nothing, there is no deal.

### **Initial product package**

* Business information (structured answers)  
* Tax-form upload  
* Certificate-of-insurance upload  
* NDA or policy acknowledgement  
* Review and resubmission  
* Automated reminders  
* Internal owner assignment  
* Completion dashboard  
* Completed packet export  
* Audit history  
* Insurance and document expiry tracking

**Explicitly excluded from the earliest beta: banking-detail collection and changes.** Bank-detail collection creates fraud, impersonation, access-control, and verification risk out of proportion to its value. Add it only with step-up authentication, restricted field visibility, an independent out-of-band change-verification process, and a written customer operating policy.

### **8.4 Subcontractor compliance**

**Verdict: potentially the strongest long-term vertical, the weakest first one.**

This is where expiry stops being a feature and becomes the product. The customer needs to know which company is cleared, which worker is cleared, what is missing, what expires before the next shift, who may enter the site, and what evidence exists for an audit or an incident.

TrustLayer and similar products already validate the category around certificates of insurance and contractor compliance, automatically collecting documents and flagging missing, invalid, or expired coverage.

A viable narrower entry would be smaller general contractors, project-level worker credentials, mobile-first subcontractor submission, regional licensing, "who is cleared for site tomorrow," and one-click project compliance packs.

Higher domain complexity than vendor onboarding, and likely stronger retention. Revisit once the engine, the expiry model, and a security story all exist.

---

## **9\. Positioning recommendation**

## **Your current headline**

#### *Get anything from anyone, signed, uploaded, or both, without them creating an account.*

Good product vision. Poor launch headline.

The problems: "anything" is vague; "anyone" erases buyer context; it emphasizes mechanics over outcomes; it gives no reason to switch from email, Drive, or chat; it communicates no urgency, risk, or ROI; and every horizontal competitor can make the identical claim.

## **Recommended vendor-onboarding headline**

> **Get every vendor packet complete, without supplier accounts.**

Supporting line: *Collect tax forms, insurance certificates, business details, acknowledgements, and signatures through one secure link. Automatically remind vendors about only what is missing.*

Alternative: **Stop chasing vendors for missing paperwork.** Supporting line: *Send one link for every file, answer, and signature. Review submissions, request corrections, track expiry, and export one complete vendor packet.*

**Recommended accounting launch headline** (for the wedge this document actually recommends first):

> **Close every client's month without chasing them.**

Supporting line: *One link per client, per period. Gather asks only for what is missing, never re-asks for what you already hold, and tells you exactly which client is blocking the close.*

The "never re-asks for what you already hold" clause is the carry-forward differentiator stated as a customer benefit. It is the single most persuasive sentence available and no incumbent can currently say it.

## **Recommended category**

Do not describe the product as a client portal, document management, e-signature software, a workflow builder, or a vendor-management system. Each of those categories has an entrenched leader and a price ceiling.

Use: **external request completion software.**

Internally the product stays horizontal. Publicly it always leads with a vertical outcome.

---

## **10\. Revised MVP**

## **Phase 0: concierge validation**

Before writing production code:

1. Assemble a client-close packet manually using lightweight forms, secure storage, and an existing e-sign provider.  
2. Operate the reminders by hand, on a schedule, exactly as the product would.  
3. Track statuses in an internal dashboard or spreadsheet.  
4. Process live cases for design partners.  
5. **Charge for it.**

The purpose is not to see whether people compliment the interface. It is to test whether a buyer will let real client data flow through the process and pay for the outcome. Two to five companies is enough. One to two weeks.

## **Phase 1: Collect beta**

The market validation report's Phase 1 contains roughly seventeen items. That is a 1.0, not a first shippable product. Split it.

**Phase 1a, minimum shippable (target 4 to 6 focused weeks):**

* Requester organizations and users  
* Reusable workflow templates  
* Cases and packets  
* Upload and answer requirements (acknowledge if trivial)  
* Single-party assignment  
* Magic-link recipient access  
* Mobile-first recipient page, resumable  
* Reminders for missing items only, with the unopened versus stalled distinction  
* Review: approve or request changes, with the reason feeding the next reminder  
* Versioned resubmission  
* Requester dashboard showing what is blocking each case  
* Complete-packet ZIP export

**Phase 1b, before charging beyond pilots:**

* Optional email or SMS OTP  
* Delivery and bounce tracking  
* Append-only activity history  
* Requester notification center — in-app feed, per-case Notifications tab, email channel, per-event preferences (see "Notification and reminder model" in §5)  
* On-demand "Send now" messaging, `MessageTemplate` custom copy, per-event message overrides, and the `@`/`#` mention system (same section) — WhatsApp/SMS need provider template approval in parallel, which should start early since it isn't work this codebase controls  
* Retention and deletion controls  
* One storage export integration  
* Multi-party assignment

**Do not build:** generic automation builder, marketplace, payments, AI extraction, dozens of integrations, persistent recipient accounts, advanced analytics, full procurement, native signing, a general conditional-logic / rules engine (the bounded per-event message lookup in §5 is not this), in-app chat, document generation.

## **Phase 1.5: validity and renewal**

* Document types and the `subject_type` / `subject_id` ledger  
* Effective and expiry dates  
* Expiring-soon policies and responsible owners  
* **Recurring cases with carry-forward** (skip what is already held and current)  
* Renewal requests and superseded-document history  
* Current compliance state and expiry dashboard

This is where the product begins earning a premium and where retention stops depending on goodwill.

## **Phase 2: Sign through a provider**

* Signing-provider integration  
* One-signer acknowledgements first  
* Multi-party envelopes behind a feature flag  
* Signer consent capture  
* Exact document version locking  
* Completed document plus evidence certificate  
* Decline and void handling  
* Delivery of the final copy  
* Customer-selected authentication level  
* Published supported-jurisdiction documentation

---

## **11\. Pricing strategy**

## **Why generic pricing will be difficult**

Portico anchors low: free for three monthly onboardings, $29 for 25, $59 for 100, $119 for unlimited, billed annually. Content Snare anchors at $35 to $119 per month billed annually.

A generic product at $49 per month would have to win on distribution or dramatically superior UX. The feature bundle alone does not justify switching, and switching is the actual barrier since the incumbent is usually a free habit rather than a paid product.

## **Suggested vertical pricing hypothesis**

**Vendor onboarding (expansion phase, USD):**

| Plan | Indicative price | Scope |
| ----- | ----- | ----- |
| Starter | $99/month | 25 active vendor packets, uploads, answers, reminders, review |
| Team | $249/month | 100 active packets, multiple users, storage export, expiry tracking |
| Compliance | $499/month | Higher volume, detailed audit, SMS, advanced roles, retention policies, API and webhooks |
| Enterprise | Custom | SSO, regional storage, custom controls, contractual SLA |

**Accounting practices (launch phase):** price substantially lower and expect roughly a tenth of the revenue per customer in price-sensitive geographies. A viable structure is a low entry tier tied to active client-cases per period, with a mid tier adding multiple users and expiry tracking. Validate the exact numbers in interviews rather than assuming them.

**Charge primarily by active packets, completed packets, or active external entities. Avoid seats as the primary value metric. External recipients are always free.**

For Sign, include a small bundle and charge roughly $1 to $2 per completed envelope above the allowance. Provider cost stays well below that at normal volume.

A free tier is a support-cost trap at this stage. Prefer a time-limited trial and a low entry tier.

## **Illustrative economics**

| Customers | ARPA | ARR |
| ----- | ----- | ----- |
| 500 | $299/month | $1.79 million |
| 2,500 | $299/month | $8.97 million |
| 10,000 | $299/month | $35.88 million |

These are scenario calculations, not forecasts, and they describe the vendor-onboarding endgame rather than the accounting launch.

The relevant question is not whether millions of potential users exist. It is whether the product can support $200 to $500 monthly accounts at all. If it cannot, the ceiling is a side income rather than a company, which may well be an acceptable outcome here but should be a chosen one rather than a discovered one.

---

## **12\. Validation plan and pass/fail criteria**

Desk research validates the pain and invalidates the claim of horizontal novelty. It cannot prove this particular product will find fit. Nothing in this document substitutes for the following.

## **Customer discovery**

Interview 20 to 25 people from one vertical. **Ask them to reconstruct their last actual case. Never ask whether they "would use" the product.**

Uncover: what was requested; who requested it; who supplied it; how many reminders occurred; where each document ended up; what was missing or rejected; how long completion took; what happened because of the delay; how often the workflow recurs; which tools were considered; why the current process has not already been replaced; who owns the budget; what security review is required.

Listen for the confirming phrases: "I chase them on chat," "they sent the wrong month," "I keep a sheet of who has given what," "I had to ask three different people." Listen equally hard for the disconfirming one: "my existing tool already handles this." Take that seriously rather than arguing with it.

## **Paid concierge pilot**

Five companies, real packets, real money.

| Signal | Minimum useful threshold |
| ----- | ----- |
| Qualified interviews reporting the pain monthly | 10 of 20 |
| Prospects willing to run a real live case | 5 |
| Prospects willing to pay before full product completion | At least 3 |
| Median reduction in manual follow-ups | 30% or more |
| Packets completed without off-platform email attachments | 70% or more |
| Recipient first-attempt completion | 60% or more |
| Buyer uses the product repeatedly during the pilot | Weekly, or tied to every new case |
| Pilots asking to add more workflows or entities | At least 2 |

## **Strong invalidation signals**

Stop, or change the wedge, when:

* Customers process fewer than five relevant cases per month  
* Buyers like the demo but will not move one live case into it  
* No qualified buyer pays the target entry price  
* The feature is already bundled into software they cannot replace  
* Value appears only after several deep integrations are built  
* Recipients still require phone coaching to complete a case  
* Most submissions continue arriving by email or chat regardless  
* The customer's real pain turns out to be internal approvals, purchasing, or payments rather than external collection  
* Every prospect demands a different workflow before receiving any value

**The single most important test:** *will the customer enforce this as the default completion path?* A system cannot eliminate chasing if the requester keeps accepting files by email or chat whenever someone resists. If the answer is no, no feature fixes it.

---

## **13\. Recommended decision**

## **Keep**

* No-account recipient experience  
* One link per recipient or packet  
* Missing-item reminders, with the unopened versus stalled distinction  
* Completion tracking and a dashboard that answers "what is blocking this case"  
* Reusable workflow templates  
* Versioned, immutable submissions  
* Expiry-aware expansion path  
* Horizontal internal architecture  
* Collect-first sequencing

## **Change**

* Add structured answers as a core action type  
* Add a requester-facing notification system (in-app feed \+ per-case Notifications tab), kept explicitly separate from the recipient-facing reminder engine — event-driven, not schedule-driven  
* Add on-demand manual messaging, per-event custom message templates, and an `@`/`#` variable-mention system, all bounded as a lookup rather than a rules engine — and account for WhatsApp/SMS's pre-approved-template constraint from day one rather than discovering it once "Send now" is built  
* Separate fulfilment, review, delivery, validity, and signature states into independent axes  
* Model assignment separately from requirement  
* Model document validity against a subject, not a request item  
* Add a per-party ledger to enable carry-forward on recurring cases  
* Make the rejection reason drive the next reminder rather than sitting as a note  
* Show completed items as collapsed history, not hidden  
* Treat magic links as low-friction access, never as identity proof  
* Integrate e-signature infrastructure rather than building it  
* Support multi-party eventually, but design the schema for it now  
* Position around a vertical business outcome  
* Use agencies as design partners rather than the primary market  
* Split the Phase 1 list into a genuinely minimum shippable subset

## **Reject**

* The shared request engine as the primary moat  
* "Anything from anyone" as launch positioning  
* Channel reach as the differentiation argument  
* Native e-signature infrastructure in the first product  
* Universal "legally binding" claims  
* Banking-detail collection in the first beta  
* Aadhaar handling in early versions  
* Launching simultaneously into agencies, accountants, vendors, HR, and construction  
* Mid-market vendor onboarding as the *first* wedge, notwithstanding it being the best market

---

# **Final verdict**

**The problem is valid. The horizontal product thesis is not sufficiently differentiated. The differentiation available is structural rather than featural, and it is worth building for.**

The best version of this company is not:

> A simpler combination of Dropbox file requests and DocuSign.

It is:

> A completion system that knows what must be received, from whom, by when, what qualifies as acceptable, who must review it, what is already held and still valid, and when it must be renewed.

That distinction changes everything downstream: positioning becomes specific, willingness to pay rises, the workflow becomes recurring, expiry and carry-forward create retention, security becomes an advantage rather than a cost, integrations become defensible, and the horizontal engine stays reusable underneath.

**The decision: conditional GO on a vertical, collect-first version.**

Launch on recurring professional-services document cycles, specifically accounting and tax practices, narrowed to the close rather than positioned as another client portal. Add structured answers, review and resubmission, and carry-forward. Integrate Sign only after paying customers prove the collection loop is valuable. Move up-market into vendor onboarding and subcontractor compliance once the engine is proven and a security story exists.

**NO-GO** on the generic horizontal product, on native signing, and on mid-market vendor onboarding as the first wedge.

**Kill condition:** failure to obtain at least three paid live pilots from the first 20 to 25 qualified interviews in the chosen vertical.

**The largest unresolved risk in this document** is that everything above is reasoning rather than evidence. The thesis is internally coherent, which is precisely what makes it dangerous to build on before three people have paid for it. Section 12 is not the last chapter. It is the next one.
