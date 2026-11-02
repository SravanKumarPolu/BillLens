# BillLens — Security Model

> Status: **Phase 1 · Prompt 10 complete.**

This document describes BillLens's security architecture: how user
data is protected at rest, in transit, and at the database layer.

## 1. Threat model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Attacker reads another user's expenses | Medium | High | RLS policies on every table |
| Attacker modifies another user's expense | Medium | High | RLS policies + Edge Function validation |
| Attacker guesses invite token | Low | Medium | 128-bit entropy tokens |
| Attacker steals device, reads local DB | Medium | High | SQLite is app-private; device encryption (iOS Data Protection, Android File-Based Encryption) |
| Attacker steals device, extracts tokens | Medium | High | Tokens in SecureStore (Keychain/Keystore), encrypted at rest |
| Attacker compromises Supabase service-role key | Low | Critical | Service-role key NEVER in mobile app; only in Edge Functions |
| Attacker uploads malformed expense via direct API call | Medium | High | Edge Function validates payload + group membership before insert |
| Attacker links victim's guest identity to own account | Low | High | Device secret must match hash; secret lives only in victim's SecureStore |
| Attacker reuses expired invite | Low | Low | `expires_at` checked on accept |
| Attacker brute-forces email OTP | Medium | Medium | Supabase rate-limits OTP attempts |

## 2. Layered defense

BillLens uses defense in depth — multiple independent layers must be
breached for an attack to succeed:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Supabase Auth (JWT verification)                  │
│  Every API call requires a valid JWT. Forged tokens are     │
│  rejected by Supabase's PostgREST gateway.                  │
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Row Level Security (PostgreSQL RLS)                │
│  Even with a valid JWT, users can only read/write rows they │
│  own (groups they belong to, expenses in those groups, etc.)│
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Edge Function validation                          │
│  Financial mutations are re-validated server-side: payload  │
│  shape, group membership, split total = expense total, etc. │
│  A malicious client cannot bypass these checks.             │
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Domain invariants (client-side)                   │
│  The mobile app's domain layer enforces the same invariants │
│  BEFORE sending data to the cloud. Catches bugs early;      │
│  provides better UX (immediate feedback).                  │
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Database constraints (CHECK, UNIQUE, FK)          │
│  Last line of defense — rejects any malformed data that     │
│  somehow passed all other layers.                           │
└─────────────────────────────────────────────────────────────┘
```

## 3. Authentication

### 3.1 Guest mode (no authentication)

- User picks a display name on first launch.
- A `guest_identity_links` row is created locally.
- A device-scoped secret (32 random hex chars) is generated.
- The secret is stored in `SecureStore` (encrypted at rest).
- The secret's SHA-256 hash is stored in SQLite (for verification).
- All data is local-only — no cloud sync.

### 3.2 Cloud mode (Email OTP / Google / Apple)

- User signs in via Supabase Auth.
- Supabase issues a JWT access token (1-hour expiry) + refresh token.
- Tokens are stored in `SecureStore`.
- All API calls include the JWT in the `Authorization` header.
- Supabase's PostgREST gateway verifies the JWT before any query.

### 3.3 Token lifecycle

```
sign-in → access_token (1h) + refresh_token (long-lived)
                ↓
        API call (Authorization: Bearer <access_token>)
                ↓
        token expires → Supabase SDK auto-refreshes using refresh_token
                ↓
        new access_token (rotated refresh_token)
                ↓
        sign-out → both tokens deleted from SecureStore
```

Tokens are NEVER:
- Logged
- Sent to third-party services
- Stored in SQLite (only in SecureStore)
- Stored in plain text (SecureStore encrypts at rest)

## 4. Authorization (RLS)

All 14 tables have RLS enabled. Phase 1 enables RLS with deny-by-default;
Phase 2 will add the actual policies:

```sql
-- Example policy (Phase 2): users can read only groups they belong to
create policy "groups_read" on groups
  for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id = auth.uid()
        and group_members.left_at is null
    )
  );

-- Example policy: only active members can create expenses
create policy "expenses_insert" on expenses
  for insert
  with check (
    exists (
      select 1 from group_members
      where group_members.group_id = expenses.group_id
        and group_members.user_id = auth.uid()
        and group_members.left_at is null
    )
  );

-- Example policy: only owners/admins can delete members
create policy "members_delete" on group_members
  for delete
  using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );
```

## 5. Data protection at rest

### 5.1 Local (SQLite)

- SQLite database is stored in the app's private storage (`FileSystem.documentDirectory`).
- On iOS: protected by Data Protection (NSFileProtectionCompleteUntilFirstUserAuthentication).
- On Android: protected by file-based encryption (FBE) on Android 10+.
- Database content is NOT separately encrypted in Phase 1. Phase 2 may add SQLCipher.

### 5.2 Local (SecureStore)

- Tokens and device secret are stored in `expo-secure-store`.
- iOS: Keychain (encrypted with the device passcode via Secure Enclave on supported devices).
- Android: Keystore (encrypted with hardware-backed keys on supported devices).
- `expo-secure-store` requires device authentication (face/fingerprint/passcode) on each access when `requireAuthentication` is set.

### 5.3 Cloud (Supabase Storage)

- Receipt images are stored in Supabase Storage buckets.
- Buckets are PRIVATE — not publicly readable.
- Access requires a signed URL (1-hour expiry) generated by an Edge Function.
- The Edge Function verifies the requesting user is a member of the group that owns the receipt.

### 5.4 Cloud (PostgreSQL)

- Database is encrypted at rest (Supabase default for paid tiers).
- Backups are encrypted.
- Database admin credentials are NEVER in the mobile app.

## 6. Network security

- All API calls use HTTPS (Supabase enforces this).
- Certificate pinning is NOT enabled in Phase 1 (Phase 2 may add it).
- JWT in `Authorization` header on every request.
- No sensitive data in URL query parameters.

## 7. Audit trail

Every financial mutation is recorded in `audit_logs` (see `docs/database-schema.md` § 6).

Audit logs are:
- Append-only (no UPDATE or DELETE grants for the application role).
- Stored for at least 7 years (financial audit requirement).
- Never contain: full receipt text, card numbers, UPI IDs, transaction references.

## 8. Secrets management

| Secret | Storage | Lifecycle |
|--------|---------|-----------|
| Supabase service-role key | Supabase Edge Function env vars only | NEVER in mobile app |
| Supabase anon key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` env var | Safe to embed in mobile bundle (RLS-enforced) |
| JWT signing secret | Supabase-managed | Never accessible to BillLens developers |
| User JWT access token | SecureStore | 1-hour expiry; rotated on refresh |
| User JWT refresh token | SecureStore | Long-lived; rotated on each use |
| Guest device secret | SecureStore | Created on first launch; deleted after upgrade |
| Guest device secret hash | SQLite | Created on first launch; retained for verification |

## 9. Forbidden patterns

The following patterns are FORBIDDEN in BillLens code:

```ts
// ❌ FORBIDDEN: Storing service-role key in the app
const supabase = createClient(url, SERVICE_ROLE_KEY);

// ❌ FORBIDDEN: Logging tokens
console.log('access token:', accessToken);

// ❌ FORBIDDEN: Storing tokens in SQLite
await db.run('insert into tokens (access) values (?)', [accessToken]);

// ❌ FORBIDDEN: Disabling RLS
alter table groups disable row level security;

// ❌ FORBIDDEN: Using `auth.api` (admin) endpoints from the app
await supabase.auth.admin.deleteUser(userId);

// ❌ FORBIDDEN: Bypassing Edge Functions for financial mutations
await supabase.from('expenses').insert(expense);  // missing validation

// ✅ CORRECT: Use Edge Function for financial mutations
await supabase.functions.invoke('create-expense', { body: expense });
```

The ESLint config (`.eslintrc.js`) does not currently enforce all of these
programmatically — code review is the primary enforcement mechanism.
Phase 2 may add custom ESLint rules to detect forbidden patterns.

## 10. Privacy controls for captured documents

Receipt images may contain sensitive information (card numbers, UPI IDs,
transaction references). BillLens gives users control over what is
retained:

| `storage_mode` | Image retained? | OCR text retained? |
|---------------|-----------------|-------------------|
| `local_only` | On device only | On device only |
| `cloud_private` | Cloud (private to uploader) | Cloud (private to uploader) |
| `shared_with_group` | Cloud (visible to group) | Cloud (visible to group) |
| `delete_after_extraction` | Deleted immediately after OCR | Only structured fields retained |

When `retain_raw_text = false`, OCR raw text is purged after structured
fields are extracted. When `retention_days` is set, a scheduled Edge
Function purges the image after that many days.

## 11. Incident response

If a security incident is suspected:

1. **Revoke tokens**: User can sign out (deletes tokens from SecureStore).
2. **Revoke refresh tokens server-side**: Supabase dashboard → Authentication → Sign Out user.
3. **Audit trail**: Query `audit_logs` for the affected user/entity to see all mutations.
4. **Soft-delete affected records**: Set `deleted_at` on compromised expenses/settlements.
5. **Notify affected group members**: Phase 2 feature (in-app notifications).

## 12. Phase 1 vs Phase 2 security

| Feature | Phase 1 | Phase 2 |
|---------|---------|---------|
| RLS enabled | ✅ (deny-by-default) | ✅ (with actual policies) |
| Edge Function validation | ❌ | ✅ |
| Audit log writes | ✅ (local SQLite) | ✅ (cloud PostgreSQL) |
| Signed URLs for receipts | ❌ | ✅ |
| Token rotation | ✅ (Supabase SDK) | ✅ |
| Certificate pinning | ❌ | ✅ (considered) |
| SQLCipher (local DB encryption) | ❌ | ✅ (considered) |
| Custom ESLint rules for forbidden patterns | ❌ | ✅ (considered) |
| Privacy controls for captured documents | ✅ (schema only) | ✅ (UI + enforcement) |
