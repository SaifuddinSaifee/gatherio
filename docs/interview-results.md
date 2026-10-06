# Interview Results

Running log of customer interviews: what I asked, what they said, and what we should learn from it.
Companion to [gather-io-interview-playbook.md](gather-io-interview-playbook.md) (hypotheses H1 to H8 are defined there).

**How to update:** add a new `## Interview #N` section at the bottom, then fold anything new into the **Learnings so far** section at the top. Keep quotes verbatim. Mark anything I'm inferring as *(inference)*.

---

## Learnings so far

*Last updated: 2026-10-06, after interview #2.*

### Patterns (seen in more than one interview)

| Pattern | Seen in | Note |
| --- | --- | --- |
| The work recurs on a fixed, predictable calendar (annual for loan renewals, quarterly for GST, a March to April peak for income tax). | #1, #2 | Scheduling is feasible. Cadence differs by vertical, so it must be configurable. |

Only one pattern so far, and it is about cadence, not pain. Nothing yet confirms that the requester feels the chasing pain directly.

### Conflicts between interviews

| Topic | #1 (loan agent) | #2 (tax practitioner) | Working explanation |
| --- | --- | --- | --- |
| H4 carry-forward | Strong need: re-asks the same people for the same documents every 12 months. | Contradicted: he already holds everything in software and asks for nothing twice. | *(inference)* Carry-forward hurts a requester who has no durable store of their own. An established practitioner with 8 years of archive has already solved it for himself. Test this in the next interviews before treating H4 as general. |

### Single-interview signals (not yet patterns)

| # | Signal | Hypothesis | Source | Confidence |
| --- | --- | --- | --- | --- |
| 1 | Loan applicants return every 12 months. About half the documents are unchanged (ID/KYC), half must be re-uploaded (bank statements, P&L, balance sheet). | H4 carry-forward | Interview #1 | Medium: one agent, second-hand description of their clients |
| 1 | Applicants don't have the storage on phones/PCs to keep copies of old documents, so the requester ends up re-asking for files they already received once. | H4, H1 | Interview #1 | Medium |
| 2 | The practitioner does not chase. A staff accountant (varies per client) gets the documents, structures them and hands over. The practitioner only waits on OTPs at filing time. | H6 | Interview #2 | Medium: clear statement, but no hours or cost captured |
| 2 | He calls the client himself only when the client still doesn't respond, and says this is very rare. | H6, H8 | Interview #2 | Medium |
| 2 | Documents arrive as PDFs on WhatsApp, some by email. Physical papers are photocopied, archived, and passed to the accountant. | H1, H8 | Interview #2 | Medium: no portal in play, so no H1 evidence either way |
| 2 | Re-asks nothing from returning clients: identity and registration data sit in his software, retrieved by Document ID. Only OTPs and fresh bank statements are needed. | H4 (against) | Interview #2 | Medium |
| 2 | Charges ₹550 a month per GST client. Software spend: "can't say". | H7 | Interview #2 | Low: basis of the fee unclear, spend unknown |
| 2 | Notice work arrives daily ("at least one" a day). Reopening after a reply is accepted happens 1 to 2 times a year, when a client forgot to give the filing practitioner income documents. | Reopen-after-close state | Interview #2 | Medium: rare, but the cause is a missed document from the client |

### Product implications (draft)

1. **Carry-forward is a first-class feature, not a nice-to-have, for requesters with no document store.** For loan renewals, the 12-month cycle is the whole use case. A new case should start pre-filled from the borrower's last case. *(Scoped by interview #2: not every vertical needs it.)*
2. **Documents need a type: stable vs. periodic.** Stable (Aadhaar, PAN, identity/address proof) carries forward. Periodic (bank statements, P&L, balance sheet) is re-requested every cycle. This should be a property of the document type in the checklist template, not a manual decision per case. Interview #2 matches: stable data lives in his software, bank statements are re-collected each cycle.
3. **We become the borrower's long-term document store.** The agent's problem is partly that the borrower can't re-send what they no longer have. If we hold the stable documents, the borrower never needs to find them again.
4. **Cycle scheduling.** A closed case should be able to schedule its successor about 12 months out, with a lead time so periodic documents are requested before the renewal deadline. *(inference: exact lead time needs asking.)* Interview #2 adds a quarterly GST cycle and a March to April filing season, so the interval and the lead time must be configurable per template.
5. **The primary user may be a staff member, not the principal.** In #2 the accountant collects and chases and the advocate barely touches it. Roles need a collector/chaser who is not the case owner, and the owner needs a read-only view of status. *(inference. See [../roles-and-tenancy.md](../roles-and-tenancy.md).)*
6. **Staff must be able to add documents on a client's behalf.** Clients send PDFs on WhatsApp, email, or hand over paper. If the requester will accept all of these (H8 is weak here), a no-account link is an optional extra channel, and "upload for the client" is a required one. *(inference)*
7. **OTP waits are a real blocker at filing time.** The only thing he says he waits on is an OTP. *(inference: this is a time-boxed, live request to the client, different from document collection. Worth asking whether it is a pain worth modelling.)*
8. **Price ceiling is low if the fee is per client.** ₹550 a month per GST client means per-client software cost has to be a small fraction of that. *(inference. Needs his client count and software spend to mean anything.)*

