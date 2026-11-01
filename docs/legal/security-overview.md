# Security Overview — BillLens

> **DRAFT** for publication review (Phase 8, Prompt 78). This is the
> honest public-facing summary. It deliberately avoids unsupported
> claims (no "bank-level security", no unverified compliance marks).

**Last updated:** [TBD]

## What we protect

Financial bookkeeping (groups, expenses, balances, settlements),
receipt images, and account identity.

## Controls in place

### On device
- **Sessions and secrets** are stored in the platform secure storage
  (iOS Keychain / Android Keystore-backed SecureStore). Refresh tokens
  are never written to the app database.
- **Local database** (SQLite) holds your data on device. The database
  is protected by the OS sandbox. We do not currently add a separate
  at-rest encryption layer on top of the OS sandbox — we say so here
  rather than implying otherwise.
- **Local-only receipts** never leave the device; a sync rule set
  (tested) blocks their upload by construction.
- Sensitive-screen privacy and app-switcher snapshot behaviour follow
  platform conventions; optional biometric app lock is on the roadmap.

### In transit
- All API traffic uses HTTPS/TLS to our cloud provider.

### In the cloud
- **Row-Level Security** on every Supabase table: each user can read
  and write only data for groups they belong to; policies are reviewed
  and tested (`src/domain/security/rls-verification.ts`).
- **Invite tokens** are stored hashed, expire server-side, and are
  immediately revoked on use-limit or revocation.
- **Files** live at non-guessable paths, are served via short-lived
  signed URLs, require group membership, and are validated for MIME
  type and size on upload.
- **Least privilege**: the mobile app uses only the public anon key
  scoped by RLS. Service-role keys never ship in the app and are
  scanned for on every commit (`npm run secret-scan`).

### Process
- Automated security gates in CI: secret scan, dependency audit,
  security test suites.
- Penetration-test framework and storage review checklists live in
  `src/domain/security/` and are executed per release candidate.
- Dependency and vulnerability review before each release.

## Known limitations (stated honestly)

1. **Local at-rest encryption**: beyond the OS sandbox, SQLite content
   is not separately encrypted today.
2. **No formal compliance certification** (SOC 2, ISO 27001) has been
   completed. We will not claim certification we don't hold.
3. **Remote OCR**, when consented, sends an image to the OCR provider
   for extraction; provider-side retention follows that provider.
4. **App-lock / screenshot-obscuring** hardening is roadmap, not
   current behaviour.
5. Physical-device security depends on the user's device (OS version,
   lock screen, jailbreak/root status are out of our control).

## Reporting a vulnerability

Email **security@billlens.app**. Please do not publicly disclose before
we respond. We commit to acknowledging reports within [SLA — legal/
ops to confirm] and will credit reporters who wish to be named once a
fix is shipped.

| Version | Date | Notes |
|---|---|---|
| 2026-10-10-draft-1 | 2026-10-10 | Initial draft for publication review |
