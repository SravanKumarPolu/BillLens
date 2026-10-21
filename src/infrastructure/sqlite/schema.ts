/**
 * SQLite schema for the local on-device database.
 *
 * This schema mirrors the cloud PostgreSQL schema (see
 * supabase/migrations/202607291200_initial_schema.sql) with these
 * simplifications:
 *
 *   - UUIDs are stored as TEXT (SQLite has no native UUID type).
 *   - Timestamps are stored as TEXT (ISO 8601 UTC strings).
 *   - JSONB is stored as TEXT (serialized JSON).
 *   - Enum types are stored as TEXT with CHECK constraints.
 *   - There is no GENERATED column (SQLite supports it but our app
 *     computes the value in TypeScript instead).
 *   - The local schema has ONE additional table that does NOT exist in
 *     the cloud: `sync_operations` (the offline sync queue).
 *
 * The migration runner (sqlite-migrations.ts) applies migrations
 * versioned by an integer prefix. The `schema_version` table tracks
 * which migrations have been applied.
 *
 * IMPORTANT: SQLite does NOT enforce foreign keys by default. The
 * connection wrapper enables `PRAGMA foreign_keys = ON` so that
 * `REFERENCES ... ON DELETE CASCADE` actually fires.
 */

import type { DatabaseConnection } from './database-connection';
import { splitSqlStatements } from './sql-statements';

/**
 * Schema version table — tracks which migrations have been applied.
 * Each migration is identified by an integer version number (the prefix
 * of its filename, e.g. `0001_initial_schema`).
 */
export const SCHEMA_VERSION_TABLE_SQL = `
create table if not exists schema_version (
  version    integer primary key,
  name       text not null,
  applied_at text not null default (datetime('now'))
);
`;

/**
 * Initial local SQLite schema (migration 0001).
 *
 * Creates all local tables mirroring the cloud schema plus the
 * `sync_operations` table for the offline sync queue.
 */
