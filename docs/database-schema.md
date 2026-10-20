# BillLens — Database Schema

> Status: **Phase 1 · Prompt 6 complete.**

This document describes the PostgreSQL schema used by BillLens's Supabase
backend. The schema is defined in
`supabase/migrations/202607291200_initial_schema.sql` and is the source of
truth for all data managed by the cloud backend.

The local SQLite schema (Prompt 8) mirrors this cloud schema for
offline-first operation but uses a simplified type system (TEXT for UUIDs,
INTEGER for minor units).

## 1. Entity Relationship Overview

```
profiles                  guest_identity_links
   │                          │
   │ 1                        │ 0..N
   │                          │
   ▼                          ▼
profiles ◄───────────── guest_identity_links
   │
   │ 1
   │
   ▼
groups ──┬── group_members ──── group_invites
   │       │
   │       │
   │ 1     │ 1
   │       │
   ▼       ▼
expenses ──┬── expense_payers
           ├── expense_splits
           ├── receipts ──── receipt_items
           │
           │
           ▼
       settlements

device_installations      (per-profile, per-device)
sync_conflicts            (sync resolution audit trail)
audit_logs                (append-only financial audit)
```

## 2. Tables (14 total)

### 2.1 `profiles`

Registered cloud-account users (Email OTP, Google, Apple sign-in).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `display_name` | TEXT | 1–80 chars after trim |
| `email` | TEXT | Stored as-typed; `email_lower` is the lookup key |
| `email_lower` | TEXT GENERATED | `lower(email)` — used for case-insensitive unique constraint |
| `avatar_url` | TEXT? | |
| Common columns | (see §3) | |

**Constraints:**
- `email_lower` is unique among non-deleted profiles.
- `display_name` non-empty after trim, ≤ 80 chars.

### 2.2 `guest_identity_links`

Tracks the upgrade flow from a local guest identity to a cloud profile.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `profile_id` | UUID FK → profiles | The cloud profile this guest linked to |
| `guest_identity_id` | UUID | The local guest identity (also client-generated) |
| `guest_display_name` | TEXT | Display name at time of upgrade |
| `device_secret_hash` | TEXT | Non-reversible hash of the device-scoped secret (the actual secret lives in SecureStore) |
| `upgrade_status` | ENUM | `local_only`, `upgrade_pending`, `upgrade_in_progress`, `upgraded`, `upgrade_failed` |
| `linked_at` | TIMESTAMPTZ? | When the link was completed |

**Constraints:**
- `guest_identity_id` is unique (one cloud link per guest identity — prevents
  linking one guest identity to multiple unrelated accounts).

### 2.3 `groups`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `name` | TEXT | 1–100 chars after trim |
| `description` | TEXT? | ≤ 500 chars |
| `currency_code` | TEXT | ISO 4217 (3-letter uppercase) |
| `created_by` | UUID FK → profiles | |

### 2.4 `group_members`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `group_id` | UUID FK → groups | |
| `user_id` | UUID FK → profiles? | NULL for invite-only / guest members |
| `display_name` | TEXT | 1–80 chars |
| `role` | ENUM | `owner`, `admin`, `member` |
| `joined_at` | TIMESTAMPTZ | |
| `left_at` | TIMESTAMPTZ? | Set when member leaves (soft-delete) |

**Constraints:**
- `(group_id, user_id)` unique among active members (one active membership per user per group).
- `(group_id)` unique among active owners (one owner per group).

> **Note on soft-deletion:** `group_members` does NOT have a `deleted_at`
> column. Instead, `left_at` serves as the soft-delete marker for this table.
> This is intentional: a member "leaving" a group is semantically equivalent
> to soft-deleting their membership row, but the `left_at` timestamp also
> carries domain meaning (when the member left), which is used for audit
> trails and historical balance calculations. As with `deleted_at` on other
> tables, rows with `left_at IS NOT NULL` are excluded from active-record
> queries (see the partial indexes `uq_group_members_group_user_active`,
> `uq_group_members_owner_per_group`, and `idx_group_members_active`).

