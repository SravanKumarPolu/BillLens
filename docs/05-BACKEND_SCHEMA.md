> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# SQLite and optional relay schema

**Authoritative implementation:** `src/infrastructure/sqlite/schema.ts`, not the historical PostgreSQL-only `docs/database-schema.md`. The older document remains historical and is not the MVP source of truth.

## Migration registry

| Version | Name |
|---|---|
| 1 | `initial_schema` |
| 2 | `phase6_track1_settlement_state_machine` |
| 3 | `write_side_support` |
| 4 | `feedback_store` |
| 5 | `identity_support` |
| 6 | `sync_queue_alignment` |
| 7 | `sync_cursors` |
| 8 | `encrypted_sync` |
| 9 | `recurring_expenses` |
| 10 | `expense_line_items` |
| 11 | `group_management` |
| 12 | `file_cleanup_queue` |
| 13 | `outstanding_reminder_state` |

## SQLite table definitions extracted from source

The following definitions are extracted from `CREATE TABLE IF NOT EXISTS` statements in `schema.ts`; inspect ALTER TABLE statements in each migration for subsequent column additions. **These snippets are not a reconstructed database dump and do not imply all constraints/indexes are shown.**

### `schema_version`

```sql
CREATE TABLE IF NOT EXISTS schema_version (
version    integer primary key,
  name       text not null,
  applied_at text not null default (datetime('now'))
);
```

### `profiles`

```sql
CREATE TABLE IF NOT EXISTS profiles (
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
```

### `guest_identity_links`

```sql
CREATE TABLE IF NOT EXISTS guest_identity_links (
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
```

### `groups`

```sql
CREATE TABLE IF NOT EXISTS groups (
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
```

### `group_members`

```sql
CREATE TABLE IF NOT EXISTS group_members (
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
```

### `group_invites`

```sql
CREATE TABLE IF NOT EXISTS group_invites (
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
```

### `expenses`

```sql
CREATE TABLE IF NOT EXISTS expenses (
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
```

### `expense_payers`

```sql
CREATE TABLE IF NOT EXISTS expense_payers (
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
```

### `expense_splits`

```sql
CREATE TABLE IF NOT EXISTS expense_splits (
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
```

### `receipts`

```sql
CREATE TABLE IF NOT EXISTS receipts (
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
```

### `receipt_items`

```sql
CREATE TABLE IF NOT EXISTS receipt_items (
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
```

### `settlements`

```sql
CREATE TABLE IF NOT EXISTS settlements (
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
```

### `sync_operations`

```sql
CREATE TABLE IF NOT EXISTS sync_operations (
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
```

### `sync_conflicts`

```sql
CREATE TABLE IF NOT EXISTS sync_conflicts (
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
```

