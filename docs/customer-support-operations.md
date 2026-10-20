# Customer Support Operations

This document describes the customer support operations framework for
BillLens. It covers ticket management, SLA policies, sensitive-data
access controls, audit trails, knowledge base, and status page.

The implementation lives in `src/domain/support/` and
`src/application/support/`.

---

## 1. Overview

Customer support operations are coordinated around the **support
ticket** — a per-user-per-issue object that carries the conversation,
the priority, the channel, and the SLA targets.

CRITICAL: support tools MUST NOT allow admins to view raw receipt
images, UPI IDs, payment references, bank account numbers, or full
backups without strict audit trails AND user consent. This is
enforced by the `data-access-guard` module.

---

## 2. Support tickets

File: `src/domain/support/ticket-model.ts`

A `SupportTicket` carries:

  - 7 statuses: `new`, `open`, `in_progress`, `waiting_customer`,
    `waiting_engineering`, `resolved`, `closed`.
  - 4 priorities: `urgent`, `high`, `normal`, `low`.
  - 4 channels: `in_app`, `email`, `web_form`, `api`.

### Status transitions

```
new → open | resolved | closed
open → in_progress | waiting_customer | waiting_engineering | resolved | closed
in_progress → waiting_customer | waiting_engineering | resolved | closed
waiting_customer → open | in_progress | resolved | closed
waiting_engineering → in_progress | resolved | closed
resolved → closed
closed → (terminal)
```

### Privacy

Ticket subject + body are PII-redacted by the manage-ticket use case
BEFORE storage. The redactor (`redactFeedbackBody` from the feedback
domain) strips:

  - File URIs and absolute paths.
  - Email addresses, UPI VPAs, payment references.
  - Raw OCR text markers.
  - Merchant label lines.
  - Amount expressions (replaced with coarse buckets).

Access to underlying sensitive data (receipt images, UPI IDs) is
gated by the `request-sensitive-data-access.usecase.ts` — never
embedded in the ticket body itself.

---

## 3. SLA policies

File: `src/domain/support/sla-policy.ts`

Each priority has TWO SLA targets:

  | Priority | First response | Resolution |
  |----------|----------------|------------|
  | urgent   | 1 hour         | 4 hours    |
  | high     | 4 hours        | 24 hours   |
  | normal   | 24 hours       | 72 hours   |
  | low      | 48 hours       | 168 hours  |

### SLA status

`computeSlaStatus()` returns the per-ticket SLA status:

  - `met` — the SLA target was met (response / resolution happened
    within the target window).
  - `on_track` — the SLA target has not been met yet, but there is
    more than 20% of the window remaining.
  - `at_risk` — the SLA target has not been met yet, and the
    remaining time is within the 20% at-risk window.
  - `breached` — the SLA target was exceeded (response / resolution
    came in late, OR the ticket is still open and the deadline has
    passed).

`computeSlaCompliance()` aggregates SLA status across a set of
tickets into compliance rates (first-response + resolution).

---

## 4. Data access guard — CRITICAL

File: `src/domain/support/data-access-guard.ts`

The guard evaluates a `DataAccessRequest` and returns a
`DataAccessDecision`. Six sensitive data types are tracked:

  | Data type         | Always sensitive? | Requires user consent? | Requires audit trail? |
  |-------------------|-------------------|------------------------|------------------------|
  | receipt_image     | yes               | yes                    | yes                    |
  | upi_id            | yes               | yes                    | yes                    |
  | payment_reference | yes               | yes                    | yes                    |
  | bank_account      | yes               | yes                    | yes                    |
  | full_backup       | yes               | yes                    | yes                    |
  | ocr_text          | no                | no                     | yes                    |

### CRITICAL rules

For the 5 `ALWAYS_SENSITIVE_TYPES`:
  - Access is **DENIED** when `userConsentGiven` is false.
  - Access is **ALLOWED** only when `userConsentGiven` is true AND
    `requiresAuditTrail` is true.

For `ocr_text`:
  - Access is **ALLOWED** without user consent (the user already
    consented to OCR processing at capture time), BUT
    `requiresAuditTrail` is true (we always log who looked).

### Denied access → no audit entry

When access is DENIED, no audit entry is created (no access happened).
The `request-sensitive-data-access.usecase.ts` only creates an audit
entry when access is ALLOWED AND `requiresAuditTrail` is true.

---

## 5. Audit trail

File: `src/domain/support/audit-trail.ts`

Every time an admin accesses a user's receipt image, UPI ID, payment
reference, bank account, or full backup, an audit entry MUST be
created. The entry captures:

  - **WHO**: the admin ID + IP address.
  - **WHAT**: the data type accessed.
  - **WHEN**: the access timestamp.
  - **WHY**: the admin's stated reason.
  - **CONSENT**: whether the user gave explicit consent, and when.
  - **DURATION**: how long the admin's session viewing the data
    lasted, in milliseconds.

Audit entries are immutable + append-only. The audit trail is the
legal record of who-saw-what-when — it MUST NOT be modified or
deleted (except by a documented data-retention policy).

### Audit entry shape

```ts
interface DataAccessAuditEntry {
  readonly id: string;
  readonly ticketId: string;
  readonly adminId: string;
  readonly dataType: SensitiveDataType;
  readonly accessedAt: string;
  readonly reason: string;
  readonly userConsentGiven: boolean;
  readonly userConsentDate: string;  // '' when consent was not required
  readonly ipAddress: string;
  readonly sessionDurationMs: number;
}
```

