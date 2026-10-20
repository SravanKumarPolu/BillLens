# Store Submission Checklist — BillLens v2.0.0

> Phase 8, Prompt 77/80. Source metadata lives in `store/`.

## App identity

- [x] App name: BillLens (`store/app-store-listing.md`)
- [x] Subtitle / short description drafted
- [x] Full description drafted (positioning limits respected — no
      guaranteed OCR accuracy, no payment verification claims, no
      "bank-level security")
- [x] Keywords (≤ 100 chars)
- [x] Category: Finance
- [x] Support URL / Privacy URL / Terms URL (publish on legal sign-off)
- [x] Copyright + contact info

## Build configuration

- [x] Bundle IDs / package names per environment (`app.config.ts`:
      `com.billlens.dev|staging|app`)
- [x] Production icons present (icon 1024², adaptive-icon, splash,
      favicon — **generated during remediation; assets/ was empty**)
- [x] Deep-link scheme `billlens://` registered
- [x] Permission strings (camera, photos) user-comprehensible
- [x] EAS profiles: development / internal / preview / staging /
      production (`eas.json` — created during remediation)
- [ ] **Signing**: Android keystore + iOS certificates to be created in
      EAS at first real build (`eas build`); ownership/recovery doc
      then recorded in the release runbook
- [ ] Version code / build number final bump at submission

## CI / release gates

- [x] CI pipeline gates: install → lint → typecheck → tests →
      migration test → secret scan → dependency audit → export smoke
      (`.github/workflows/ci.yml` — created during remediation)
- [x] Release pipeline with manual production approval environment
      (`.github/workflows/release.yml`)
- [x] `npm run secret-scan` wired into precommit + CI (was missing)

## Apple requirements

- [x] App Privacy answers drafted (`store/app-store-listing.md`)
- [x] Age rating: 4+ rationale
- [x] Sign in with Apple offered (guideline 4.8)
- [x] **Account deletion in-app** — implemented this remediation
      (`/settings/delete-account`, 14-day recovery, sessions revoked)
- [x] Export compliance answers (standard encryption exemption)
- [x] Reviewer notes incl. guest mode + demo account
      (`store/reviewer-notes.md`)
- [ ] Demo account provisioned in the review staging backend

## Google Play requirements

- [x] Data Safety form answers drafted (`store/play-store-listing.md`)
- [x] Content rating rationale (IARC: Everyone)
- [x] Target API compliance noted (API 34; re-verify at submission)
- [x] App access instructions + credentials
- [x] Ads declaration: none
- [x] Financial-features declaration: none (UPI deep link only)
- [x] Account deletion: in-app + URL fallback
- [ ] Closed-testing track configured (internal → closed → production)

## Screenshots & media

- [x] Shot list + rules (`store/screenshots-plan.md`)
- [ ] **Capture on device with pinned demo dataset** (both themes,
      both platforms, all required sizes)

## Final gates before pressing Submit

- [ ] `docs/release/launch-decision.md` verdict upgraded to
      `READY FOR STAGED RELEASE` (requires the device/beta gates in
      `known-limitations.md` to close)
- [ ] Privacy Policy + Terms published at the URLs above (legal
      sign-off)
- [ ] `store/privacy-disclosures.md` re-verified against the release
      build behaviour