export const MIGRATION_0001_INITIAL_SCHEMA = `
-- ============================================================================
-- Enum-like CHECK constraints (SQLite has no native ENUM type)
-- ============================================================================

-- ============================================================================
-- profiles (local cache of cloud-account users)
-- ============================================================================
create table if not exists profiles (
  id                text primary key,
  display_name      text not null check (length(trim(display_name)) between 1 and 80),
  email             text not null,
  email_lower       text not null,
  avatar_url        text,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  created_by        text,
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create unique index if not exists uq_profiles_email_lower on profiles (email_lower) where deleted_at is null;

-- ============================================================================
-- guest_identity_links (local-only; tracks guest → cloud upgrade)
-- ============================================================================
create table if not exists guest_identity_links (
  id                  text primary key,
  profile_id          text not null,
  guest_identity_id   text not null unique,
  guest_display_name  text not null,
  device_secret_hash  text not null,
  upgrade_status      text not null default 'local_only'
                      check (upgrade_status in (
                        'local_only', 'upgrade_pending', 'upgrade_in_progress',
                        'upgraded', 'upgrade_failed'
                      )),
  linked_at           text,
  created_at          text not null,
  updated_at          text not null,
  version             integer not null default 1 check (version > 0),
  client_created_at   text not null,
  client_updated_at   text not null
);

create index if not exists idx_guest_links_profile on guest_identity_links (profile_id);

-- ============================================================================
-- groups
-- ============================================================================
create table if not exists groups (
  id                text primary key,
  name              text not null check (length(trim(name)) between 1 and 100),
  description       text check (description is null or length(description) <= 500),
  currency_code     text not null check (currency_code glob '[A-Z][A-Z][A-Z]'),
  created_by        text not null,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_groups_created_by on groups (created_by);
create index if not exists idx_groups_active on groups (id) where deleted_at is null;
create index if not exists idx_groups_updated_at on groups (updated_at);

-- ============================================================================
-- group_members
-- ============================================================================
create table if not exists group_members (
  id                text primary key,
  group_id          text not null references groups (id) on delete cascade,
  user_id           text,
  display_name      text not null check (length(trim(display_name)) between 1 and 80),
  role              text not null default 'member'
                    check (role in ('owner', 'admin', 'member')),
  joined_at         text not null,
  left_at           text,
  created_at        text not null,
  updated_at        text not null,
  version           integer not null default 1 check (version > 0),
  created_by        text,
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create unique index if not exists uq_group_members_group_user_active
  on group_members (group_id, user_id)
  where user_id is not null and left_at is null;

create unique index if not exists uq_group_members_owner_per_group
  on group_members (group_id)
  where role = 'owner' and left_at is null;

create index if not exists idx_group_members_group on group_members (group_id);
create index if not exists idx_group_members_user on group_members (user_id);
create index if not exists idx_group_members_active on group_members (group_id) where left_at is null;
create index if not exists idx_group_members_updated_at on group_members (updated_at);

-- ============================================================================
-- group_invites
-- ============================================================================
create table if not exists group_invites (
  id                      text primary key,
  group_id                text not null references groups (id) on delete cascade,
  token                   text not null unique,
  token_hash              text not null,
  inviter_member_id       text not null references group_members (id) on delete cascade,
  invitee_display_name    text,
  invitee_email           text,
  status                  text not null default 'pending'
                          check (status in ('pending', 'accepted', 'revoked', 'expired')),
  intended_role           text not null default 'member'
                          check (intended_role in ('member', 'admin')),
  max_uses                integer not null default 1 check (max_uses > 0 and max_uses <= 50),
  use_count               integer not null default 0 check (use_count >= 0),
  expires_at              text not null,
  accepted_by_member_id   text,
  accepted_at             text,
  revoked_at              text,
  created_at              text not null,
  updated_at              text not null,
  version                 integer not null default 1 check (version > 0),
  created_by              text,
  last_modified_by        text,
  client_created_at       text not null,
  client_updated_at       text not null
);

create index if not exists idx_group_invites_group on group_invites (group_id);
create index if not exists idx_group_invites_status on group_invites (status);
create index if not exists idx_group_invites_token_hash on group_invites (token_hash);

-- ============================================================================
-- expenses
-- ============================================================================
create table if not exists expenses (
  id                text primary key,
  group_id          text not null references groups (id) on delete cascade,
  title             text not null check (length(trim(title)) between 1 and 200),
  amount_minor      integer not null check (amount_minor > 0),
  currency_code     text not null check (currency_code glob '[A-Z][A-Z][A-Z]'),
  expense_date      text not null,
  split_type        text not null check (split_type in ('equal', 'exact', 'percentage', 'shares', 'items')),
  receipt_id        text,
  note              text check (note is null or length(note) <= 1000),
  category          text check (category is null or length(category) <= 50),
  created_by        text not null,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_expenses_group on expenses (group_id);
create index if not exists idx_expenses_group_date on expenses (group_id, expense_date desc);
create index if not exists idx_expenses_active on expenses (group_id) where deleted_at is null;
create index if not exists idx_expenses_updated_at on expenses (updated_at);

-- ============================================================================
-- expense_payers
-- ============================================================================
create table if not exists expense_payers (
  id                text primary key,
  expense_id        text not null references expenses (id) on delete cascade,
  member_id         text not null references group_members (id) on delete cascade,
  amount_minor      integer not null check (amount_minor >= 0),
  deleted_at        text,
  created_at        text not null,
  updated_at        text not null,
  version           integer not null default 1 check (version > 0),
  created_by        text,
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_expense_payers_expense on expense_payers (expense_id);
create index if not exists idx_expense_payers_member on expense_payers (member_id);
create unique index if not exists uq_expense_payers_expense_member on expense_payers (expense_id, member_id);
create index if not exists idx_expense_payers_active on expense_payers (expense_id) where deleted_at is null;
create index if not exists idx_expense_payers_updated_at on expense_payers (updated_at);

-- ============================================================================
-- expense_splits
-- ============================================================================
create table if not exists expense_splits (
  id                       text primary key,
  expense_id               text not null references expenses (id) on delete cascade,
  member_id                text not null references group_members (id) on delete cascade,
  amount_minor             integer not null check (amount_minor >= 0),
  percentage_basis_points  integer check (percentage_basis_points is null or (percentage_basis_points between 0 and 10000)),
  share_units              integer check (share_units is null or share_units > 0),
  deleted_at               text,
  created_at               text not null,
  updated_at               text not null,
  version                  integer not null default 1 check (version > 0),
  created_by               text,
  last_modified_by         text,
  client_created_at        text not null,
  client_updated_at        text not null
);

create index if not exists idx_expense_splits_expense on expense_splits (expense_id);
create index if not exists idx_expense_splits_member on expense_splits (member_id);
create unique index if not exists uq_expense_splits_expense_member on expense_splits (expense_id, member_id);
create index if not exists idx_expense_splits_active on expense_splits (expense_id) where deleted_at is null;
create index if not exists idx_expense_splits_updated_at on expense_splits (updated_at);

-- ============================================================================
-- receipts
-- ============================================================================
create table if not exists receipts (
  id                       text primary key,
  group_id                 text not null references groups (id) on delete cascade,
  source                   text not null check (source in (
    'paper', 'gallery', 'upi_screenshot', 'card_screenshot',
    'bank_screenshot', 'digital_invoice', 'shared_image'
  )),
  merchant_name            text check (merchant_name is null or length(merchant_name) <= 200),
  currency_code            text check (currency_code is null or currency_code glob '[A-Z][A-Z][A-Z]'),
  total_amount_minor       integer check (total_amount_minor is null or total_amount_minor >= 0),
  subtotal_amount_minor    integer check (subtotal_amount_minor is null or subtotal_amount_minor >= 0),
  tax_amount_minor         integer check (tax_amount_minor is null or tax_amount_minor >= 0),
  receipt_date             text,
  image_uri                text,
  image_hash               text,
  storage_mode             text not null default 'local_only'
                           check (storage_mode in ('local_only', 'cloud_private', 'shared_with_group', 'delete_after_extraction')),
  retain_raw_text          integer not null default 0,
  retain_source_image      integer not null default 1,
  retention_days           integer check (retention_days is null or retention_days > 0),
  uploaded_by              text not null,
  created_at               text not null,
  updated_at               text not null,
  deleted_at               text,
  version                  integer not null default 1 check (version > 0),
  last_modified_by         text,
  client_created_at        text not null,
  client_updated_at        text not null
);

create index if not exists idx_receipts_group on receipts (group_id);
create index if not exists idx_receipts_active on receipts (group_id) where deleted_at is null;
create index if not exists idx_receipts_hash on receipts (image_hash) where image_hash is not null;

-- ============================================================================
-- receipt_items
-- ============================================================================
create table if not exists receipt_items (
  id                text primary key,
  receipt_id        text not null references receipts (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 200),
  quantity          integer not null check (quantity > 0),
  unit_price_minor  integer not null check (unit_price_minor >= 0),
  discount_minor    integer check (discount_minor is null or discount_minor >= 0),
  tax_minor         integer check (tax_minor is null or tax_minor >= 0),
  total_amount_minor integer not null check (total_amount_minor >= 0),
  assigned_member_ids text not null default '[]',
  deleted_at        text,
  created_at        text not null,
  updated_at        text not null,
  version           integer not null default 1 check (version > 0),
  created_by        text,
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_receipt_items_receipt on receipt_items (receipt_id);
create index if not exists idx_receipt_items_active on receipt_items (receipt_id) where deleted_at is null;
create index if not exists idx_receipt_items_updated_at on receipt_items (updated_at);

-- ============================================================================
-- settlements
-- ============================================================================
create table if not exists settlements (
  id                text primary key,
  group_id          text not null references groups (id) on delete cascade,
  from_member_id    text not null references group_members (id) on delete cascade,
  to_member_id      text not null references group_members (id) on delete cascade,
  amount_minor      integer not null check (amount_minor > 0),
  currency_code     text not null check (currency_code glob '[A-Z][A-Z][A-Z]'),
  method            text not null check (method in ('cash', 'upi', 'bank_transfer', 'other')),
  settlement_date   text not null,
  note              text,
  reverses_settlement_id text,
  reversal_of_settlement_id text,
  created_by        text not null,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  last_modified_by  text,
  client_created_at text not null,
  client_updated_at text not null,
  check (from_member_id <> to_member_id)
);

create index if not exists idx_settlements_group on settlements (group_id);
create index if not exists idx_settlements_from on settlements (from_member_id);
create index if not exists idx_settlements_to on settlements (to_member_id);
create index if not exists idx_settlements_active on settlements (group_id) where deleted_at is null;
create index if not exists idx_settlements_reversal on settlements (reversal_of_settlement_id) where reversal_of_settlement_id is not null;
create index if not exists idx_settlements_updated_at on settlements (updated_at);

-- ============================================================================
-- sync_operations (LOCAL-ONLY — does NOT exist in cloud schema)
-- ============================================================================
-- The offline sync queue. Each row represents a pending change to be
-- uploaded to the cloud. The sync worker processes them FIFO and removes
-- them on success.
create table if not exists sync_operations (
  id                  text primary key,
  entity_type         text not null check (entity_type in (
    'group', 'group_member', 'group_invite', 'expense',
    'expense_payer', 'expense_split', 'receipt', 'receipt_item', 'settlement'
  )),
  entity_id           text not null,
  operation           text not null check (operation in ('create', 'update', 'delete')),
  payload             text not null,
  idempotency_key     text not null,
  base_version        integer not null,
  local_version       integer not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'syncing', 'failed', 'conflict', 'completed')),
  retry_count         integer not null default 0,
  last_error_code     text,
  last_error_message  text,
  created_at          text not null,
  last_attempted_at   text,
  next_retry_at       text
);

create index if not exists idx_sync_ops_status on sync_operations (status);
create index if not exists idx_sync_ops_created_at on sync_operations (created_at);
create index if not exists idx_sync_ops_next_retry on sync_operations (next_retry_at) where status = 'failed';
create index if not exists idx_sync_ops_entity on sync_operations (entity_type, entity_id);
create unique index if not exists uq_sync_ops_idempotency on sync_operations (idempotency_key) where status in ('pending', 'syncing');

-- ============================================================================
-- sync_conflicts (local cache of unresolved conflicts)
-- ============================================================================
create table if not exists sync_conflicts (
  id                text primary key,
  profile_id        text,
  entity_type       text not null,
  entity_id         text not null,
  category          text not null check (category in (
    'version_conflict', 'deleted_remotely', 'deleted_locally',
    'membership_conflict', 'financial_record_conflict',
    'duplicate_creation', 'permission_conflict'
  )),
  local_version     integer not null,
  cloud_version     integer not null,
  local_payload     text,
  cloud_payload     text,
  resolution        text check (resolution is null or resolution in (
    'local_wins', 'cloud_wins', 'merged', 'user_review', 'pending'
  )),
  resolved_at       text,
  resolved_by       text,
  created_at        text not null,
  updated_at        text not null
);

create index if not exists idx_sync_conflicts_unresolved on sync_conflicts (id) where resolution is null or resolution = 'pending';

-- ============================================================================
-- audit_logs (local mirror)
-- ============================================================================
create table if not exists audit_logs (
  id                text primary key,
  entity_type       text not null,
  entity_id         text not null,
  action            text not null check (action in ('create', 'update', 'delete', 'restore', 'sync')),
  actor_id          text,
  previous_version  integer,
  new_version       integer,
  change_summary    text,
  created_at        text not null
);

create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at);

-- ============================================================================
-- sync_metadata (per-entity sync state tracking)
-- ============================================================================
create table if not exists sync_metadata (
  entity_type         text not null,
  entity_id           text not null,
  cloud_version       integer not null default 0,
  last_synced_at      text,
  has_pending_changes integer not null default 1,
  idempotency_key     text,
  primary key (entity_type, entity_id)
);

create index if not exists idx_sync_metadata_pending on sync_metadata (entity_type) where has_pending_changes = 1;

-- ============================================================================
-- device_installations
-- ============================================================================
create table if not exists device_installations (
  id                text primary key,
  profile_id        text not null,
  device_name       text,
  platform          text check (platform is null or platform in ('ios', 'android', 'web')),
  push_token        text,
  app_version       text,
  last_seen_at      text not null,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_device_installations_profile on device_installations (profile_id);

-- ============================================================================
-- expense_drafts (capture intelligence layer)
-- ============================================================================
-- Editable intermediate between capture and final expense.
-- An expense draft is NEVER a financial record — it becomes an Expense only
-- after user confirmation. This is the core of BillLens's trust model.
--
-- Note: SQLite has no JSONB type — draft_data and unresolved_issues are
-- stored as TEXT (serialized JSON). The application layer is responsible
-- for parsing/serializing.
create table if not exists expense_drafts (
  id                    text primary key,
  group_id              text references groups (id) on delete cascade,
  source                text not null check (source in ('manual', 'receipt', 'payment_screenshot', 'invoice')),
  capture_source_id     text,
  extraction_result_id  text,
  draft_data            text not null default '{}',
  status                text not null default 'capturing'
                        check (status in ('capturing', 'processing', 'needs_review', 'ready', 'confirmed', 'discarded')),
  -- overall_confidence stored as INTEGER basis points (0–10000, where 10000 = 1.0)
  overall_confidence_bp integer check (overall_confidence_bp is null or (overall_confidence_bp between 0 and 10000)),
  unresolved_issues     text not null default '[]',
  confirmed_expense_id  text references expenses (id) on delete set null,
  confirmed_receipt_id  text references receipts (id) on delete set null,
  created_by            text not null,
  created_at            text not null,
  updated_at            text not null,
  deleted_at            text,
  version               integer not null default 1 check (version > 0),
  last_modified_by      text,
  client_created_at     text not null,
  client_updated_at     text not null
);

create index if not exists idx_expense_drafts_group on expense_drafts (group_id);
create index if not exists idx_expense_drafts_status on expense_drafts (status);
create index if not exists idx_expense_drafts_active on expense_drafts (group_id) where deleted_at is null and status not in ('confirmed', 'discarded');
create index if not exists idx_expense_drafts_capture on expense_drafts (capture_source_id) where capture_source_id is not null;
create index if not exists idx_expense_drafts_updated_at on expense_drafts (updated_at);

-- ============================================================================
-- capture_sources
-- ============================================================================
create table if not exists capture_sources (
  id                text primary key,
  source_type       text not null check (source_type in (
    'paper_receipt', 'gallery_image', 'upi_screenshot', 'card_screenshot',
    'bank_screenshot', 'digital_invoice', 'shared_image'
  )),
  image_uri         text not null,
  image_hash        text,
  mime_type         text,
  file_size_bytes   integer check (file_size_bytes is null or file_size_bytes >= 0),
  processing_status text not null default 'pending'
                    check (processing_status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  processing_error  text,
  captured_by       text not null,
  captured_at       text not null,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  version           integer not null default 1 check (version > 0),
  client_created_at text not null,
  client_updated_at text not null
);

create index if not exists idx_capture_sources_hash on capture_sources (image_hash) where image_hash is not null;
create index if not exists idx_capture_sources_status on capture_sources (processing_status);
create index if not exists idx_capture_sources_captured_by on capture_sources (captured_by);
create index if not exists idx_capture_sources_active on capture_sources (id) where deleted_at is null;
create index if not exists idx_capture_sources_updated_at on capture_sources (updated_at);

-- ============================================================================
-- extraction_results
-- ============================================================================
-- DECISION: extracted_data is stored as TEXT (serialized JSON) on SQLite,
-- matching the JSONB approach used in the cloud schema. See the cloud
-- migration for the full justification of JSONB over separate rows.
create table if not exists extraction_results (
  id                    text primary key,
  capture_source_id     text not null references capture_sources (id) on delete cascade,
  extracted_data        text not null,
  -- overall_confidence stored as INTEGER basis points (0–10000, where 10000 = 1.0)
  overall_confidence_bp integer not null check (overall_confidence_bp between 0 and 10000),
  total_matches         integer not null check (total_matches in (0, 1)),
  raw_text              text,
  extracted_at          text not null,
  created_at            text not null,
  updated_at            text not null,
  deleted_at            text,
  version               integer not null default 1 check (version > 0),
  client_created_at     text not null,
  client_updated_at     text not null
);

create index if not exists idx_extraction_results_capture on extraction_results (capture_source_id);
create index if not exists idx_extraction_results_active on extraction_results (id) where deleted_at is null;
create index if not exists idx_extraction_results_updated_at on extraction_results (updated_at);

-- ============================================================================
-- payment_evidence
-- ============================================================================
create table if not exists payment_evidence (
  id                    text primary key,
  capture_source_id     text not null references capture_sources (id) on delete cascade,
  source_type           text not null check (source_type in ('upi_screenshot', 'card_screenshot', 'bank_screenshot')),
  amount_minor          integer check (amount_minor is null or amount_minor >= 0),
  currency_code         text check (currency_code is null or currency_code glob '[A-Z][A-Z][A-Z]'),
  merchant_or_payee     text,
  transaction_reference text,
  payment_date          text,
  payment_status        text not null default 'unknown'
                        check (payment_status in ('success', 'pending', 'failed', 'unknown')),
  -- confidence stored as INTEGER basis points (0–10000, where 10000 = 1.0)
  confidence_bp         integer not null check (confidence_bp between 0 and 10000),
  image_uri             text,
  created_at            text not null,
  updated_at            text not null,
  deleted_at            text,
  version               integer not null default 1 check (version > 0),
  client_created_at     text not null,
  client_updated_at     text not null
);

create index if not exists idx_payment_evidence_capture on payment_evidence (capture_source_id);
create index if not exists idx_payment_evidence_active on payment_evidence (id) where deleted_at is null;
create index if not exists idx_payment_evidence_updated_at on payment_evidence (updated_at);

-- ============================================================================
-- receipt_privacy_preferences
-- ============================================================================
-- Separated from the receipts table so privacy preferences can be changed
-- without touching the receipt record itself.
create table if not exists receipt_privacy_preferences (
  id                  text primary key,
  receipt_id          text not null references receipts (id) on delete cascade,
  storage_mode        text not null default 'local_only'
                      check (storage_mode in ('local_only', 'cloud_private', 'shared_with_group', 'delete_after_extraction')),
  retain_raw_text     integer not null default 0,
  retain_source_image integer not null default 1,
  retention_days      integer check (retention_days is null or retention_days > 0),
  created_at          text not null,
  updated_at          text not null,
  version             integer not null default 1 check (version > 0),
  client_created_at   text not null,
  client_updated_at   text not null
);

create unique index if not exists uq_receipt_privacy_receipt on receipt_privacy_preferences (receipt_id);

-- ============================================================================
-- duplicate_candidates
-- ============================================================================
create table if not exists duplicate_candidates (
  id                  text primary key,
  group_id            text references groups (id) on delete cascade,
  new_entity_id       text not null,
  existing_entity_id  text not null,
  match_basis         text not null check (match_basis in (
    'transaction_reference', 'image_hash', 'amount_and_merchant',
    'ocr_fingerprint', 'manual'
  )),
  -- match_confidence stored as INTEGER basis points (0–10000, where 10000 = 1.0)
  match_confidence_bp integer not null check (match_confidence_bp between 0 and 10000),
  match_details       text not null default '{}',
  resolution          text not null default 'pending'
                      check (resolution in ('pending', 'confirmed_duplicate', 'not_duplicate', 'merged')),
  resolved_at         text,
  resolved_by         text,
  created_at          text not null,
  updated_at          text not null,
  version             integer not null default 1 check (version > 0),
  client_created_at   text not null,
  client_updated_at   text not null
);

create index if not exists idx_duplicate_candidates_group on duplicate_candidates (group_id);
create index if not exists idx_duplicate_candidates_new on duplicate_candidates (new_entity_id);
create index if not exists idx_duplicate_candidates_existing on duplicate_candidates (existing_entity_id);
create index if not exists idx_duplicate_candidates_unresolved on duplicate_candidates (group_id) where resolution = 'pending';

-- ============================================================================
-- field_corrections
-- ============================================================================
-- Tracks user corrections to extracted fields. Used to improve OCR accuracy
-- over time (Phase 2 analytics) and to audit what the user changed.
create table if not exists field_corrections (
  id                    text primary key,
  extraction_result_id  text not null references extraction_results (id) on delete cascade,
  field_name            text not null,
  original_value        text,
  corrected_value       text,
  corrected_by          text not null,
  corrected_at          text not null,
  created_at            text not null,
  version               integer not null default 1 check (version > 0),
  client_created_at     text not null,
  client_updated_at     text not null
);

create index if not exists idx_field_corrections_extraction on field_corrections (extraction_result_id);
create index if not exists idx_field_corrections_field on field_corrections (field_name);
`;

