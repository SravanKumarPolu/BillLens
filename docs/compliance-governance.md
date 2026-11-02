# Compliance and Governance

Phase 10 Prompt 97 — Preparing BillLens for larger customers.

> **Status as of Phase 10:** BillLens is **NOT** SOC 2 / ISO 27001 certified.
> SOC 2 Type II observation period is **in progress**; ISO 27001 has
> **not yet started**. No certification is claimed anywhere in the
> product UI, marketing site, or sales decks. The function
> `isComplianceClaimed()` is the single source of truth and returns
> `false` for every standard in Phase 10.

## 1. Why this document exists

Larger customers (enterprise procurement, regulated industries, EU
public sector) require evidence that BillLens operates with the same
governance rigour they apply internally. This document covers:

1. Compliance frameworks we are pursuing (SOC 2, ISO 27001, GDPR, etc.).
2. Access recertification (quarterly reviews of who has access to what).
3. Vendor risk management (DPIAs for every high-risk vendor).
4. Backup validation (a backup is worthless until restored-and-verified).
5. Policy management (versioned, dated, owner-approved policies).
6. Audit trail (append-only event log with retention policy).

Each section links to the corresponding domain module under
`src/domain/compliance/`.

## 2. Compliance frameworks

### 2.1 Standards tracked

| Standard | Type | Status (Phase 10) |
| --- | --- | --- |
| SOC 2 Type I | Audit report | `audit_ready` |
| SOC 2 Type II | Audit report | `in_progress` (observation window) |
| ISO 27001 | Certifiable ISMS | `not_started` |
| ISO 27017 | Cloud provider controls | `not_applicable` (inherited from Supabase) |
| ISO 27018 | PII in public clouds | `not_applicable` (inherited from Supabase) |
| GDPR | Regulatory | `in_progress` |
| CCPA | Regulatory | `in_progress` |
| LGPD | Regulatory | `in_progress` |
| HIPAA | Regulatory | `not_applicable` (no PHI processed) |
| PCI-DSS | Regulatory | `not_applicable` (no cardholder data; payments via PCI-DSS Level 1 providers) |

### 2.2 The "never claim prematurely" rule

The function `isComplianceClaimed(program)` returns `true` ONLY when
ALL of the following are true:

1. `status === 'certified'`
2. `certifiedDate` is a non-empty, parseable ISO date string
3. `expiryDate` is either unset OR in the future

This is enforced by tests in
`src/domain/compliance/__tests__/compliance-framework.test.ts` which
fail loudly if a future contributor accidentally flips a status to
`'certified'` without an accompanying `certifiedDate`.

### 2.3 SOC 2 Type II roadmap

- **2026-01-15** — Readiness assessment begins (Prescient Assurance).
- **2026-06-01** — Observation window opens.
- **2026-12-01** — Type I report issued (controls exist at a point in time).
- **2027-12-01** — Type II report issued (controls operated effectively over 12 months).

Until the Type II report is issued, BillLens is **NOT** SOC 2 certified.
Customer-facing materials use the phrase "SOC 2 Type II in progress"
and link to this document.

### 2.4 ISO 27001 roadmap

Gap analysis begins after SOC 2 Type II issuance. ISO 27001 certification
target: 2028-06-01. Until then, BillLens does NOT mention ISO 27001 in
customer-facing materials.

### 2.5 GDPR / CCPA / LGPD

These are regulatory obligations, not certifiable frameworks. BillLens
complies by:

- Appointing a Data Protection Officer (DPO).
- Maintaining a Record of Processing Activities (RoPA).
- Honouring Data Subject Access Requests (DSARs) within 30 days.
- Providing a "Do Not Sell My Personal Information" link (CCPA).
- Honouring deletion requests within 45 days.
- Anonymising analytics events (see `src/domain/analytics/analytics-redactor.ts`).

## 3. Access recertification

Module: `src/domain/compliance/access-review.ts`

### 3.1 Cadence

- **Org admins** — reviewed quarterly.
- **Group admins** — reviewed quarterly.
- **API keys** — reviewed monthly (rotation policy enforced).
- **Admin panel access** — reviewed quarterly.
- **Database access** — reviewed monthly (production DB access is the
  highest-risk access type).

### 3.2 Process

1. The system generates an `AccessReview` task for every (reviewer,
   reviewee, resource) tuple due for review.