### Risks and open questions raised by what I heard

- **Storing Aadhaar/PAN long term has legal and consent implications.** Needs checking before we commit to retaining them (Aadhaar storage rules, DPDP Act consent and retention). *(inference, not from the interview; verify before building.)*
- **Do the stable documents really stay valid for 12 months?** Address changes, expired ID, re-issued PAN. Carry-forward needs a "still valid?" confirmation step. *(inference)*
- **Who owns the borrower relationship?** If the agent changes employer, do the borrower's documents stay with the agent, the lender, or the borrower? Affects tenancy design. See [../roles-and-tenancy.md](../roles-and-tenancy.md). *(inference)*
- **The person who feels the pain may not be the person we interviewed.** In #2 the pain sits with the accountant who chases, and with the client who must send documents. We have not spoken to either. *(inference)*
- **Competing with a cabinet and a PC.** His archive (8 years of physical files, current year on PC) works for him and he trusts it. A digital store has to beat "I always have a physical copy". *(inference)*
- **Bundling risk.** He already uses software that stores client details by Document ID. Unknown what it is or whether it can collect documents. *(inference)*

### Questions to ask in the next interviews

- Is 12 months the same for every loan type, or only for working-capital / renewal products?
- What fraction of applicants actually return to the same agent each year?
- When a returning applicant is asked for the same document again, what happens? Delay, drop-off, complaint?
- Do they currently keep applicants' old documents themselves (WhatsApp, Drive, email)? How do they find them a year later?
- Would the lender accept a document collected last cycle, or does policy require a fresh copy of everything?
- Who actually does the chasing, and can I speak to them? (From #2: ask for the accountant, not only the principal.)
- What software holds your client records and Document IDs today, and what does it cost a year?
- How many clients in total, and what do you charge per notice reply? (Both unanswered in #2.)
- When a purchase credit doesn't match, who do you chase: the client or the client's suppliers? (Unanswered in #2.)

---

## Interview #1: Loan processing agent

**Date:** 2026-10-06
**Who:** Loan processing agent (individual agent, not a bank branch manager)
**Warm or cold:** *(fill in)*
**Revealed the product?** *(fill in)*
**Length:** *(fill in)*

### What I asked and what I heard

> The exact wording of my questions wasn't recorded when this entry was created. Add it below so this log stays verbatim.

| Question I asked | Their answer |
| --- | --- |
| *(fill in)* | Repeat applicants come back to apply for loans, and the frequency is **every 12 months**. |
| *(fill in)* | About **half the documents stay the same** (e.g. Aadhaar card, PAN card). The other half (**bank statements, profit and loss statements, balance sheet**) need to be **re-uploaded** each time. |
| *(fill in)* | Applicants **don't have enough storage on their phones and PCs** to keep all their documents, so they'd rather not hold the unchanged ones themselves. |
| *(fill in)* | The problem the agent faces: they have to **ask the same person for the same documents again 12 months later**. |

### Verbatim quotes

1. *(add exact words if I wrote them down)*

### Learnings from this interview

- **Strong H4 (carry-forward) evidence from the loan vertical.** The agent describes re-asking the same people for documents already held as an actual problem. Playbook scoring: unprompted or prompted is *(fill in)*.
- The pain is on **both sides**: the agent re-chases, and the applicant has no copies to send. Solving only the agent's side (a better checklist) wouldn't fix the missing-copies problem. Holding the stable documents does.
- The document set splits cleanly into **stable** and **periodic**. This gives a concrete rule for the template design.
- The cycle is **annual and predictable**, which makes scheduled re-requests feasible.

### Not yet known from this interview

- Volume: how many returning applicants per month or year.
- Cost: time spent per re-collection, who does it, cost per hour.
- Whether the lender permits reuse of last year's stable documents.
- H1, H2, H3, H5, H6, H7, H8: no signal recorded.
- Whether the agent could decide to buy or adopt a tool alone (H7), and whether they'd enforce a portal/link as the default path (H8).

### Surprise

*(fill in: the thing I didn't expect)*

### What I got wrong

*(fill in)*

### Next action

*(fill in, with date)*

---

## Interview #2: Advct. Abhay Kulkarni, tax practitioner (GST, income tax, notices and appeals)

**Date:** 2026-10-06 *(date logged. Confirm the interview date.)*
**Who:** Advct. Abhay Kulkarni. Practising for about 8 years. Handles GST, income tax, and notices and appeals. A staff accountant prepares each client's case.
**Warm or cold:** *(fill in)*
**Revealed the product?** *(fill in)*
**Length:** *(fill in)*

> **About the answers below:** they are my notes of what he said, written in the third person, not his direct words. Nothing here is a verbatim quote unless it is in quotation marks, and even those are lifted from my notes. Questions are the playbook wording, as I put them to him.

### What I asked and what I heard

#### Scope and live work

| Question I asked | Their answer |
| --- | --- |
| What share of your work is GST, income tax, and notices or appeals? How many clients in each? | All of his work is GST and income tax. He has **no registry**, just folders per client. He knows which client gets what: GST only, income tax only, both, or notices and appeals on income tax without GST. **No solid numbers.** |
| Which clients are you waiting on right now? What's missing from each, and since when? | **None, for documents.** The accountant collects and structures every document and passes it on. The only thing he waits on is **OTPs while filing**. Documents are needed heavily in the **March to April** filing season, otherwise **quarterly**. He compared it with his own accountant asking him for statements and sales/purchase records once every three or four months. |

#### GST cycle

| Question I asked | Their answer |
| --- | --- |
| Walk me through the first ten days of last month. What did you actually do? | GST is filed **every three months** and he has done it that way for **8 years**. He needs the **bank statement, the purchase history, and who the client purchased from**. He enters the bills into a **software**, tags the type of goods each bill represents, and gets the tax amount. **The client pays the tax**, and the accountant files. |
| How do clients send purchase and sales bills? | **WhatsApp, as a bunch of PDFs.** Some by **email**. |
| How many send everything on time? How many need three or more reminders? | **All of them**, because the accountant prepares the case and goes after each client for the bank statement and the rest. |
| When the client's input credit doesn't match, who do you chase? | **Not answered.** *(Hidden multi-party test, H2. Still open.)* |

#### Notices

| Question I asked | Their answer |
| --- | --- |
| Take the last notice you replied to. What did the department ask for, and what did you need from the client? | Did not reconstruct a case. Said there is **"at least one" every day**. *(Missed. The notice side is where the playbook says to spend real time.)* |
| Has a reply been accepted and then the department asked for more later? | **Yes, but very rare.** They try to understand the case well and **wrap it up in one shot**. About **1 to 2 a year** need reopening, for example when the client forgot to send the filing practitioner some income documents that should have been reported. |
| Has a client ever been penalised or lost a case because documents came late? What did it cost? | **"All the time", but not through him.** He is punctual and works with people who are sincere about it. **Extensions** also exist. *(Ambiguous: unclear whether "all the time" is about the market in general or his own clients. No rupee cost captured.)* |

#### Repeats and carry-forward

| Question I asked | Their answer |
| --- | --- |
| What do you ask the same client for every year that you already have? | **Nothing.** Everything is stored in a software. He needs only the **Document ID**, then the rest happens with **OTP** and other documents such as the **bank statement**. |
| Where are old clients' documents kept? Show me how you'd find one. | A **big cabinet of files and binders**, with **8 years of documents per client**, well preserved. The **current year is on his PC**. Other years might or might not be on the PC, but **he always has a physical copy**. *(I did not fully understand how he finds a specific document. Needs a follow-up.)* |

#### Money and decision

| Question I asked | Their answer |
| --- | --- |
| Who does the chasing? How many hours a week, and what do you pay them? | **The accountant**, who varies from client to client. When a client still doesn't respond he **calls the client himself**, which is very rare. **Hours and pay not captured.** |
| What software do you pay for today? Total per year? | **"Can't say."** |
| What do you charge per GST client per month, and per notice reply? | **₹550 a month** *(per GST client)*. **Notice reply fee not answered.** |

#### H8

| Question I asked | Their answer |
| --- | --- |
| If a client says "I'll just bring the papers to your office" or sends WhatsApp photos, what do you do? | For paper, he **photocopies it, stores the copy in his archive, and gives it to the accountant**, who does all the processing and prepares the balance sheets and the rest. |

### Verbatim quotes

> None captured as his own words. Lines below are from my notes, kept for reference.

1. "The only thing he often has to wait on is uh, OTPs while filing the taxes."
2. "he has been doing this for the last eight years"
3. "Everyday, there's atleast one" (on notices)
4. "He had documents for each client for the past eight years, very well preserved actually."

### Hypothesis scores

Scoring scale from the playbook: +2 unprompted evidence, +1 prompted with a specific instance, 0 no signal, −1 contradicted, −2 contradicted with a working alternative in place. Scores are my judgment from the notes.

| H | Score | Why |
| --- | --- | --- |
| H1 no-account | 0 | Clients send WhatsApp PDFs and email. No portal in play, no abandonment story, no password resets. |
| H2 multi-party | 0 | Client, accountant, practitioner, and in principle suppliers, but he named no case with several parties chased separately. The input-credit question went unanswered. |
| H3 rework | 0 | Not tested. The accountant absorbs it, and he did not describe wrong or blurry submissions. |
| H4 carry-forward | −2 | Says he re-asks for nothing. A software holds the stable details and he uses a Document ID. A working alternative is in place. Caveat: this is his side only, and the accountant may still re-ask clients each quarter. |
| H5 expiry | 0 | Not asked. |
| H6 the chaser | +1 | Named human exists (the accountant, varying by client). Hours and cost not captured. |
| H7 can buy alone | 0 | "Can't say" on software spend. He charges ₹550 a month per GST client and appears to be the principal, but nothing on how he buys. |
| H8 will enforce | −1 | Takes WhatsApp, email, and physical papers, photocopies and archives them. Never described forcing a channel. Not a flat "I take whatever they send", so not −2. |

### Learnings from this interview

- **The advocate is a consumer of collected documents, not the chaser.** The accountant does the collecting and chasing. The advocate says he is almost never waiting on a client for documents. For him the pain is thin, and he is probably not the person who feels it. *(inference: the likelier users are the accountants.)*
- **H4 does not hold for him.** He has stored 8 years of documents on paper and in software and re-asks for nothing. This conflicts with interview #1 and narrows where carry-forward matters.
- **H8 is weak.** He accepts any channel and files it himself. A new link or portal would be an extra option for him, not a replacement.
- **GST is quarterly for him, not monthly.** The playbook's CA brief assumed a monthly cycle. *(inference: may be the quarterly return scheme. Check.)* The tax filing peak is March to April.
- **Notices are the high-frequency work.** At least one a day. Reopening after acceptance is rare (1 to 2 a year) and usually traced to a client who forgot to send income documents. This validates the reopen-after-close state at a low frequency.
- **Price anchor.** ₹550 a month per GST client is what he charges. Whatever he would pay for software has to fit inside that.
- **He does not know his own numbers.** No client count, no registry, no software spend. Folders and memory run the practice. This could mean no visibility problem is felt, or a visibility gap exists that he has not noticed. *(inference. Only the next interviews can separate the two.)*

### Not yet known from this interview

- Client counts: total, and by GST / income tax / notices.
- Items per case, % accepted first time, days from request to complete, follow-ups per case.
- Chaser cost: accountant salary and hours a week.
- What the accountant chases and how (WhatsApp is likely, but not stated).
- Input credit mismatch: who gets chased, and whether suppliers are involved.
- The last notice reply: what the department asked for and what the client had to supply.
- Rupee cost of a penalty or lost case.
- Fee per notice reply.
- Which software he uses, what it costs, and whether it can collect documents.
- Whether he can decide to adopt a tool alone (H7), beyond being the principal.
- H2, H3, H5: no signal.

### Surprise

*(fill in. Candidates from the notes, *inference*: he waits on OTPs, not documents; GST runs quarterly; 8 years of paper in a cabinet.)*

### What I got wrong

*(fill in. Observations from the notes, *inference*: several answers were non-answers ("can't say", "everyday there's at least one") instead of reconstructions of one real case, and I interviewed the principal rather than the person who chases.)*

### Next action

*(fill in, with date. Candidate: ask him to introduce the accountant who handles the most clients, and whether I can sit in on a GST cycle.)*