/**
 * Migration 0002 — Phase 6 Track 1: Settlement state machine.
 *
 * Adds the settlement status, receiver-confirmation, dispute, and
 * idempotency columns to the settlements table. Creates three new
 * tables: settlement_state_history, settlement_reminders,
 * member_payment_handles.
 *
 * ADDITIVE ONLY — no existing column is renamed or removed. All new
 * columns are NULLABLE so existing rows hydrate cleanly. A NULL
 * `status` is treated as `'completed'` by the domain layer (see
 * `isSettlementCompleted` in `settlement.ts`).
 *
 * SQLite limitations:
 *   - SQLite does not support `ALTER TABLE DROP CONSTRAINT` — the
 *     existing `check (method in (...))` constraint cannot be
 *     modified in place. The migration leaves the existing check
 *     as-is; new methods (`card`, `wallet`) are validated by the
 *     application layer (the `SettlementMethod` type) and by the
 *     Supabase schema. A future migration may rebuild the settlements
 *     table to extend the check; for now, we accept the divergence
 *     because SQLite is the local on-device cache (Supabase is the
 *     authoritative cloud store).
 *   - SQLite does not support adding columns with a non-constant
 *     default when the column has a CHECK constraint. We add columns
 *     nullable, then backfill `status = 'completed'` separately.
 */
