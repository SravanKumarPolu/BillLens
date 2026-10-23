> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Product requirements (PRD)

## Product vision and users
BillLens is a free-first, privacy-focused, guest-first shared-expense application. Primary users are friends, roommates, families and small travel groups, including users in India who settle with cash, UPI or bank transfer. Financial data belongs on users' phones by default; cloud identity and relay are optional future/enhanced features, not prerequisites to creating an expense.

## MVP scope and priority
**P0:** launch without sign-up; persistent SQLite groups, members, manual expenses, equal/exact/percentage/shares splits, multiple payers, deterministic balances, partial settlements, edit/void with audit, offline restart, export, explicit delete controls, accessible recovery from errors. **P1:** on-device camera/gallery OCR to *reviewable draft*, receipt storage, local reminders and backup, all verified on real devices. **P2:** automatic encrypted remote sharing, invitation/key UX, conflict resolution, cross-device recovery. **Future:** optional cloud backups, FX rates, expanded analytics, monetisation only with transparent consent.

## Functional requirements
- Financial amounts are integer minor units; no float arithmetic or invented FX rate. Per-currency balances sum to zero. A completed settlement increases payer net and decreases receiver net by its amount.
- OCR never posts a financial expense automatically; user reviews extracted fields. Payment screenshots are evidence, not confirmation that money moved.
- Guest can work fully offline; the network may enhance collaboration but cannot block SQLite boot.
- Retention currently *offers* cleanup after 365 days (configurable 6/24 months), subject to balance/sync/confirmation guards. **It does not automatically delete data after one year.** If automatic expiry is a product requirement, it remains a separately approved change with safety/backup UX.
- Local delete and group-wide delete are distinct actions; neither silently deletes peers' records.

## Nonfunctional and safety acceptance
Cold boot without network; no loss of records across restart/upgrade; idempotent retries; guarded migrations; screen reader and large-text support; no unhandled unsupported-native-module import; no secret or receipt content in logs; no unreviewed automatic data deletion. The app is not a payment processor and must not imply verified payment from UPI deep-link return.

## Competitive positioning and limitations
Differentiators: guest-first offline entry, explainable splits, optional receipt-assisted entry, local ownership and encrypted relay design. **Do not claim parity or superiority** over established products while native OCR and remote sync remain unverified/unshipped. See `FEATURE_MATRIX.md` and `REQUIREMENTS_TRACEABILITY.md` for evidence and gaps.