### `audit_logs`

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
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
```

### `sync_metadata`

```sql
CREATE TABLE IF NOT EXISTS sync_metadata (
entity_type         text not null,
  entity_id           text not null,
  cloud_version       integer not null default 0,
  last_synced_at      text,
  has_pending_changes integer not null default 1,
  idempotency_key     text,
  primary key (entity_type, entity_id)
);
```

### `device_installations`

```sql
CREATE TABLE IF NOT EXISTS device_installations (
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
```

### `expense_drafts`

```sql
CREATE TABLE IF NOT EXISTS expense_drafts (
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
```

### `capture_sources`

```sql
CREATE TABLE IF NOT EXISTS capture_sources (
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
```

### `extraction_results`

```sql
CREATE TABLE IF NOT EXISTS extraction_results (
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
```

### `payment_evidence`

```sql
CREATE TABLE IF NOT EXISTS payment_evidence (
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
```

### `receipt_privacy_preferences`

```sql
CREATE TABLE IF NOT EXISTS receipt_privacy_preferences (
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
```

### `duplicate_candidates`

```sql
CREATE TABLE IF NOT EXISTS duplicate_candidates (
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
```

### `field_corrections`

```sql
CREATE TABLE IF NOT EXISTS field_corrections (
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
```

### `settlement_state_history`

```sql
CREATE TABLE IF NOT EXISTS settlement_state_history (
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
```

### `settlement_reminders`

```sql
CREATE TABLE IF NOT EXISTS settlement_reminders (
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
```

### `member_payment_handles`

```sql
CREATE TABLE IF NOT EXISTS member_payment_handles (
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
```

### `monitoring_metrics`

```sql
CREATE TABLE IF NOT EXISTS monitoring_metrics (
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
```

### `feedback_records`

```sql
CREATE TABLE IF NOT EXISTS feedback_records (
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
```

### `review_prompt_ledger`

```sql
CREATE TABLE IF NOT EXISTS review_prompt_ledger (
user_id          text primary key,
  last_prompted_at text not null
);
```

### `sync_processed_events`

```sql
CREATE TABLE IF NOT EXISTS sync_processed_events (
event_id        text primary key,
  group_id        text not null,
  device_id       text not null,
  key_id          text not null,
  digest          text not null,
  status          text not null default 'applying'
                  check (status in ('applying', 'processed', 'failed', 'conflict')),
  received_at     text not null,
  processed_at    text,
  acknowledged_at text,
  error           text
);
```

### `sync_event_conflicts`

```sql
CREATE TABLE IF NOT EXISTS sync_event_conflicts (
id              text primary key,
  group_id        text not null,
  event_id        text not null,
  entity_type     text not null,
  entity_id       text not null,
  local_version   integer not null,
  remote_version  integer not null,
  local_payload   text not null,
  remote_payload  text not null,
  status          text not null default 'unresolved'
                  check (status in ('unresolved', 'keep_local', 'accept_remote')),
  created_at      text not null,
  resolved_at     text,
  unique (group_id, event_id, entity_id)
);
```

### `sync_device_memberships`

```sql
CREATE TABLE IF NOT EXISTS sync_device_memberships (
group_id              text not null,
  device_id             text not null,
  signing_public_key    text not null,
  encryption_public_key text not null,
  status                text not null default 'active'
                        check (status in ('active', 'removed')),
  added_at              text not null,
  removed_at            text,
  primary key (group_id, device_id)
);
```

### `sync_key_epochs`

```sql
CREATE TABLE IF NOT EXISTS sync_key_epochs (
group_id    text not null,
  key_id      text not null,
  created_at  text not null,
  retired_at  text,
  primary key (group_id, key_id)
);
```

### `sync_event_cursors`

```sql
CREATE TABLE IF NOT EXISTS sync_event_cursors (
group_id        text not null,
  device_id       text not null,
  last_created_at text,
  updated_at      text not null,
  primary key (group_id, device_id)
);
```

### `guest_identities`

```sql
CREATE TABLE IF NOT EXISTS guest_identities (
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
```

### `account_deletion_requests`

```sql
CREATE TABLE IF NOT EXISTS account_deletion_requests (
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
```

### `sync_cursors`

```sql
CREATE TABLE IF NOT EXISTS sync_cursors (
entity_type         text primary key,
  cursor_value        text not null,
  cursor_updated_at   text not null
);
```

### `recurring_expenses`

```sql
CREATE TABLE IF NOT EXISTS recurring_expenses (
id                       text primary key,
  group_id                 text not null references groups(id),
  title                    text not null,
  amount_minor             integer not null check (amount_minor > 0),
  currency_code            text not null,
  note                     text,
  payers_json              text not null,
  splits_json              text not null,
  frequency                text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count           integer not null default 1 check (interval_count >= 1),
  start_date               text not null,
  end_date                 text,
  next_occurrence_date     text not null,
  last_materialized_date   text,
  paused                   integer not null default 0 check (paused in (0, 1)),
  created_by               text not null,
  created_at               text not null,
  updated_at               text not null,
  deleted_at               text,
  version                  integer not null default 1,
  client_created_at        text not null,
  client_updated_at        text not null
);
```

### `recurring_occurrences`

```sql
CREATE TABLE IF NOT EXISTS recurring_occurrences (
recurring_id             text not null references recurring_expenses(id),
  occurrence_date          text not null,
  expense_id               text not null references expenses(id),
  created_at               text not null,
  primary key (recurring_id, occurrence_date)
);
```

### `file_cleanup_queue`

```sql
CREATE TABLE IF NOT EXISTS file_cleanup_queue (
id              text primary key,
  uri             text not null,
  reason          text not null,
  attempts        integer not null default 0 check (attempts >= 0),
  last_error      text,
  next_attempt_at text not null,
  created_at      text not null,
  updated_at      text not null,
  completed_at    text
);
```

### `outstanding_reminder_state`

```sql
CREATE TABLE IF NOT EXISTS outstanding_reminder_state (
id                  text primary key,
  status              text not null check (status in (
    'scheduled', 'none', 'denied', 'unsupported', 'disabled', 'error'
  )),
  delivery            text not null check (delivery in ('native', 'stored_only', 'none')),
  groups_with_balance integer not null default 0 check (groups_with_balance >= 0),
  evaluated_at        text not null,
  scheduled_at        text
);
```

## Indexes, transactions and integrity
Inspect `schema.ts` for exact `CREATE INDEX` and `ALTER TABLE` operations. `PRAGMA foreign_keys = ON` is required by the connection wrapper. All migrations are versioned in `schema_version`, transactional and parsed with `splitSqlStatements()` so semicolons inside comments/quoted strings do not create invalid statements. SQLite stores UUIDs as TEXT, monetary minor units as INTEGER, timestamps as ISO TEXT and JSON payloads as TEXT. Validate with `npm run db:verify` on an installed dependency tree.

## Identity, sync, retention and relay
Guest identity and device key records are local; cloud profiles/guest upgrade are optional. Sync queue, encrypted event apply/ack, cursors, conflicts, and tombstones require explicit idempotent processing. Reference relay metadata and ciphertext envelopes live in `src/infrastructure/relay-reference`, not in the local SQLite schema; 30-day reference TTL is transport-only. Retention: 365-day cleanup eligibility by default, **no automatic purge**. For cloud PostgreSQL historical schema see `supabase/migrations/` and `docs/database-schema.md`; do not treat it as required for local MVP.