The audit entry does NOT contain the raw sensitive data — only
metadata about the access. The admin's reason is free text but is
expected to be PII-free.

### Query helpers

  - `getAccessHistory(entries, ticketId)` — entries for a ticket,
    most-recent-first.
  - `getAdminAccessHistory(entries, adminId)` — entries for an admin,
    most-recent-first.
  - `accessCountByDataType(entries)` — count per data type, for
    compliance dashboards.

---

## 6. Knowledge base

File: `src/domain/support/knowledge-base.ts`

FAQ articles with search + helpfulness tracking. Each article has:

  - A stable slug (URL-safe, lowercase + dashes).
  - A title (max 200 chars).
  - A body in Markdown (max 10000 chars).
  - A category (free-form, no PII).
  - Up to 10 tags (each max 50 chars).
  - A `draft` / `published` / `archived` status.
  - Helpful / unhelpful vote counts (idempotent — one vote per user).

### Article lifecycle

```
draft → published | archived
published → archived
archived → draft
```

### Search

`searchArticles()` performs a case-insensitive substring search
across title (3 points), body (2 points), and tags (1 point). Only
`published` articles are searched. Results are sorted by score
descending.

### Helpfulness ratio

`helpfulnessRatio(article)` returns
`helpful / (helpful + unhelpful)`. Returns `0.5` when there are no
votes (neutral default).

---

## 7. Status page

File: `src/domain/support/status-page.ts`

Tracks the operational status of 7 service components + the lifecycle
of incidents.

### Components (7)

  1. `mobile_app`
  2. `web_app`
  3. `api`
  4. `database`
  5. `ocr_service`
  6. `push_notifications`
  7. `email_delivery`

### Component statuses (5)

  - `operational`
  - `degraded_performance`
  - `partial_outage`
  - `major_outage`
  - `maintenance`

### Incident lifecycle

```
identified → investigating → monitoring → resolved → postmortem
```

### Overall status

`computeOverallStatus()` returns `operational`, `partial_outage`, or
`major_outage`:

  - `major_outage` — any component is in `major_outage` OR there is
    an active incident with severity 3.
  - `partial_outage` — any component is in `partial_outage` or
    `degraded_performance`, OR there is an active incident with
    severity 1 or 2.
  - `operational` — all components are operational / maintenance and
    no active incidents.

---

## 8. Support analytics

File: `src/domain/support/support-analytics.ts`

Aggregates support ticket data into metrics:

  - **SLA compliance rates** (first-response + resolution).
  - **CSAT average** + distribution (1..5).
  - **CSAT response rate** — fraction of resolved tickets with a
    CSAT score. Below 30% means we don't have enough signal.
  - **Trending categories** — most common ticket categories.
  - **Ticket volume** by status / priority / channel.

`topTrendingCategories(report, n)` returns the top N trending
categories. `isCsatResponseRateLow(report)` flags when the CSAT
response rate is below 30%.

---

## 9. Use cases

### Manage ticket

File: `src/application/support/manage-ticket.usecase.ts`

Operations:
  - `createTicket(input)` — generates a ticket number, redacts subject
    + body, persists.
  - `updateTicket(input)` — redacts new subject / body if provided,
    merges with existing ticket, persists.
  - `transitionTicket(input)` — validates the status transition,
    updates timestamps, persists.
  - `assignTicket(input)` — sets the assignee, persists.
  - `recordCsat(input)` — records a 1..5 CSAT score on a resolved
    ticket, persists.

### Request sensitive data access

File: `src/application/support/request-sensitive-data-access.usecase.ts`

CRITICAL entry point for admins to access raw receipt images, UPI
IDs, payment references, bank account numbers, or full backups.

Flow:
  1. Validate the request shape + IP address + session duration.
  2. Evaluate the access request via `evaluateDataAccess()`.
  3. If access was DENIED → return the decision, do NOT create an
     audit entry.
  4. If access was ALLOWED but `requiresAuditTrail` is false →
     return the decision, do NOT create an audit entry (defensive —
     this should not happen given the guard's current rules).
  5. If access was ALLOWED AND `requiresAuditTrail` is true →
     create the audit entry via `createAuditEntry()`, persist via
     `DataAccessAuditRepository.append()` (append-only), return the
     decision + audit entry.

The use case NEVER returns the raw sensitive data itself. The admin
then queries the data through a separate, narrow read path that ALSO
consults the audit entry (defence-in-depth).

---

## 10. Privacy guarantees

  - Ticket subject + body are PII-redacted before storage.
  - Raw receipt images, UPI IDs, payment references, bank account
    numbers, and full backups are NEVER accessible without:
      a. Explicit user consent.
      b. A complete audit trail entry.
  - Denied access requests do NOT create audit entries (no access
    happened).
  - Audit entries are immutable + append-only.
  - The data-access guard is a PURE function — no I/O, no globals.
    Tests cover every always-sensitive type to ensure consent is
    required.

---

## 11. References

  - `docs/security-model.md` — overall security architecture.
  - `docs/privacy-and-trust.md` — privacy commitments.
  - `docs/user-feedback-system.md` — feedback PII redactor (reused
    by the manage-ticket use case).
  - `src/domain/support/` — implementation.
  - `src/application/support/` — use cases + repository ports.