2. The reviewer opens the task, sees the reviewee's current access
   level and recent activity, and chooses `retain`, `revoke`, or
   `modify`.
3. Completed reviews are timestamped and the next review date is set
   (typically +90 days).
4. Pending reviews past their `nextReviewDue` date are flagged as
   `overdue` by a background job (which calls `isReviewOverdue()` to
   avoid re-flagging already-flagged reviews).
5. The completion rate (`computeReviewCompletionRate()`) is reported
   on the compliance dashboard.

### 3.3 SLA

Reviews must be completed within 14 days of the due date. Overdue
reviews escalate to the reviewer's manager and the DPO.

## 4. Vendor risk management

Module: `src/domain/compliance/vendor-management.ts`

### 4.1 Vendor inventory

Every vendor that touches BillLens data is registered with:

- Risk level (`low` / `medium` / `high` / `critical`).
- Data access level (`none` / `limited` / `extensive` / `full`).
- DPIA status (completed + date, or pending).
- Contract expiry date.
- Vendor's own SOC 2 report link (if available).
- Vendor's ISO 27001 certification status.

### 4.2 Risk assessment

`assessVendorRisk()` computes risk from `dataAccess`:

- `none` → low
- `limited` → medium
- `extensive` → high
- `full` → critical

The declared `riskLevel` can only INCREASE the computed risk (we never
silently downgrade — auditors must explicitly accept lower risk via a
formal risk acceptance).

### 4.3 DPIA requirement

A DPIA is **required** for any vendor with `extensive` or `full` data
access. `getDpiaGaps()` returns the list of vendors where a DPIA is
required but not yet completed — these vendors are BLOCKED from new
customer onboarding until the DPIA is finished.

### 4.4 BillLens vendor inventory (Phase 10)

| Vendor | Service | Risk | DPIA |
| --- | --- | --- | --- |
| Supabase | Database / Auth / Storage | critical | completed 2026-03-01 |
| Google Vision | OCR Provider | high | completed 2026-04-01 |
| Expo Notifications | Push Notifications | medium | not required |
| Sentry | Error Monitoring | medium | completed 2026-05-01 |
| Stripe | Payments | low | not required (no cardholder data touches BillLens) |
| Razorpay | Payments (India) | low | not required |

## 5. Backup validation

Module: `src/domain/compliance/backup-validation.ts`

### 5.1 The "validated" requirement

A backup is only useful if it has been:

1. **Encrypted** at rest (KMS-managed key, not a hardcoded password).
2. **Checksummed** (SHA-256 stored alongside the backup).
3. **Validated** by restoring to a staging environment and running
   integrity checks.

`isBackupValid()` returns `true` only when all three are satisfied.

### 5.2 Backup schedule

- **Database**: full backup daily + WAL archiving every 5 minutes (RPO ≤ 5 min).
- **Attachment storage**: incremental backup every 6 hours.
- **Configuration**: snapshot on every change (immutable history).

### 5.3 Validation cadence

- Daily automated restore test (staging environment).
- Weekly manual restore drill (engineer picks a random backup, restores
  it, verifies a sample of expenses/balances).
- Quarterly DR exercise (full region failover — see
  `src/domain/scalability/disaster-recovery.ts`).

### 5.4 Retention

- Daily backups retained for 35 days.
- Weekly backups retained for 12 months.
- Monthly backups retained for 7 years (for tax audit purposes).
- `getStaleBackups()` identifies backups older than the retention
  window for purge.

## 6. Policy management

Module: `src/domain/compliance/policy-document.ts`

### 6.1 Policy types

| Type | Cadence | Owner |
| --- | --- | --- |
| Security | Annual | CTO |
| Data retention | Annual | DPO |
| Incident response | Annual + after every incident | CTO + DPO |
| Access control | Annual | CTO |
| Password | Annual | CTO |
| Encryption | Annual | CTO |
| Backup | Annual | CTO |
| Vendor management | Annual | DPO |
| Acceptable use | Annual | HR + Legal |
| Privacy | Annual + after every regulatory change | DPO |

### 6.2 Versioning

Every policy has:

- A semantic version (e.g. `1.2.0`).
- An `effectiveDate` (when this version became active).
- A `reviewDate` (when the next review is due).
- An `approvedBy` (user ID of the approver).

`isPolicyDueForReview()` returns `true` when a policy is within 30
days of its review date (early-warning window) or already past it.

### 6.3 Approval workflow

