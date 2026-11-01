# Legal & Compliance Documents — BillLens

> **All documents in this directory are DRAFTS prepared by the
> engineering team for review by a qualified legal professional.**
> They are not legal advice and must not be published or relied upon
> until legal review is complete. (Phase 8, Prompt 78.)

## Contents

| File | Status | Purpose |
|---|---|---|
| `privacy-policy.md` | Draft — needs legal review | How data is handled; matches store disclosures |
| `terms-of-service.md` | Draft — needs legal review | Contract terms incl. "not a bank" disclaimers |
| `acceptable-use-policy.md` | Draft — needs legal review | Content and behaviour rules |
| `data-retention-policy.md` | Draft — needs legal review | Retention periods per data class |
| `account-deletion-policy.md` | Draft — needs legal review | Deletion flow, recovery window, group-history handling |
| `security-overview.md` | Draft — honest public summary | Controls + known limitations |
| `open-source-licenses.md` | Maintained | Third-party licence notices |

## Pre-launch gate (Prompt 78 completion criteria)

Before public launch, each document must be:

1. **Reviewed and signed off** by a qualified legal professional for
   every launch jurisdiction.
2. **Cross-checked against actual behaviour** — the engineering owner
   re-verifies the behaviour claims (OCR limits, UPI limits, retention
   numbers, deletion windows) at release-candidate time.
3. **Versioned and dated** on sign-off; the published URLs
   (`/privacy`, `/terms`, `/acceptable-use`, `/data-retention`,
   `/security`, `/account-deletion`) must resolve to the signed-off
   versions.

Consent handling follows the versioned-consent requirements in
`privacy-policy.md` §5 (policy version recorded with each consent
event; separate consents never bundled).
