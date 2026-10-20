# BillLens — Production Deployment Guide (v2.6.0)

This guide takes a fresh BillLens checkout from zero to a production
release build. Every step is externally verifiable; nothing here assumes
secrets that are not explicitly created by the deployer.

---

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 (ships with Node) | `npm --version` |
| Expo CLI | bundled (npx) | `npx expo --version` |
| EAS CLI | ≥ 10 | `npm i -g eas-cli` |
| Supabase account | — | https://supabase.com |
| Google Cloud Vision key | — | https://console.cloud.google.com (Vision API enabled) |

---

## 1. Verify the codebase (run before anything else)

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test -- --runInBand
npx expo-doctor
npm run secret-scan
npm run db:validate
```

Expected on v2.5.0: 178 suites / 4,608 tests passing, 0 type errors,
lint clean, doctor 18/18, secret scan CLEAN, SQL valid.

---

## 2. Provision the Supabase project

1. Create a project at https://supabase.com (note the region — pick the
   market closest to your users; BillLens's primary market is India).
2. Collect from *Project Settings → API*:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → keep server-side ONLY (never in the app,
     never in git).
3. **Never** commit the service-role key. `npm run secret-scan` fails
   the precommit hook if a service-role JWT pattern appears in the repo.

---

## 3. Apply the database migrations

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

The migration chain (`supabase/migrations/`) provisions, in order:

1. `202607291200_initial_schema.sql` — 25-table cloud schema.
2. `202610101500_phase6_track1_settlement_state_machine.sql` —
   settlement state machine, payment handles, sync-conflict storage.
   **v2.5.0 fixed**: referenced `group_members.user_id` correctly (the
   previous `profile_id` made a fresh `db push` FAIL).
3. `202610110900_group_members_soft_delete.sql` — **v2.6.0 CRITICAL
   FIX**: adds the `group_members.deleted_at` column the RLS policies
   reference. The v2.5.0 chain still failed a fresh `db push` at step 4
   with `column gm.deleted_at does not exist` (~45 policy references);
   this migration must sort BEFORE the RLS migration (it does, by
   filename) and also backfills `left_at` members as tombstones so the
   download feed can propagate membership revocations.
4. `202610111000_phase_cloud_rls_policies.sql` — Row Level Security for
   every table (group-membership-scoped SELECT, owner-gated mutations,
   `WITH CHECK` on inserts), profiles auto-provisioning trigger, audit
   RPC, **v2.5.0**: tightened group-members join/update policies,
   owner-gated group updates, `receipts` storage bucket + policies, and
   the `billlens_purge_expired_accounts()` purge RPC.
5. `202610111100_bidirectional_sync_server.sql` — **v2.6.0**: commit-
   ordered `updated_at` (`clock_timestamp()` BEFORE INSERT OR UPDATE
   trigger on the synced tables — the pull cursor depends on commit-
   monotonic timestamps that ignore client clock skew) + composite
   `(updated_at, id)` keyset-pagination indexes for the download feed.

### 3.0 Verify bidirectional-sync server support (v2.6.0)

```sql
-- The download cursor ordering requires commit-time updated_at.
-- This must return 'clock_timestamp' (not 'now'):
select prosrc from pg_proc where proname = 'billlens_set_updated_at';

-- Every synced table must have the BEFORE INSERT OR UPDATE trigger:
select tgrelid::regclass as tbl, tgenabled from pg_trigger
where tgname = 'set_updated_at' order by 1;

-- Keyset pagination indexes:
select indexname from pg_indexes
where indexname like '%_pull_cursor' order by 1;

-- Membership tombstones (v2.6.0): the column the RLS policies use:
select column_name from information_schema.columns
where table_name = 'group_members' and column_name = 'deleted_at';
```

### 3.1 Verify RLS landed (do not skip)

```sql
-- In the Supabase SQL editor: every row must show RLS enabled.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;

-- Every table must have at least one policy.
select tablename, count(*) from pg_policies
where schemaname = 'public' group by tablename order by tablename;

-- Storage: bucket must exist and be private.
select id, public from storage.buckets where id = 'receipts';
```

### 3.2 Enable the account-purge schedule

```sql
-- pg_cron (enable in Database → Extensions if not active):
select cron.schedule(
  'billlens-account-purge', '0 3 * * *',
  $$select public.billlens_purge_expired_accounts()$$
);
```

If pg_cron is unavailable on your plan, call the RPC daily from any
external scheduler using the service-role key.

### 3.3 Verify bidirectional sync + multi-user with TWO live accounts (v2.6.0)

These are the exact manual probes for the collaborative flows that
cannot be executed without a provisioned project. Use TWO test
identities (User A, User B) on two devices/emulators.

```text
1.  User A: sign up (email OTP) → create group "Probe".
2.  User A: Settings → group → invite → copy the invite link.
3.  User B: open the link → join. Verify B sees the group within one
    sync (the group + membership arrive via DOWNLOAD, not re-creation).
