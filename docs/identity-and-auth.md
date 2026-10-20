# BillLens — Identity & Authentication

> Status: **Phase 1 · Prompt 9 complete.**

This document explains BillLens's guest-first identity model, the
upgrade flow from guest to cloud account, and the security boundaries
that protect user data.

## 1. Two identity modes

BillLens supports two identity modes:

| Mode | Description | Data location | Multi-device |
|------|-------------|---------------|--------------|
| **Guest** | No registration required. User picks a display name and starts using the app. | Local-only (SQLite + SecureStore on device) | No |
| **Cloud** | Registered account via Email OTP, Google, or Apple sign-in. | Local + Supabase cloud | Yes |

A user can start as a guest and upgrade to a cloud account later
WITHOUT losing their local data (groups, expenses, settlements,
receipts).

## 2. Identity separation

BillLens distinguishes five identity-related concepts:

| Concept | Description |
|---------|-------------|
| **Authenticated user profile** | A `profiles` row representing a cloud-account user (email, display name, avatar). Created on first cloud sign-in. |
| **Group member record** | A `group_members` row representing a participant in a specific group. Has a `display_name` and optional `user_id` (links to a profile). |
| **Guest identity** | A `guest_identity_links` row representing a local-only identity. Has a `device_secret_hash` and an `upgrade_status`. |
| **Invite participant** | A `group_invites` row representing an outstanding invite. Has a `token` and `invitee_email`. |
| **Device installation** | A `device_installations` row representing a single device that has signed in. Used for push notifications. |

A group member does NOT permanently depend on an email address. A
member can exist with `user_id = null` (invitee who hasn't accepted
yet, or a guest-only member). When a guest upgrades, their member
records are reconciled with their cloud profile.

## 3. Guest identity

A guest identity consists of:

| Field | Storage | Purpose |
|-------|---------|---------|
| `id` (UUID) | SQLite + SecureStore | Identifies the guest across app launches |
| `display_name` | SQLite | Shown in UI |
| `device_secret` (32 random hex chars) | SecureStore only | Proves ownership during upgrade |
| `device_secret_hash` | SQLite only | Verifies the secret without storing it |
| `upgrade_status` | SQLite | `local_only` → `upgrade_pending` → `upgraded` |
| `linked_user_id` | SQLite | Set when upgrade completes |

The `device_secret` is NEVER stored in plain text in SQLite — only
its hash is. The plain secret lives in the device's SecureStore
(Keychain on iOS, Keystore on Android), which is encrypted at rest
and accessible only to the BillLens app.

## 4. Upgrade flow

```
Guest user
    ↓
1. User chooses "Upgrade to cloud account"
    ↓
2. startUpgrade(): guest_identity → upgrade_pending
    ↓
3. User signs in via AuthProvider (email OTP / Google / Apple)
    ↓
4. completeUpgrade():
   - Verify device secret from SecureStore matches stored hash
   - Transition guest_identity → upgraded
   - Set linked_user_id = cloud user ID
   - Store cloud user ID in SecureStore
    ↓
5. GuestUpgradeExecutor (Phase 2):
   - Upload local groups to cloud
   - Upload local expenses (with payers/splits)
   - Upload local settlements
   - Reconcile memberships (set user_id on member records)
   - Resolve duplicate memberships (if any)
    ↓
6. User continues with same groups and history
```

### Why the device secret?

The device secret proves that the device performing the upgrade is the
same device that created the guest identity. Without this check, an
attacker who gains access to the cloud account could link an arbitrary
guest identity to their account, importing expenses they didn't create.

The secret is presented to the cloud during step 5; the cloud verifies
the hash matches the `guest_identity_links.device_secret_hash` stored
when the guest identity was first created.

### Resumable upgrade

The upgrade is resumable — if interrupted (e.g. network failure during
data upload), the user can retry without losing progress:

- `planGuestUpgrade()` produces an idempotent plan based on the current
  local state.
- The upgrade executor processes the plan one step at a time,
  recording progress.
- If the executor is interrupted, calling `planGuestUpgrade()` again
  produces the same plan (minus already-uploaded entities).
- `validatePlanStillValid()` detects if the local state has changed
  since the plan was produced (e.g. user added a new expense during
  the upgrade) and aborts with `VersionConflictError`.

## 5. Authentication providers

| Provider | Method | Notes |
|----------|--------|-------|
| Email OTP | Supabase Auth magic-link / OTP | User enters email → receives code → enters code → signed in |
| Google | Supabase Auth OAuth | One-tap sign-in on Android, Sign in with Google on iOS |
| Apple | Supabase Auth OAuth | Required for App Store compliance if other OAuth providers are offered |

The `AuthProvider` interface (in `src/application/identity/identity-service.ts`)
abstracts these. The production implementation wraps Supabase Auth;
tests use a mock.