1. Author drafts the policy (`status: 'draft'`).
2. Legal reviews → `status: 'under_review'`.
3. CTO/DPO approves → `status: 'active'`, `effectiveDate` set.
4. Superseded versions → `status: 'retired'` (kept for audit trail).

`getLatestPolicyOfType()` returns the active policy of a given type,
preferring `active` > `under_review` > `draft` > `retired`.

## 7. Audit trail

Module: `src/domain/compliance/audit-trail-management.ts`

### 7.1 Event types

| Type | Example |
| --- | --- |
| `data_access` | User viewed another user's expenses. |
| `config_change` | Admin changed org-level settings. |
| `permission_grant` | Admin promoted a member to admin. |
| `permission_revoke` | Admin removed a member's admin role. |
| `policy_update` | DPO published a new version of the security policy. |
| `backup_validation` | Engineer marked a backup as validated. |
| `incident_response` | On-call engineer acknowledged a P1 incident. |
| `vendor_review` | Procurement reviewed a vendor's DPIA. |

### 7.2 Storage

Audit events are stored in a separate Postgres schema (`audit.*`)
with INSERT-only permissions (no UPDATE, no DELETE). The schema is
additionally shipped to a separate log stream for SIEM ingestion.

### 7.3 Retention

- **Default**: 7 years (matches the longest statute of limitations
  across our supported regions).
- `computeAuditRetention()` partitions events into `retain` and
  `purge` based on the retention window.
- **Before purge**: events are exported to cold storage (S3 Glacier)
  in JSONL format. The export is checksummed and the checksum is
  recorded in the audit trail itself (a "we purged these events"
  audit event).
- **Legal hold**: if a litigation hold is in place, the purge job
  skips events matching the hold criteria.

### 7.4 Filtering

`filterAuditEvents()` supports filtering by:

- `type` (event type)
- `actorId` (who did it)
- `resourceType` (what kind of resource)
- `result` (success / failure / denied)
- `from` / `to` (timestamp range, inclusive)

All filters are AND-combined. The returned list preserves the
original order — the caller is responsible for sorting.

## 8. Incident response

> Detailed in `docs/security-maintenance.md`. This section summarises
> the compliance-relevant aspects.

### 8.1 Severity classification

| Severity | Examples | Response SLA |
| --- | --- | --- |
| P1 (critical) | Data breach, RCE, auth bypass | 15 min ack, 4 hr mitigation |
| P2 (high) | Privilege escalation, data leak (limited) | 1 hr ack, 24 hr mitigation |
| P3 (medium) | Vulnerability with limited exploitability | 1 business day ack, 7 day mitigation |
| P4 (low) | Hardening, defence-in-depth improvements | 1 week ack, 30 day mitigation |

### 8.2 Customer notification

- P1 incidents with confirmed customer data impact: notify affected
  customers within 72 hours of confirmation (GDPR Article 33).
- P2 incidents: notify affected customers within 7 days.
- P3/P4: included in the monthly security newsletter.

### 8.3 Post-incident review

Every P1/P2 incident requires a blameless post-incident review within
7 days, including:

- Timeline of events.
- Root cause analysis.
- Action items with owners and due dates.
- Update to the relevant policy (`incident_response` or other).

## 9. Customer-facing compliance artifacts

Larger customers can request (via their account manager):

- SOC 2 Type II report (once issued — Phase 10: not yet available).
- DPIA summaries for high-risk vendors.
- Data Processing Agreement (DPA) — standard template available.
- Sub-processor list — published at `https://billlens.app/sub-processors`.
- Audit trail export (their org's events only — see
  `src/domain/api-platform/api-model.ts` for the
  `audit:read` scope).

## 10. References

- `src/domain/compliance/compliance-framework.ts` — framework registry.
- `src/domain/compliance/access-review.ts` — access reviews.
- `src/domain/compliance/vendor-management.ts` — vendor risk + DPIA.
- `src/domain/compliance/backup-validation.ts` — backup records.
- `src/domain/compliance/policy-document.ts` — policy metadata.
- `src/domain/compliance/audit-trail-management.ts` — audit events.
- `src/domain/security/` — security review framework.
- `src/domain/scalability/disaster-recovery.ts` — DR scenarios.
- `docs/security-model.md` — security architecture.
- `docs/security-maintenance.md` — security operations.
- `docs/privacy-and-trust.md` — privacy commitments.
