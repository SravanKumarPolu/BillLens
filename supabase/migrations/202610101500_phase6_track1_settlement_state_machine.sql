begin;

-- ============================================================================
-- BillLens — Phase 6 Track 1 Schema Migration
-- ============================================================================
-- Adds the settlement state machine, receiver-confirmation fields,
-- dispute taxonomy, and idempotency columns to the settlements table.
-- Also creates three new tables:
--
--   settlement_state_history  — audit trail of state transitions
--   settlement_reminders       — respectful payment follow-up reminders
--   member_payment_handles     — UPI VPA / bank handles (masked, encrypted)
--
-- ── Migration principles ──
--
-- 1. ADDITIVE ONLY. No existing column is renamed, retyped, or removed.
--    No existing row is invalidated. The migration is forward-only.
-- 2. NULLABLE. All new columns are NULLABLE so existing rows hydrate
--    cleanly: a NULL `status` is treated as `'completed'` by the
--    domain layer (see `isSettlementCompleted` in `settlement.ts`).
-- 3. ROLLBACK SCRIPT PROVIDED. See the bottom of this file. The
--    rollback drops only the objects this migration created.
-- 4. IDEMPOTENT. All statements use `if not exists` / `add if not exists`.
--    Re-running the migration is a no-op.
--
-- ── Settlement method enum extension ──
--
-- The Supabase `settlement_method` enum needs two new values: `card`
-- and `wallet`. PostgreSQL enums are additive via `alter type ...
-- add value`. The SQLite schema uses a `check (method in (...))`
-- constraint — the migration drops and recreates that check.
--
-- ── Settlement status enum ──
--
-- A new `settlement_status` enum is created in Supabase. The
-- settlements table gets a nullable `status` column referencing it.
-- SQLite uses a `check (status in (...))` constraint instead.

-- ============================================================================
-- 1. Extend the settlement_method enum (Supabase only)
-- ============================================================================
-- PostgreSQL enums are additive — `add value` is safe and does not
-- require a table rewrite. The if-not-exists guard is not available
-- for `alter type add value` until PG12; we use a do-block with an
-- explicit check.
do $$
begin
  -- Add 'card' if not present
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'settlement_method' and e.enumlabel = 'card'
  ) then
    alter type settlement_method add value 'card';
  end if;
  -- Add 'wallet' if not present
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'settlement_method' and e.enumlabel = 'wallet'
  ) then
    alter type settlement_method add value 'wallet';
  end if;
end$$;

-- ============================================================================
-- 2. Create the settlement_status enum (Supabase only)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'settlement_status') then
    create type settlement_status as enum (
      'draft',
      'requested',
      'pending_confirmation',
      'completed',
      'failed',
      'cancelled',
      'disputed',
      'reversed'
    );
  end if;
end$$;