### 2.5 `group_invites`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `group_id` | UUID FK → groups | |
| `token` | TEXT | Opaque, globally unique invite token |
| `inviter_member_id` | UUID FK → group_members | |
| `invitee_display_name` | TEXT? | Optional pre-filled name |
| `invitee_email` | TEXT? | Optional pre-filled email |
| `status` | ENUM | `pending`, `accepted`, `revoked`, `expired` |
| `expires_at` | TIMESTAMPTZ | Hard expiry |
| `accepted_by_member_id` | UUID FK? | Set when invite is accepted |
| `accepted_at` | TIMESTAMPTZ? | |
| `revoked_at` | TIMESTAMPTZ? | |

**Constraints:**
- `token` is globally unique.
- `expires_at` must be in the future at creation time (enforced by app).

### 2.6 `expenses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `group_id` | UUID FK → groups | |
| `title` | TEXT | 1–200 chars after trim |
| `amount_minor` | INTEGER | Positive integer minor units (e.g. ₹1,250.50 → 125050) |
| `currency_code` | TEXT | Must match group's currency_code (Phase 1) |
| `expense_date` | TIMESTAMPTZ | When the expense occurred (not necessarily now) |
| `split_type` | ENUM | `equal`, `exact`, `percentage`, `shares`, `items` |
| `receipt_id` | UUID FK? → receipts | Optional receipt link |
| `note` | TEXT? | ≤ 1000 chars |
| `category` | TEXT? | ≤ 50 chars |
| `created_by` | UUID FK → profiles | |

**Constraints:**
- `amount_minor > 0` (zero-value expenses are a separate Phase 2 record type).
- `currency_code ~ '^[A-Z]{3}$'`.
- Soft-deleted via `deleted_at`.

### 2.7 `expense_payers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `expense_id` | UUID FK → expenses | |
| `member_id` | UUID FK → group_members | |
| `amount_minor` | INTEGER | Non-negative integer |

**Constraints:**
- `(expense_id, member_id)` unique (one payer record per member per expense).
- Sum of `amount_minor` for an expense MUST equal `expenses.amount_minor`
  (enforced by application transaction).

### 2.8 `expense_splits`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `expense_id` | UUID FK → expenses | |
| `member_id` | UUID FK → group_members | |
| `amount_minor` | INTEGER | Non-negative integer |
| `percentage_basis_points` | INTEGER? | 0–10000 (for percentage splits) |
| `share_units` | INTEGER? | Positive integer (for shares splits) |

**Constraints:**
- `(expense_id, member_id)` unique (one split per member per expense).
- Sum of `amount_minor` for an expense MUST equal `expenses.amount_minor`
  (enforced by application transaction).
- For percentage splits, sum of `percentage_basis_points` MUST equal 10,000
  (enforced by application).

### 2.9 `receipts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `group_id` | UUID FK → groups | |
| `source` | ENUM | `paper`, `gallery`, `upi_screenshot`, `card_screenshot`, `bank_screenshot`, `digital_invoice`, `shared_image` |
| `merchant_name` | TEXT? | ≤ 200 chars |
| `currency_code` | TEXT? | Optional (may differ from group currency for foreign receipts) |
| `total_amount_minor` | INTEGER? | Non-negative |
| `subtotal_amount_minor` | INTEGER? | Non-negative |
| `tax_amount_minor` | INTEGER? | Non-negative |
| `receipt_date` | TIMESTAMPTZ? | |
| `image_uri` | TEXT? | Local URI or Supabase Storage signed URL |
| `image_hash` | TEXT? | SHA-256 hash for duplicate detection |
| `storage_mode` | ENUM | `local_only`, `cloud_private`, `shared_with_group`, `delete_after_extraction` |
| `retain_raw_text` | BOOLEAN | Default false (privacy default) |
| `retain_source_image` | BOOLEAN | Default true |
| `retention_days` | INTEGER? | Days to retain before auto-delete |
| `uploaded_by` | UUID FK → profiles | |