export const MIGRATION_0002_PHASE6_TRACK1 = `
-- ============================================================================
-- Add new columns to settlements (additive, nullable)
-- ============================================================================
alter table settlements add column status text
  check (status is null or status in (
    'draft', 'requested', 'pending_confirmation', 'completed',
    'failed', 'cancelled', 'disputed', 'reversed'
  ));

alter table settlements add column confirmed_by_member_id text
  references group_members (id) on delete set null;

alter table settlements add column confirmed_at text;

alter table settlements add column payment_reference_hash text
  check (payment_reference_hash is null or length(payment_reference_hash) = 64);

alter table settlements add column operation_id text;

alter table settlements add column evidence_hash text
  check (evidence_hash is null or length(evidence_hash) = 64);

alter table settlements add column dispute_reason text
  check (dispute_reason is null or dispute_reason in (
    'not_received', 'wrong_amount', 'wrong_currency',
    'wrong_sender', 'duplicate', 'failed', 'reversed', 'other'
  ));

alter table settlements add column dispute_note text
  check (dispute_note is null or length(dispute_note) <= 2000);

-- Backfill existing rows so the balance engine continues to count
-- them as completed (preserves the pre-Phase-6 behaviour).
update settlements set status = 'completed' where status is null;

-- ============================================================================
-- Indexes on the new columns
-- ============================================================================
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

create unique index if not exists uq_settlements_operation_id
  on settlements (operation_id)
  where operation_id is not null;

create unique index if not exists uq_settlements_payment_ref
  on settlements (group_id, payment_reference_hash)
  where payment_reference_hash is not null;

-- ============================================================================
-- New table: settlement_state_history
-- ============================================================================
create table if not exists settlement_state_history (
  id                text primary key,
  settlement_id     text not null references settlements (id) on delete cascade,
  from_status       text not null check (from_status in (
    'draft', 'requested', 'pending_confirmation', 'completed',
    'failed', 'cancelled', 'disputed', 'reversed'
  )),
  to_status         text not null check (to_status in (
    'draft', 'requested', 'pending_confirmation', 'completed',
    'failed', 'cancelled', 'disputed', 'reversed'
  )),
  actor_id          text,
  actor_member_id   text,
  note              text check (note is null or length(note) <= 1000),
  new_version       integer not null check (new_version > 0),
  created_at        text not null default (datetime('now'))
);

create index if not exists idx_settlement_state_history_settlement
  on settlement_state_history (settlement_id, created_at);

-- ============================================================================
-- New table: settlement_reminders (Prompt 59)
-- ============================================================================
create table if not exists settlement_reminders (
  id                text primary key,
  group_id          text not null references groups (id) on delete cascade,
  settlement_id     text references settlements (id) on delete cascade,
  payer_member_id   text references group_members (id) on delete cascade,
  receiver_member_id text references group_members (id) on delete cascade,
  currency_code     text not null check (currency_code glob '[A-Z][A-Z][A-Z]'),
  amount_minor      integer check (amount_minor is null or amount_minor > 0),
  reminder_type     text not null check (reminder_type in (
    'one_time', 'scheduled', 'settlement_request',
    'pending_confirmation', 'dispute_follow_up', 'group_summary'
  )),
  scheduled_at      text not null,
  status            text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'cancelled', 'failed', 'no_longer_needed')),
  privacy_mode      text not null default 'private'
    check (privacy_mode in ('private', 'detailed', 'in_app_only', 'disabled')),
  created_by        text not null,
  created_at        text not null default (datetime('now')),
  updated_at        text not null default (datetime('now')),
  sent_at           text,
  cancelled_at      text,
  auto_cancel_reason text
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
-- New table: member_payment_handles (Prompt 56 — UPI)
-- ============================================================================
create table if not exists member_payment_handles (
  id                text primary key,
  member_id         text not null references group_members (id) on delete cascade,
  type              text not null check (type in ('upi_vpa', 'bank_account', 'wallet')),
  masked_display_value text not null
    check (length(masked_display_value) between 3 and 64),
  encrypted_value   text,
  encryption_key_id text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'user_confirmed', 'verified')),
  is_default        integer not null default 0 check (is_default in (0, 1)),
  label             text check (label is null or length(label) <= 64),
  created_at        text not null default (datetime('now')),
  updated_at        text not null default (datetime('now')),
  deleted_at        text,
  check (encrypted_value is null or length(encrypted_value) > 0)
);

create unique index if not exists uq_payment_handle_default
  on member_payment_handles (member_id, type)
  where is_default = 1 and deleted_at is null;

create index if not exists idx_payment_handles_member
  on member_payment_handles (member_id)
  where deleted_at is null;

create index if not exists idx_payment_handles_member_type
  on member_payment_handles (member_id, type)
  where deleted_at is null;
`;

