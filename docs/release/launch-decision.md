# Launch Decision — BillLens v2.0.0 Release Candidate

> Phase 8, Prompt 80 requires exactly one evidence-based verdict.

## Decision

```text
NOT READY FOR RELEASE
```

## Why (evidence)

All **software gates** pass (see `production-readiness-report.md`):
0 type errors, 0 lint issues, 4,144/4,144 tests, clean secret scan,
valid migrations, successful Android export, financial invariants
green, and the Prompt 77 account-deletion launch blocker **closed**
this remediation.

However, Prompt 80 forbids `READY FOR STAGED RELEASE` while any
critical gate remains open. The following **required** gates have no
executed evidence yet and remain open:

| # | Open gate (Prompt 80 acceptance) | Blocking evidence gap |
|---|---|---|
| 1 | Android and iOS **device testing** complete | 65 Maestro flows defined, none executed on devices; camera/gallery/SecureStore/biometrics/UPI-launch are physical-device-only features |
| 2 | **RLS policies tested** (live) | Static assertions pass; multi-user execution probes on a real Supabase project pending |
| 3 | App upgrade from an earlier schema on device | Migration suites pass locally; device upgrade path not executed |
| 4 | Accessibility device tests | VoiceOver/TalkBack/large-text passes not yet executed |
| 5 | Performance measured on representative devices | Framework ready; no recorded measurements |
| 6 | Closed beta findings addressed | Beta not run (Prompt 79 stage gate) |
| 7 | Legal drafts reviewed and published | All 8 documents are DRAFTs; URLs not live |
| 8 | Signing + production builds | No EAS build executed yet (keystore/certificates to be created) |
| 9 | Screenshots captured (pinned demo dataset) | Shot list ready, capture pending |

None of these is a code defect — every one is an **execution gate**
that requires environments, devices, or external parties (legal). Per
Prompt 80's rule, the honest verdict is therefore `NOT READY FOR
RELEASE` until the table above is closed.

## Conditions to flip to `READY FOR STAGED RELEASE`

1. Device matrix executed (Prompt 73): core journeys + upgrade +
   interruption tests on Android + iOS; results recorded in
   `test-summary.md`.
2. Live RLS probes green on staging Supabase (multi-user, removed
   member, expired invite).
3. Closed beta (Prompt 79) completed with thresholds met: crash-free
   sessions, sync success, no financial-invariant failures, no
   data-loss reports.
4. Legal sign-off + publication of Privacy Policy and Terms at the
   store URLs; store disclosure forms submitted.
5. First signed staging/production builds via `eas build` succeed;
   rollback rehearsal (OTA + store halt) recorded.
6. Re-run the full gate chain (`production-readiness-report.md`
   §Commands) on the release commit — all green.

Update this file to `READY FOR STAGED RELEASE` **only** when 1–6 are
evidenced, then begin the staged rollout (Prompt 79 percentages) with
`incident-response-plan.md` and `rollback-plan.md` armed.