### 2.10 `receipt_items`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `receipt_id` | UUID FK → receipts | |
| `name` | TEXT | 1–200 chars after trim |
| `quantity` | INTEGER | Positive integer |
| `unit_price_minor` | INTEGER | Non-negative |
| `discount_minor` | INTEGER? | Non-negative |
| `tax_minor` | INTEGER? | Non-negative |
| `total_amount_minor` | INTEGER | Computed: (qty × unit_price) − discount + tax |
| `assigned_member_ids` | JSONB | Array of group_member UUIDs (for item-level splits) |

### 2.11 `settlements`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `group_id` | UUID FK → groups | |
| `from_member_id` | UUID FK → group_members | Payer |
| `to_member_id` | UUID FK → group_members | Payee |
| `amount_minor` | INTEGER | Positive integer |
| `currency_code` | TEXT | Must match group currency |
| `method` | ENUM | `cash`, `upi`, `bank_transfer`, `other` |
| `settlement_date` | TIMESTAMPTZ | |
| `note` | TEXT? | |
| `created_by` | UUID FK → profiles | |

**Constraints:**
- `from_member_id <> to_member_id` (CHECK constraint).
- `amount_minor > 0`.
- Settlements NEVER modify expense records. Reversing a settlement uses a
  new adjustment record (Phase 2).

### 2.12 `device_installations`

Tracks each device that has signed in. Used for push notifications and
multi-device sync.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `profile_id` | UUID FK → profiles | |
| `device_name` | TEXT? | User-facing device name |
| `platform` | TEXT | `ios`, `android`, `web` |
| `push_token` | TEXT? | Push notification token |
| `app_version` | TEXT? | |
| `last_seen_at` | TIMESTAMPTZ | Updated on each app launch |

### 2.13 `sync_conflicts`

Records conflicts detected during sync. Financial conflicts require user
review and are never silently overwritten.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `profile_id` | UUID FK → profiles | |
| `entity_type` | TEXT | `group`, `expense`, `settlement`, etc. |
| `entity_id` | UUID | |
| `conflict_category` | ENUM | `version_conflict`, `deleted_remotely`, `deleted_locally`, `membership_conflict`, `financial_record_conflict`, `duplicate_creation`, `permission_conflict` |
| `local_version` | INTEGER | |
| `cloud_version` | INTEGER | |
| `local_payload` | JSONB? | |
| `cloud_payload` | JSONB? | |
| `resolution` | TEXT? | `local_wins`, `cloud_wins`, `merged`, `user_review`, `pending` |
| `resolved_at` | TIMESTAMPTZ? | |
| `resolved_by` | UUID? | |

### 2.14 `audit_logs`

Append-only audit trail for financial mutations.

**IMPORTANT**: never store full receipt text, card details, UPI IDs, or
transaction references here — only the change summary.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `entity_type` | TEXT | |
| `entity_id` | UUID | |
| `action` | ENUM | `create`, `update`, `delete`, `restore`, `sync` |
| `actor_id` | UUID? | The profile that performed the action |
| `previous_version` | INTEGER? | |
| `new_version` | INTEGER? | |
| `change_summary` | JSONB? | Structured summary of what changed (NOT raw payloads) |
| `created_at` | TIMESTAMPTZ | Default `now()` |

## 3. Common columns (synchronised entities)

Most synchronised entities include:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Client-generated |
| `created_at` | TIMESTAMPTZ | Server-side creation time |
| `updated_at` | TIMESTAMPTZ | Server-side last-update time (auto-maintained by trigger) |
| `deleted_at` | TIMESTAMPTZ? | Soft-delete marker (NULL = active) |
| `version` | INTEGER | Optimistic concurrency (starts at 1, increments on every mutation) |
| `created_by` | UUID? | Profile that created the record |
| `last_modified_by` | UUID? | Profile that last modified the record |
| `client_created_at` | TIMESTAMPTZ | Client-side creation time (for offline-created records) |
| `client_updated_at` | TIMESTAMPTZ | Client-side last-update time |