/**
 * Migration 0003 — Post-remediation write-side support.
 *
 * Two ADDITIVE changes that back the write-side repository adapters:
 *
 *   1. `audit_logs.group_id` — the CLOUD schema (see
 *      `supabase/migrations/202607291200_initial_schema.sql` §14) has always
 *      had a nullable `group_id` column on `audit_logs`, but the local
 *      mirror table did not. `AuditRepository.listByGroup()` needs it to
 *      filter by SQL. Adding the column aligns local with cloud — no
 *      existing column is renamed or removed; the new column is NULLABLE
 *      so existing rows hydrate cleanly.
 *
 *   2. `monitoring_metrics` — the on-device cache of privacy-safe metric
 *      samples (Prompt 81). Metric samples are REDACTED before they ever
 *      reach this table (see `metrics-redactor.ts` — the repository adapter
 *      re-redacts defensively even though the use case already did). The
 *      unique index on `(metric, recorded_at)` enforces the
 *      `MetricRepository.record()` idempotency contract: recording the
 *      same sample twice must not duplicate the row. Values are REAL
 *      (ratios / latency milliseconds) — they are operational aggregates,
 *      never financial amounts, so the integer-only money rule is not
 *      affected.
 */
export const MIGRATION_0003_WRITE_SIDE_SUPPORT = `
-- ============================================================================
-- audit_logs: add the group_id column (mirror of the cloud schema)
-- ============================================================================
alter table audit_logs add column group_id text;

create index if not exists idx_audit_logs_group
  on audit_logs (group_id)
  where group_id is not null;

-- ============================================================================
-- monitoring_metrics: local cache of redacted metric samples (Prompt 81)
-- ============================================================================
create table if not exists monitoring_metrics (
  id           text primary key,
  metric       text not null check (metric in (
    'crash_free_session_rate', 'sync_success_rate', 'ocr_accuracy_rate',
    'settlement_completion_rate', 'export_success_rate',
    'backup_success_rate', 'restore_success_rate',
    'api_latency_p95_ms', 'database_query_latency_p95_ms'
  )),
  value        real not null,
  payload      text,
  recorded_at  text not null
);

create unique index if not exists uq_monitoring_metrics_sample
  on monitoring_metrics (metric, recorded_at);

create index if not exists idx_monitoring_metrics_metric
  on monitoring_metrics (metric, recorded_at);
`;

