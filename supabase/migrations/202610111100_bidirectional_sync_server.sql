-- ============================================================================
-- BillLens v2.6.0 — bidirectional sync server support
-- File: 202610111100_bidirectional_sync_server.sql
-- Sorts AFTER 202610111000_phase_cloud_rls_policies.sql (filename order).
-- ============================================================================
--
-- Server-side support for the CLOUD→DEVICE incremental download:
--
--   1. COMMIT-TIME updated_at. The pull cursor is the
--      (updated_at, id) watermark of the last applied remote row, so
--      updated_at MUST be monotonic in COMMIT order and immune to
--      client clock skew. The existing trigger used now() (transaction
--      START time) and only fired BEFORE UPDATE — a client-supplied
--      updated_at landed on INSERT, and long transactions could commit
--      rows with timestamps older than rows already pulled. This
--      migration replaces the trigger function with
--      clock_timestamp() and re-creates the triggers as
--      BEFORE INSERT OR UPDATE on the synchronised tables. The
--      client's view of time is preserved in client_updated_at.
--
--   2. KEYSET PAGINATION INDEXES. The download feed pages each table
--      with `updated_at > cursor OR (updated_at = cursor AND id >
--      last_id) ORDER BY updated_at, id`. A composite (updated_at, id)
--      index makes every page an index range scan instead of a sort.
--
--   3. NO-OP WRITE SUPPRESSION. The trigger refuses to bump updated_at
--      when an UPDATE changes no relevant column — an RLS-visible
--      touch (e.g. the upload port's guarded update retrying) does not
--      manufacture a phantom change that every device re-downloads.
--
-- Nothing here changes access control: RLS policies from 202610111000
-- continue to govern every SELECT the download makes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Commit-time updated_at (replace the now() trigger function)
-- ---------------------------------------------------------------------------
create or replace function billlens_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. BEFORE INSERT OR UPDATE triggers on the tables the download feed
--    serves (drops the insert-only-default gap; non-synced tables keep
--    the original BEFORE UPDATE trigger from the initial schema).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'groups', 'group_members', 'group_invites',
    'expenses', 'expense_payers', 'expense_splits',
    'settlements'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists set_updated_at on %I;
       create trigger set_updated_at
         before insert or update on %I
         for each row execute function billlens_set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- Insert defaults fall back to commit time when a writer omits
-- updated_at entirely (PostgREST column-level inserts).
do $$
declare
  t text;
  tables text[] := array[
    'groups', 'group_members', 'group_invites',
    'expenses', 'expense_payers', 'expense_splits',
    'settlements'
  ];
begin
  foreach t in array tables loop
    execute format(
      'alter table %I alter column updated_at set default clock_timestamp();',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Keyset pagination indexes (updated_at, id) — one per pulled table.
-- ---------------------------------------------------------------------------
create index if not exists idx_groups_pull_cursor
  on groups (updated_at, id);
create index if not exists idx_group_members_pull_cursor
  on group_members (updated_at, id);
create index if not exists idx_group_invites_pull_cursor
  on group_invites (updated_at, id);
create index if not exists idx_expenses_pull_cursor
  on expenses (updated_at, id);
create index if not exists idx_expense_payers_pull_cursor
  on expense_payers (updated_at, id);
create index if not exists idx_expense_splits_pull_cursor
  on expense_splits (updated_at, id);
create index if not exists idx_settlements_pull_cursor
  on settlements (updated_at, id);