The `client_*` timestamps are important for offline-first: when a client
creates a record offline, `client_created_at` is set immediately; when the
record syncs to the cloud, `created_at` is set by the server. The two may
differ significantly if the device was offline for a long time.

## 4. Constraints

### Single-row constraints (enforced by CHECK)

- `groups.name` non-empty after trim, ≤ 100 chars
- `groups.currency_code` matches `^[A-Z]{3}$`
- `expenses.amount_minor > 0`
- `expenses.title` non-empty after trim, ≤ 200 chars
- `expense_payers.amount_minor >= 0`
- `expense_splits.amount_minor >= 0`
- `expense_splits.percentage_basis_points` in [0, 10000] when not NULL
- `expense_splits.share_units > 0` when not NULL
- `settlements.amount_minor > 0`
- `settlements.from_member_id <> to_member_id`
- `group_members.role` is a valid `member_role` enum value
- `version > 0` on every table that has it

### Uniqueness constraints (enforced by UNIQUE INDEX)

- `profiles.email_lower` unique among non-deleted profiles
- `group_members(group_id, user_id)` unique among active memberships
- `group_members(group_id)` unique among active owners (one owner per group)
- `group_invites.token` globally unique
- `expense_payers(expense_id, member_id)` unique
- `expense_splits(expense_id, member_id)` unique
- `guest_identity_links.guest_identity_id` unique

### Cross-row invariants (NOT enforced by simple CHECK)

These are enforced by application transactions and server-side validation
(Supabase Edge Functions, Phase 2):

1. **Payer total invariant**: `Σ expense_payers.amount_minor = expenses.amount_minor`
2. **Split total invariant**: `Σ expense_splits.amount_minor = expenses.amount_minor`
3. **Percentage total invariant**: For percentage splits, `Σ expense_splits.percentage_basis_points = 10,000`
4. **Receipt item total invariant**: `Σ receipt_items.total_amount_minor = receipts.total_amount_minor`
5. **Group currency invariant**: `expenses.currency_code = groups.currency_code` (Phase 1 single-currency)

Application-side enforcement:
- `validatePayerTotal` in `src/domain/entities/expense.ts`
- `validateSplitTotal` in `src/domain/entities/expense-split.ts`
- `validatePercentageTotal` in `src/domain/entities/expense-split.ts`
- `validateReceiptItemTotal` in `src/domain/entities/receipt-item.ts`
- Balance engine in `src/domain/services/balances/balance-engine.ts` verifies
  `Σ netBalanceMinor = 0` after every calculation.

## 5. Indexes

Indexes follow access patterns:

| Pattern | Index |
|---------|-------|
| Groups by member | `idx_group_members_user`, `idx_group_members_group` |
| Expenses by group + date | `idx_expenses_group_date` |
| Active members by group | `idx_group_members_active` |
| Receipt items by receipt | `idx_receipt_items_receipt` |
| Settlements by group | `idx_settlements_group` |
| Soft-deleted filtering | Partial indexes with `WHERE deleted_at IS NULL` on most tables |
| Sync delta queries | `idx_*_updated_at` on every sync-able table |
| Invite token lookup | `uq_group_invites_token` |
| Receipt image hash lookup | `idx_receipts_hash` (for duplicate detection) |

## 6. Audit policy

`audit_logs` is append-only. The `change_summary` JSONB column captures a
structured summary of what changed (field names + before/after values for
key fields) — never the full payload.

For financial mutations (expense create/update/delete, settlement
create/delete), an audit log entry MUST be created in the same transaction
as the financial record. This is enforced by the application's
`UnitOfWork` abstraction (Prompt 7) and re-verified by the repository
implementations (Prompt 8).

**Forbidden in audit logs** (per privacy architecture):
- Full receipt OCR text
- Card numbers / CVVs / expiry dates
- UPI IDs / VPA addresses
- Bank account numbers
- Transaction reference numbers (unless explicitly consented)