## 6. Security boundaries

### 6.1 SecureStore usage

| Key | Purpose | Lifecycle |
|-----|---------|-----------|
| `billlens.guest.device_secret` | Plain-text device secret for guest identity | Created on first launch; deleted on upgrade completion (no longer needed) |
| `billlens.guest.identity_id` | Current guest identity ID | Created on first launch; deleted on upgrade completion |
| `billlens.user.id` | Current cloud user ID | Created on upgrade completion or direct sign-in; deleted on sign-out |
| `billlens.supabase.access_token` | Supabase JWT access token | Refreshed automatically by Supabase SDK; deleted on sign-out |
| `billlens.supabase.refresh_token` | Supabase refresh token | Same as above |

### 6.2 Forbidden in the mobile app

The following must NEVER be stored in the mobile app (neither in
SQLite nor in SecureStore):

- Supabase service-role keys
- Private OCR credentials
- Database admin credentials
- JWT signing secrets
- Any key with "secret", "service", "admin", or "private" in the name

These belong only in Supabase Edge Functions and other server-side
environments.

### 6.3 Token handling

- Access tokens are short-lived (1 hour default).
- Refresh tokens are long-lived but rotatable (Supabase rotates on
  each use; reuse interval is 10 seconds).
- Tokens are NEVER logged.
- Tokens are NEVER sent to third-party services.
- Tokens are stored ONLY in SecureStore (encrypted at rest).

## 7. Row Level Security (RLS)

All 14 tables have RLS enabled (see
`supabase/migrations/202607291200_initial_schema.sql`). Phase 1
Prompt 9 enables RLS with a deny-by-default policy. Production RLS
policies (added in a later migration) enforce:

| Rule | Policy |
|------|--------|
| Users can read only groups they belong to | `select on groups where exists (select 1 from group_members where group_members.group_id = groups.id and group_members.user_id = auth.uid() and group_members.left_at is null)` |
| Only authorised members can add expenses | `insert on expenses with check (exists (select 1 from group_members where group_members.group_id = expenses.group_id and group_members.user_id = auth.uid() and group_members.left_at is null))` |
| Only owners or admins can remove members | `delete on group_members where exists (select 1 from group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role in ('owner', 'admin'))` |
| Users cannot modify another member's identity | `update on profiles where id = auth.uid()` |
| Receipt files require signed URLs | Storage bucket is private; URLs are signed and expire after 1 hour |
| Every backend mutation must validate group membership | Edge Functions re-check membership before writing |

## 8. Security risks and mitigations

| Risk | Mitigation |
|------|-----------|
| **Invite token guessing** | Tokens are 32 random hex chars (128 bits of entropy). Brute-force is infeasible. |
| **Account takeover** | Email OTP / OAuth providers handle authentication. BillLens never sees passwords. |
| **Guest identity theft** | Device secret is encrypted in SecureStore. Attacker who steals the SQLite DB cannot upgrade without the secret. |
| **Duplicate linking** | `guest_identity_links.guest_identity_id` has a UNIQUE constraint — one cloud link per guest identity. |
| **Reusing expired invites** | `group_invites.expires_at` is checked on accept. Expired invites cannot be accepted. |
| **Unauthorised group access** | RLS policies enforce membership check on every read/write. |
| **Linking one guest identity to multiple unrelated accounts** | UNIQUE constraint on `guest_identity_id` prevents this. Once linked, a guest identity cannot be re-linked. |
| **Stale tokens** | Access tokens expire after 1 hour; refresh tokens are rotated on each use. |
| **Token leakage via logs** | Logging libraries are configured to redact `Authorization` headers and `*_token` fields. |

## 9. Audit trail

Every identity-related mutation is recorded in `audit_logs`:

| Action | Audited fields |
|--------|---------------|
| `guest_identity.create` | `guest_identity_id`, `display_name` |
| `guest_identity.start_upgrade` | `guest_identity_id`, `target_user_id` |
| `guest_identity.complete_upgrade` | `guest_identity_id`, `linked_user_id` |
| `guest_identity.mark_failed` | `guest_identity_id`, `reason` |
| `profile.create` | `profile_id`, `email` |
| `profile.sign_in` | `profile_id`, `provider` (email/google/apple) |
| `profile.sign_out` | `profile_id` |

The audit log NEVER stores:

- The plain-text device secret
- Access or refresh tokens
- OAuth provider tokens
- Passwords (BillLens doesn't handle passwords)

## 10. What's implemented in Phase 1

- ✅ `GuestIdentity` domain entity with upgrade status lifecycle.
- ✅ `IdentityService` application service: `createGuestIdentity`,
  `loadCurrentIdentity`, `startUpgrade`, `completeUpgrade`,
  `markUpgradeFailed`, `signOutCloud`.
- ✅ `planGuestUpgrade` pure domain service: produces idempotent
  upgrade plan, detects duplicate memberships, validates plan is still
  valid before each step.
- ✅ `SecureStorage` interface + `InMemorySecureStorage` test double.
- ✅ `AuthProvider` interface (Supabase implementation deferred to
  Phase 2).
- ✅ 23 tests covering guest creation, identity loading, upgrade flow
  (start, complete, fail, retry), SecureStore interactions, version
  conflict detection, duplicate membership detection.

## 11. What's deferred to Phase 2

- ❌ Supabase Auth integration (email OTP, Google, Apple).
- ❌ `GuestUpgradeExecutor` — the actual data upload (groups, expenses,
  settlements) to the cloud.
- ❌ Duplicate membership resolution UI.
- ❌ Real RLS policies (Phase 1 has deny-by-default only).
- ❌ Edge Function for server-side guest identity verification.
- ❌ Sign-in UI screens.

## 12. Local-only data residency

Guest data is local-only by default. Even after upgrade, certain
fields stay local-only if the user's privacy preferences require it
(see Section 13).

| Data | Guest mode | Cloud mode |
|------|------------|------------|
| `guest_identity_links` row | Local SQLite | Local SQLite (status = `upgraded`) + cloud `profiles` row |
| `device_secret` | SecureStore only | Deleted on upgrade completion |
| Receipts (image bytes) | Local file system | Per-receipt `storageMode` (see Section 13) |
| Receipts (structured fields) | Local SQLite | Local SQLite + cloud `receipts` table |
| Audit logs | Local SQLite | Local SQLite + cloud `audit_logs` table |

## 13. Document ownership and migration

### 13.1 Default ownership

Captured documents — receipts, payment screenshots, and their
associated extraction results — belong to the **device** that captured
them while the user is in guest mode. The `uploaded_by` field on
`receipts` references the guest identity's stable ID, and the
`captured_by` field on `capture_sources` references the same. No cloud
account is involved.

While in guest mode:

- All receipt images live in the device's file system under the app's
  sandboxed storage.
- All `extraction_results.raw_text` lives in local SQLite.
- All `expense_drafts` live in local SQLite.
- No bytes leave the device until the user explicitly upgrades to a
  cloud account.

### 13.2 Ownership transfer on upgrade

During guest-to-cloud upgrade, the `GuestUpgradeExecutor` (Phase 2)
walks the `GuestUpgradePlan.receiptMigrationPlan` and uploads each
receipt according to its `ReceiptMigrationEntry`:

| `storageMode` | `shouldUploadImage` | `shouldUploadStructuredData` | Outcome |
|---------------|---------------------|------------------------------|---------|
| `local_only` | `false` | `true` | Structured row syncs; image stays on the originating device. Other devices see the merchant/totals but cannot fetch the image. |
| `cloud_private` | `true` | `true` | Image uploads to a private bucket only the owner can read; structured row syncs. |
| `shared_with_group` | `true` | `true` | Image uploads to a group-visible bucket; structured row syncs. |
| `delete_after_extraction` | `false` | `true` | Image is deleted locally after extraction; only the structured row syncs. The cloud never sees the image. |

After upload completes, ownership of the structured row transfers to
the cloud account: `receipts.uploaded_by` is rewritten from the guest
identity ID to the new cloud `profiles.id`, and RLS policies enforce
that only the new owner (and group members, for `shared_with_group`)
can read the row.

### 13.3 Privacy preferences are preserved

The `ReceiptPrivacyPreference` (storageMode, retainRawText,
retainSourceImage, retentionDays) is stored on each receipt row and
migrates verbatim — the cloud `receipts` table has the same JSONB
column. This guarantees:

- A receipt marked `local_only` by the guest STAYS `local_only` after
  upgrade — the sync engine will never upload its image, even on a
  future re-sync.
- A receipt marked `delete_after_extraction` will have its image purged
  from cloud storage if it ever slipped up there (defensive cleanup
  during upgrade).
- The user can change a receipt's `storageMode` after upgrade — the
  new value applies to all future sync operations for that receipt.

### 13.4 Delete-after-extraction receipts

For receipts with `storageMode = 'delete_after_extraction'`:

1. The capture pipeline stores the image locally, computes
   `image_hash`, and enqueues OCR.
2. OCR runs (locally or via Edge Function). The structured
   `extraction_results` row is persisted.
3. The local file system deletes the source image bytes.
4. The `receipts.image_uri` field is set to `null` (or kept as a
   placeholder for audit purposes).
5. During upgrade, only the structured `receipts` row + its
   `extraction_results` row are uploaded. The cloud never receives
   the image.

This mode is the default for users who want OCR convenience (extract
totals, merchant, line items) without retaining the receipt image.