/**
 * Migration 0004 — User feedback local store (Prompt 82).
 *
 * Two ADDITIVE tables backing `SqliteFeedbackRepository`:
 *
 *   1. `feedback_records` — the on-device store of PII-REDACTED feedback.
 *      The use case redacts the body BEFORE construction and the adapter
 *      re-redacts defensively (same double-redaction contract as
 *      `monitoring_metrics`), so raw PII (emails, UPI IDs, file paths,
 *      exact amounts, raw OCR text) never reaches this table. The
 *      `feedbackUserIdFromNpsId` convention (`{userId}-nps-{timestamp}`,
 *      see `SubmitNpsSurveyUseCase`) is what links NPS rows to a user —
 *      the Feedback entity itself deliberately carries NO user
 *      identifier (privacy by design), so NPS lookups use an exact
 *      id-prefix match (substr, not LIKE — no wildcard semantics).
 *
 *      `ocr_correction` is a JSON blob of AGGREGATE bucketed counts only
 *      (field names + counts, never values) — mirrors the domain's
 *      `OcrCorrectionMeta`. The column is nullable and degrades to
 *      "no correction meta" when the JSON is corrupted.
 *
 *   2. `review_prompt_ledger` — the App Store review-prompt cooldown
 *      ledger (`ReviewPromptLedger` port). One row per user: the last
 *      time the review prompt was shown. The 180-day cooldown check
 *      itself is a pure domain function (`shouldPromptForReview`) —
 *      the table only records timestamps, no eligibility data.
 */