## 7. Migration strategy

Migrations follow the Supabase convention:
- One file per migration, named `YYYYMMDDHHMM_<short-name>.sql`.
- Migrations are forward-only; down-migrations are NOT maintained. To
  roll back, write a new migration that reverses the change.
- Each migration is wrapped in a transaction by default.
- Use `create table if not exists` / `drop index if exists` for idempotency
  when possible.
- Enum types use `do $$ begin ... exception when duplicate_object then null; end $$`
  to be idempotent.

### Rollback considerations

- Phase 1 schema has no destructive migrations — adding tables and indexes
  is safe.
- Future migrations that drop columns MUST first migrate data to a new
  location, then drop in a separate migration after a release cycle.
- Soft-deletion (`deleted_at`) is the only deletion path for financial
  records. Hard-delete is forbidden.

## 8. Data retention

- Active records: kept indefinitely.
- Soft-deleted records: kept indefinitely for historical integrity.
- `sync_conflicts` resolved for > 90 days: may be archived.
- `audit_logs`: kept for at least 7 years (financial audit requirement).
- `device_installations`: deleted when the user signs out of a device.

### Receipt retention (per-receipt policy)

Receipt retention is governed by `receipts.storage_mode` and
`receipts.retention_days`:

| `storage_mode` | Behavior |
|---------------|----------|
| `local_only` | Image stays only on the device. Cloud stores metadata only. |
| `cloud_private` | Image stored in Supabase Storage, visible only to uploader. |
| `shared_with_group` | Image stored in Supabase Storage, visible to all group members. |
| `delete_after_extraction` | Image deleted immediately after OCR extraction. Only structured data (parsed fields) is retained. |

When `retain_raw_text = false`, the OCR raw text is purged after the
structured fields are extracted. When `retention_days` is set, a scheduled
Edge Function purges the image (and optionally the structured data) after
that many days.

## 9. Soft-delete policy

- **Soft-deletion is the ONLY deletion path for financial records.**
- Soft-deletion sets `deleted_at = now()` and increments `version`.
- Soft-deleted records are excluded from active balance calculations but
  preserved for audit and historical integrity.
- `deleted_at` is never unset — there is no "undelete" (a future Phase
  could add a `restore` audit action if needed, but the original
  `deleted_at` timestamp is preserved in the audit log).

## 10. Row Level Security (RLS)

All 14 tables have RLS enabled. Phase 1 Prompt 6 enables RLS with a
deny-by-default policy. Phase 1 Prompt 9 adds the actual policies:

- Users can read only groups they belong to.
- Only authorised members can add expenses.
- Only owners or admins can remove members.
- Users cannot modify another member's identity.
- Receipt files require signed URLs.
- Service-role keys must never be stored in the app.

## 11. Seed data (development only)

`supabase/seed.sql` contains deterministic seed data for development:
- 3 users (Alice, Bob, Charlie) with `@billlens.example` emails.
- 1 group (Dev Goa Trip, INR).
- 3 members.
- 1 expense (Dinner at Paradise, ₹12.00 = 1200 minor units, A pays all,
  A/B/C split 300/400/500).

This seed data is gated by `EXPO_PUBLIC_APP_ENV=development` — it must
NEVER be loaded in staging or production. The seed file uses deterministic
UUIDs (`00000000-...-000000000001` etc.) so tests can reference them by ID.

## 12. Local SQLite mirror

The local SQLite schema (defined in Prompt 8) mirrors this cloud schema
with these simplifications:

| Cloud | SQLite |
|-------|--------|
| UUID | TEXT (stored as UUID string) |
| TIMESTAMPTZ | TEXT (ISO 8601 UTC) |
| JSONB | TEXT (serialized JSON) |
| ENUM | TEXT + CHECK constraint |
| GENERATED column | Computed in application code |

The SQLite schema also includes a `sync_operations` table for the offline
sync queue — this is local-only and does NOT exist in the cloud schema.