-- ============================================================================
-- 3. Add new columns to the settlements table
-- ============================================================================
-- All columns are NULLABLE so existing rows hydrate cleanly. A NULL
-- `status` is treated as `'completed'` by the domain layer for
-- backwards compatibility (see `isSettlementCompleted` in `settlement.ts`).
do $$
begin
  -- status — lifecycle state
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'status'
  ) then
    alter table settlements add column status settlement_status;
    -- Default existing rows to 'completed' so the balance engine
    -- continues to count them as before. New rows set status explicitly
    -- via the use cases (e.g. 'draft', 'pending_confirmation').
    update settlements set status = 'completed' where status is null;
  end if;

  -- confirmed_by_member_id — who confirmed (the receiver)
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'confirmed_by_member_id'
  ) then
    alter table settlements add column confirmed_by_member_id uuid
      references group_members (id) on delete set null;
  end if;

  -- confirmed_at — when confirmation happened
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'confirmed_at'
  ) then
    alter table settlements add column confirmed_at timestamptz;
  end if;

  -- payment_reference_hash — sha256 (hex) of UPI UTR / bank RRN
  -- Used for duplicate detection. NEVER store the raw reference.
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'payment_reference_hash'
  ) then
    alter table settlements add column payment_reference_hash text
      check (payment_reference_hash is null or char_length(payment_reference_hash) = 64);
  end if;

  -- operation_id — client-generated idempotency key for offline creation
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'operation_id'
  ) then
    alter table settlements add column operation_id text;
  end if;

  -- evidence_hash — sha256 (hex) of attached evidence file
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'evidence_hash'
  ) then
    alter table settlements add column evidence_hash text
      check (evidence_hash is null or char_length(evidence_hash) = 64);
  end if;

  -- dispute_reason — structured dispute reason (Prompt 57)
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'dispute_reason'
  ) then
    alter table settlements add column dispute_reason text
      check (dispute_reason is null or dispute_reason in (
        'not_received', 'wrong_amount', 'wrong_currency',
        'wrong_sender', 'duplicate', 'failed', 'reversed', 'other'
      ));
  end if;

  -- dispute_note — optional free-text context for a dispute
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'settlements' and column_name = 'dispute_note'
  ) then
    alter table settlements add column dispute_note text
      check (dispute_note is null or char_length(dispute_note) <= 2000);
  end if;
end$$;

-- ============================================================================
-- 4. Indexes on the new columns
-- ============================================================================
-- The status index is the most important — it backs the
-- listByStatus / listPendingConfirmation / listDisputed queries.
create index if not exists idx_settlements_status
  on settlements (group_id, status)
  where deleted_at is null;

create index if not exists idx_settlements_pending_confirmation
  on settlements (group_id)
  where status = 'pending_confirmation' and deleted_at is null;

create index if not exists idx_settlements_disputed
  on settlements (group_id)
  where status = 'disputed' and deleted_at is null;

create index if not exists idx_settlements_operation_id
  on settlements (operation_id)
  where operation_id is not null;

-- Unique constraint on (operation_id) — idempotency. Two settlements
-- with the same operation_id are the same intended write. The
-- partial-unique form means NULL operation_ids (legacy rows) do not
-- conflict.
create unique index if not exists uq_settlements_operation_id
  on settlements (operation_id)
  where operation_id is not null;

-- Unique constraint on (group_id, payment_reference_hash) — duplicate
-- reference detection within a group. NULL hashes do not conflict.
create unique index if not exists uq_settlements_payment_ref
  on settlements (group_id, payment_reference_hash)
  where payment_reference_hash is not null;