export const MIGRATION_0004_FEEDBACK_STORE = `
-- ============================================================================
-- feedback_records: local store of PII-redacted feedback (Prompt 82)
-- ============================================================================
create table if not exists feedback_records (
  id             text primary key,
  type           text not null check (type in (
    'general', 'feature_request', 'bug_report',
    'ocr_correction', 'nps', 'app_store_review'
  )),
  body           text not null,
  nps_score      integer check (nps_score is null or (nps_score >= 0 and nps_score <= 10)),
  nps_category   text check (nps_category is null or nps_category in (
    'detractor', 'passive', 'promoter'
  )),
  ocr_correction text,
  app_version    text not null,
  platform       text not null check (platform in ('ios', 'android', 'web')),
  submitted_at   text not null,
  contact_opt_in integer not null default 0
);

create index if not exists idx_feedback_records_submitted
  on feedback_records (submitted_at);

create index if not exists idx_feedback_records_type
  on feedback_records (type, submitted_at);

-- ============================================================================
-- review_prompt_ledger: App Store review prompt cooldowns (Prompt 82)
-- ============================================================================
create table if not exists review_prompt_ledger (
  user_id          text primary key,
  last_prompted_at text not null
);
`;

/**
 * Migration runner.
 *
 * Tracks applied migrations in the `schema_version` table. Each migration
 * has an integer version and a name. Migrations are applied in order.
 *
 * Migrations are forward-only — there is no down-migration. To roll back,
 * write a new migration that reverses the change.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const MIGRATION_0005_IDENTITY_SUPPORT = `
-- ============================================================================
-- Migration 0005: identity_support (v2.4.0)
-- Local guest identities (durable pre-cloud identity, previously only an
-- in-memory/test concept) and account-deletion requests. Both are
-- LOCAL-ONLY by design: no SyncEntityType exists for them. The cloud
-- counterparts (guest_identity_links, account_deletion_requests) live in
-- the Supabase migrations.
-- ============================================================================

create table if not exists guest_identities (
  id                 text primary key,
  display_name       text not null check (length(display_name) between 1 and 60),
  device_secret_hash text not null,
  upgrade_status     text not null default 'local_only'
                     check (upgrade_status in ('local_only', 'upgrade_pending', 'upgrade_in_progress', 'upgraded', 'upgrade_failed')),
  linked_user_id     text,
  created_at         text not null,
  updated_at         text not null,
  deleted_at         text,
  version            integer not null default 1 check (version > 0)
);

create index if not exists idx_guest_identities_linked on guest_identities (linked_user_id) where linked_user_id is not null;
create index if not exists idx_guest_identities_active on guest_identities (id) where deleted_at is null;

create table if not exists account_deletion_requests (
  id                   text primary key,
  user_id              text not null,
  status               text not null check (status in ('scheduled', 'cancelled', 'executed')),
  requested_at         text not null,
  recovery_deadline_at text not null,
  created_at           text not null,
  updated_at           text not null,
  deleted_at           text,
  version              integer not null default 1 check (version > 0)
);

create index if not exists idx_account_deletion_user on account_deletion_requests (user_id);
create index if not exists idx_account_deletion_active on account_deletion_requests (user_id) where deleted_at is null and status = 'scheduled';
`;

const MIGRATION_0006_SYNC_QUEUE_ALIGNMENT = `
-- ============================================================================
-- Migration 0006: sync_queue_alignment (v2.5.0)
-- The sync_operations CHECK constraints only allowed 5 statuses, 9 entity
-- types and 3 operations, but the domain union (and the repository's own
-- markPermanentlyFailed / cancelOperation) write 'permanently_failed' /
-- 'cancelled'. On a real device those writes threw (CHECK violation) and
-- crashed the sync loop — the in-memory test double silently ignored
-- constraints, which is why tests never caught it. Also adds the missing
-- updated_at column that markPermanentlyFailed/cancelOperation wrote.
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt.
-- ============================================================================
create table sync_operations_v2 (
  id                  text primary key,
  entity_type         text not null check (entity_type in (
    'group', 'group_member', 'group_invite', 'expense',
    'expense_payer', 'expense_split', 'receipt', 'receipt_item', 'settlement',
    'settlement_state_history', 'settlement_reminder', 'payment_handle',
    'preference'
  )),
  entity_id           text not null,
  operation           text not null check (operation in (
    'create', 'update', 'delete', 'restore',
    'upload', 'link', 'confirm', 'reverse'
  )),
  payload             text not null,
  idempotency_key     text not null,
  base_version        integer not null,
  local_version       integer not null,
  status              text not null default 'pending'
                      check (status in (
                        'pending', 'queued', 'syncing', 'processing',
                        'failed', 'retry_wait', 'blocked', 'conflict',
                        'completed', 'permanently_failed', 'cancelled'
                      )),
  retry_count         integer not null default 0,
  last_error_code     text,
  last_error_message  text,
  created_at          text not null,
  last_attempted_at   text,
  next_retry_at       text,
  updated_at          text
);

insert into sync_operations_v2 (
  id, entity_type, entity_id, operation, payload, idempotency_key,
  base_version, local_version, status, retry_count, last_error_code,
  last_error_message, created_at, last_attempted_at, next_retry_at, updated_at
)
select
  id, entity_type, entity_id, operation, payload, idempotency_key,
  base_version, local_version, status, retry_count, last_error_code,
  last_error_message, created_at, last_attempted_at, next_retry_at,
  coalesce(last_attempted_at, created_at)
from sync_operations;

drop table sync_operations;
alter table sync_operations_v2 rename to sync_operations;

create index if not exists idx_sync_ops_status on sync_operations (status);
create index if not exists idx_sync_ops_created_at on sync_operations (created_at);
create index if not exists idx_sync_ops_next_retry on sync_operations (next_retry_at) where status = 'failed';
create index if not exists idx_sync_ops_entity on sync_operations (entity_type, entity_id);
create unique index if not exists uq_sync_ops_idempotency on sync_operations (idempotency_key) where status in ('pending', 'syncing');
`;

/**
 * Migration 0007 — sync_cursors (v2.6.0, bidirectional sync).
 *
 * The incremental CLOUD→DEVICE download needs a durable checkpoint per
 * synced entity collection. Without it, every pull would re-download
 * the entire history (wasteful) or, worse, the download position would
 * live only in memory and be lost on every app restart (making the
 * "download" phase effectively never converge).
 *
 * One row per entity collection (groups, group_members, group_invites,
 * expenses, settlements). The `cursor_value` is an opaque string owned
 * by the IncrementalDownloadPort implementation — for Supabase it is
 * the `(updated_at, id)` watermark tuple of the last APPLIED remote row
 * (e.g. `2026-10-12T09:15:30.123+00:00|0e1f…`). It is intentionally NOT
 * parsed by this schema — the format can evolve without a migration.
 *
 * Deleting a row = full re-download of that collection (replay-safe:
 * applying a remote row is version-guarded and idempotent).
 */