4.  User A: create expense 1000 split equally → both devices show
    A: +500 / B: −500 after sync (identical balances).
5.  User B: record a settlement 500 → A receives it after pull → both
    balances now A: 0 / B: 0.
6.  Both users see the same activity entries (expenses + settlement).
7.  CONCURRENT EDIT: both edit the SAME expense while one device is
    offline → exactly ONE "Review conflicts" card appears (Settings →
    Sync status) → choose Keep mine / Use cloud → no duplicates.
8.  OFFLINE: airplane-mode expense on B → survives app force-quit →
    uploads on reconnect → A sees it.
9.  REVOKE: A removes B → B's device stops receiving the group feed;
    B's access to the group data is denied by RLS (verify in-app).
10. NEGATIVE AUTHZ: as User B, attempt
    `GET {URL}/rest/v1/groups?id=eq.<A's-other-group-id>` with B's
    token → expect an EMPTY array (RLS), never a row.
```

If every step holds, record it in the release checklist; without a
provisioned project these remain BLOCKED (they are covered by the
automated two-device integration test with an emulated cloud in
`src/infrastructure/__tests__/bidirectional-sync-integration.test.ts`).

---

## 4. Deploy the OCR Edge Function

```bash
# Choose the provider and set its credentials:
supabase secrets set OCR_PROVIDER=google_cloud_vision
supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=<your-key>
# optional: supabase secrets set OCR_MAX_IMAGE_BYTES=10485760
# stub provider is REFUSED unless you explicitly allow it (testing only):
# supabase secrets set OCR_ALLOW_STUB=true

supabase functions deploy ocr-receipt
```

See `supabase/functions/ocr-receipt/README.md` for the full provider
evaluation and the client↔function error-code contract.

### 4.1 Verify live OCR (end-to-end, with a real receipt)

1. Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
   `.env.local` (leave `EXPO_PUBLIC_OCR_MODE` unset — auto-selects remote).
2. `npx expo start` with a dev client and scan a REAL paper receipt.
3. Confirm the draft review screen shows extracted fields with
   confidence badges and that the OCR diagnostics reason
   (`getOcrProviderReason()`) names the Edge Function host.

**Do not claim live OCR works until this check passes.**

---

## 5. Configure the app build

`.env.local` (development) — and EAS secrets for build profiles:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_APP_ENV` | `production` for store builds (REQUIRED — the app refuses to boot production builds without it) |
| `EXPO_PUBLIC_SUPABASE_URL` | from step 2 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | from step 2 |
| `EAS_PROJECT_ID` | created by `eas init` |

```bash
eas init                      # creates the project + writes the id
eas secret:push --force       # push the EXPO_PUBLIC_* values as EAS secrets
```

`eas.json` profiles:

| Profile | Purpose | Output |
|---|---|---|
| `development` | dev client on simulator | iOS simulator / APK |
| `internal` | Android internal testing | APK (internal distribution) |
| `staging` | TestFlight/Play internal track | IPA (device) / AAB |
| `production` | Store submission | AAB / IPA, autoIncrement |

---

## 6. Build for internal testing

```bash
# Android internal-testing APK:
eas build --profile internal --platform android

# iOS TestFlight-ready build (requires Apple Developer Program):
eas build --profile staging --platform ios
```

Then verify on a real device (the manual checklist is in
`e2e/README.md`; Maestro flows live in `e2e/maestro/`):

- [ ] Camera permission prompt → capture → quality review → OCR → draft review → confirm
- [ ] Gallery import → same pipeline
- [ ] Manual expense creation (all five split ways)
- [ ] Offline airplane-mode expense → reconnect → sync status screen drains queue
- [ ] Settlement record / confirm / dispute / reverse
- [ ] Balance correctness after edit + delete
- [ ] Account deletion (14-day recovery message; remote purge after window)
- [ ] Dark mode, dynamic type at largest accessible size, reduce-motion

**Do not submit to any store before the device checklist passes.**

---

## 7. Error reporting & production logging

- Production builds log via `console.warn`/`console.error` only; no
  tokens, receipt contents or amounts are logged (verified by grep +
  `npm run secret-scan`).
- Wire a crash reporter before public launch: install
  `expo-install-sentry` (or equivalent) and initialize it in
  `app/_layout.tsx`'s ErrorBoundary `onError`. This is intentionally
  left as an integration step for the account owner (requires an
  account/DSN choice).

---

## 8. Store submission (requires explicit authorization)

`docs/release/store-submission-checklist.md` is the gate. EAS submit
configuration (`eas.json → submit.production`) contains PLACEHOLDERS —
fill `appleId` / `ascAppId` / `appleTeamId` and the Play service-account
key path, then:

```bash
eas submit --platform ios --latest
eas submit --platform android --latest --track internal
```

**No build or submission may be described as done unless the command
exited successfully and the artifact is visible in the respective
console.**