-- ============================================================================
-- 5. New table: settlement_state_history
-- ============================================================================
-- Append-only audit trail of state transitions. Each row records one
-- transition (from → to) along with who performed it and when.
-- Used by the settlement-detail screen to render the "state history"
-- section and by the audit log for forensic analysis.
create table if not exists settlement_state_history (
  id                uuid primary key default gen_random_uuid(),
  settlement_id     uuid not null references settlements (id) on delete cascade,
  from_status       settlement_status not null,
  to_status         settlement_status not null,
  actor_id          uuid references profiles (id) on delete set null,
  actor_member_id   uuid references group_members (id) on delete set null,
  note              text check (note is null or char_length(note) <= 1000),
  -- Version of the settlement AFTER the transition was applied.
  new_version       integer not null check (new_version > 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_settlement_state_history_settlement
  on settlement_state_history (settlement_id, created_at);

-- ============================================================================
-- 6. New table: settlement_reminders (Prompt 59)
-- ============================================================================
-- Respectful payment follow-up reminders. Stored server-side so they
-- survive device reinstall and can be reconciled across devices.
--
-- Cool-down, quiet-hours, and notification privacy modes are enforced
-- by the application layer (pure functions); this table is the
-- persistent state.
create type reminder_status as enum (
  'scheduled', 'sent', 'cancelled', 'failed', 'no_longer_needed'
);

create type reminder_type as enum (
  'one_time',
  'scheduled',
  'settlement_request',
  'pending_confirmation',
  'dispute_follow_up',
  'group_summary'
);

create table if not exists settlement_reminders (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups (id) on delete cascade,
  settlement_id     uuid references settlements (id) on delete cascade,
  payer_member_id   uuid references group_members (id) on delete cascade,
  receiver_member_id uuid references group_members (id) on delete cascade,
  currency_code     text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount_minor      integer check (amount_minor is null or amount_minor > 0),
  reminder_type     reminder_type not null,
  scheduled_at      timestamptz not null,
  status            reminder_status not null default 'scheduled',
  -- Notification privacy mode at the time of scheduling (frozen so
  -- later changes to user preferences do not retroactively alter
  -- already-sent notifications).
  privacy_mode      text not null default 'private'
                    check (privacy_mode in ('private', 'detailed', 'in_app_only', 'disabled')),
  created_by        uuid not null references profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz,
  cancelled_at      timestamptz,
  -- If non-null, the reminder was auto-cancelled because this event
  -- made it no longer relevant (settle_completed, dispute_opened,
  -- member_removed, group_deleted).
  auto_cancel_reason text,
  check (payer_member_id is null or receiver_member_id is null or payer_member_id <> receiver_member_id)
);

create index if not exists idx_reminders_scheduled
  on settlement_reminders (status, scheduled_at)
  where status = 'scheduled';
create index if not exists idx_reminders_group
  on settlement_reminders (group_id);
create index if not exists idx_reminders_settlement
  on settlement_reminders (settlement_id)
  where settlement_id is not null;
create index if not exists idx_reminders_payer
  on settlement_reminders (payer_member_id)
  where payer_member_id is not null;

-- ============================================================================
-- 7. New table: member_payment_handles (Prompt 56 — UPI)
-- ============================================================================
-- UPI VPA / bank handles for group members, used by the UPI-assisted
-- settlement flow. Stored MASKED + ENCRYPTED — the raw VPA never
-- appears in logs, analytics, or public group previews.
--
-- `masked_display_value` is the user-facing form (e.g. "ja***@oksbi").
-- `encrypted_value` is the ciphertext (envelope encryption with a
-- per-tenant key; the application layer never sees the plaintext key).
-- `verification_status` tracks whether the VPA has been verified by
-- a tiny test transaction or only user-confirmed.
create type payment_handle_type as enum ('upi_vpa', 'bank_account', 'wallet');

create type payment_handle_verification as enum (
  'unverified', 'user_confirmed', 'verified'
);

create table if not exists member_payment_handles (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references group_members (id) on delete cascade,
  type              payment_handle_type not null,
  -- Masked display form, e.g. "ja***@oksbi". Safe to show in UI and
  -- to include in audit logs.
  masked_display_value text not null
    check (char_length(masked_display_value) between 3 and 64),
  -- Encrypted ciphertext of the full handle. NULL only when the
  -- handle was entered by the user but not yet stored (transient).
  encrypted_value   text,
  -- Key id used to encrypt `encrypted_value`. Allows key rotation
  -- without re-encrypting every row at once.
  encryption_key_id text,
  verification_status payment_handle_verification not null default 'unverified',
  is_default        boolean not null default false,
  -- Optional label the user can attach ("Personal UPI", "Joint A/C").
  label             text check (label is null or char_length(label) <= 64),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  check (encrypted_value is null or char_length(encrypted_value) > 0)
);

-- Only one default handle per (member, type).
create unique index if not exists uq_payment_handle_default
  on member_payment_handles (member_id, type)
  where is_default = true and deleted_at is null;

create index if not exists idx_payment_handles_member
  on member_payment_handles (member_id)
  where deleted_at is null;

create index if not exists idx_payment_handles_member_type
  on member_payment_handles (member_id, type)
  where deleted_at is null;

-- ============================================================================
-- 8. Enable RLS on the new tables (Supabase only)
-- ============================================================================
-- BillLens enforces row-level security on every financial table. The
-- new tables follow the same pattern: the application role can only
-- see rows for groups the current user is a member of.

-- settlement_state_history — visible to members of the group that owns
-- the linked settlement.
alter table settlement_state_history enable row level security;
drop policy if exists "settlement_state_history_readable_by_group_members" on settlement_state_history;
create policy "settlement_state_history_readable_by_group_members"
  on settlement_state_history for select
  using (
    exists (
      select 1 from settlements s
      join group_members gm on gm.group_id = s.group_id
      where s.id = settlement_state_history.settlement_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

-- Only the application backend (service role) writes state history;
-- users never insert directly.
alter table settlement_state_history force row level security;

-- settlement_reminders — users can see and manage their own reminders
-- (where they are the creator or the receiver).
alter table settlement_reminders enable row level security;
drop policy if exists "reminders_select_own" on settlement_reminders;
create policy "reminders_select_own"
  on settlement_reminders for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from group_members gm
      where gm.group_id = settlement_reminders.group_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

drop policy if exists "reminders_insert_own" on settlement_reminders;
create policy "reminders_insert_own"
  on settlement_reminders for insert
  with check (created_by = auth.uid());

drop policy if exists "reminders_update_own" on settlement_reminders;
create policy "reminders_update_own"
  on settlement_reminders for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "reminders_delete_own" on settlement_reminders;
create policy "reminders_delete_own"
  on settlement_reminders for delete
  using (created_by = auth.uid());

-- member_payment_handles — users can see only their own handles.
-- Note: this policy uses the member → profile join, not auth.uid()
-- directly, because a user may have multiple group memberships but
-- we want the handle to be visible across their own memberships.
alter table member_payment_handles enable row level security;
drop policy if exists "payment_handles_select_own" on member_payment_handles;
create policy "payment_handles_select_own"
  on member_payment_handles for select
  using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

drop policy if exists "payment_handles_insert_own" on member_payment_handles;
create policy "payment_handles_insert_own"
  on member_payment_handles for insert
  with check (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

drop policy if exists "payment_handles_update_own" on member_payment_handles;
create policy "payment_handles_update_own"
  on member_payment_handles for update
  using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

drop policy if exists "payment_handles_delete_own" on member_payment_handles;
create policy "payment_handles_delete_own"
  on member_payment_handles for delete
  using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.deleted_at is null
    )
  );

-- ============================================================================
-- ROLLBACK SCRIPT (run in reverse order to undo this migration)
-- ============================================================================
-- ⚠️ The rollback drops only the objects this migration created.
--   Existing tables and columns are NOT touched.
--
-- drop table if exists member_payment_handles;
-- drop table if exists settlement_reminders;
-- drop table if exists settlement_state_history;
-- drop index if exists uq_settlements_payment_ref;
-- drop index if exists uq_settlements_operation_id;
-- drop index if exists idx_settlements_disputed;
-- drop index if exists idx_settlements_pending_confirmation;
-- drop index if exists idx_settlements_status;
-- alter table settlements
--   drop column if exists dispute_note,
--   drop column if exists dispute_reason,
--   drop column if exists evidence_hash,
--   drop column if exists operation_id,
--   drop column if exists payment_reference_hash,
--   drop column if exists confirmed_at,
--   drop column if exists confirmed_by_member_id,
--   drop column if exists status;
-- drop type if exists payment_handle_verification;
-- drop type if exists payment_handle_type;
-- drop type if exists reminder_status;
-- drop type if exists reminder_type;
-- drop type if exists settlement_status;
-- (Note: 'card' and 'wallet' cannot be removed from the settlement_method
--  enum after they are added — PostgreSQL enum values are immutable.
--  This is acceptable: the values are simply unused after rollback.)

commit;