export const MIGRATION_0007_SYNC_CURSORS = `
create table if not exists sync_cursors (
  entity_type         text primary key,
  cursor_value        text not null,
  cursor_updated_at   text not null
);

-- ============================================================================
-- sync_conflicts category alignment (v2.6.0)
-- ============================================================================
-- v2.5.0 CRITICAL FIX (completes the migration-0006 repair): the
-- coordinator writes conflict categories derived from sync error codes
-- — 'permission_changed', 'parent_deleted_remotely',
-- 'identity_link_conflict', 'privacy_policy_conflict' — which the
-- migration-0001 CHECK constraint on sync_conflicts.category REJECTS.
-- On a real device every such conflict record threw (CHECK violation)
-- and crashed the sync loop mid-run — the in-memory test double ignores
-- CHECK constraints, which is why tests never caught it. SQLite cannot
-- alter a CHECK constraint, so the table is rebuilt (same pattern as
-- migration 0006). Also extends the union with 'remote_change_conflict'
-- for conflicts detected by the CLOUD→DEVICE download path.
-- ============================================================================
create table sync_conflicts_v2 (
  id                text primary key,
  profile_id        text,
  entity_type       text not null,
  entity_id         text not null,
  category          text not null check (category in (
    'version_conflict', 'deleted_remotely', 'deleted_locally',
    'membership_conflict', 'financial_record_conflict',
    'duplicate_creation', 'permission_conflict',
    'permission_changed', 'parent_deleted_remotely',
    'identity_link_conflict', 'privacy_policy_conflict',
    'remote_change_conflict'
  )),
  local_version     integer not null,
  cloud_version     integer not null,
  local_payload     text,
  cloud_payload     text,
  resolution        text check (resolution is null or resolution in (
    'local_wins', 'cloud_wins', 'merged', 'user_review', 'pending'
  )),
  resolved_at       text,
  resolved_by       text,
  created_at        text not null,
  updated_at        text not null
);

insert into sync_conflicts_v2 (
  id, profile_id, entity_type, entity_id, category, local_version,
  cloud_version, local_payload, cloud_payload, resolution, resolved_at,
  resolved_by, created_at, updated_at
)
select
  id, profile_id, entity_type, entity_id, category, local_version,
  cloud_version, local_payload, cloud_payload, resolution, resolved_at,
  resolved_by, created_at, updated_at
from sync_conflicts;

drop table sync_conflicts;
alter table sync_conflicts_v2 rename to sync_conflicts;

create index if not exists idx_sync_conflicts_unresolved on sync_conflicts (id) where resolution is null or resolution = 'pending';
create index if not exists idx_sync_conflicts_entity on sync_conflicts (entity_type, entity_id);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial_schema', sql: MIGRATION_0001_INITIAL_SCHEMA },
  { version: 2, name: 'phase6_track1_settlement_state_machine', sql: MIGRATION_0002_PHASE6_TRACK1 },
  { version: 3, name: 'write_side_support', sql: MIGRATION_0003_WRITE_SIDE_SUPPORT },
  { version: 4, name: 'feedback_store', sql: MIGRATION_0004_FEEDBACK_STORE },
  { version: 5, name: 'identity_support', sql: MIGRATION_0005_IDENTITY_SUPPORT },
  { version: 6, name: 'sync_queue_alignment', sql: MIGRATION_0006_SYNC_QUEUE_ALIGNMENT },
  { version: 7, name: 'sync_cursors', sql: MIGRATION_0007_SYNC_CURSORS },
];

/**
 * Apply all pending migrations to the database.
 *
 * Idempotent: if all migrations are already applied, this is a no-op.
 */
export async function runMigrations(db: DatabaseConnection): Promise<void> {
  // Ensure the schema_version table exists.
  await db.exec(SCHEMA_VERSION_TABLE_SQL);

  // Find the highest applied version.
  const row = await db.get<{ max_version: number }>(
    'select coalesce(max(version), 0) as max_version from schema_version',
  );
  const currentVersion = row?.max_version ?? 0;

  // Apply pending migrations in order.
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    await db.transaction(async (tx) => {
      // Apply the migration SQL. Statements are split with a
      // comment/string-aware splitter — a semicolon inside a `--`
      // comment must not terminate a statement.
      const statements = splitSqlStatements(migration.sql);
      for (const stmt of statements) {
        await tx.exec(stmt);
      }
      // Record the migration.
      await tx.run(
        'insert into schema_version (version, name) values (?, ?)',
        [migration.version, migration.name],
      );
    });
  }
}

/**
 * Get the current schema version (highest applied migration).
 * Returns 0 if no migrations have been applied.
 */
export async function getSchemaVersion(db: DatabaseConnection): Promise<number> {
  const row = await db.get<{ max_version: number }>(
    'select coalesce(max(version), 0) as max_version from schema_version',
  );
  return row?.max_version ?? 0;
}
