-- ============================================================================
-- Migration: 202610111000_phase_cloud_rls_policies
-- BillLens v2.4.0 — Production Row Level Security (Prompt: Phase 2).
--
-- WHAT THIS FIXES (v2.3.0 state):
--   1. The initial schema ENABLED RLS on all 21 tables with ZERO policies
--      → deny-all for every role including authenticated users: nothing
--      worked for real users.
--   2. The only policies that existed (phase-6 migration) referenced a
--      non-existent `group_members.profile_id` column — the schema
--      column is `user_id`. `create policy` would FAIL on a fresh
--      database (RISK-SEC-02: "policies statically asserted; never
--      executed").
--
-- POLICY MODEL (least privilege, group-scoped):
--   - `profiles`: a user reads/updates ONLY their own row. Inserts are
--     allowed for one's own id (client-generated). Deletion is
--     service-role only (account deletion runs server-side).
--   - Every group-scoped table (groups, group_members, group_invites,
--     expenses, expense_payers, expense_splits, receipts, receipt_items,
--     settlements, settlement_state_history, settlement_reminders,
--     member_payment_handles, duplicate_candidates, field_corrections):
--     access requires ACTIVE membership of the owning group via
--     `group_members.user_id = auth.uid()` and `left_at is null`.
--   - Inserts additionally require membership of the target group
--     (WITH CHECK) — a member cannot write into groups they left.
--   - `created_by` columns are NOT the authority; group membership is.
--     (A group member must be able to read expenses other members
--     created; a former member must not.)
--   - Audit logs: append-only via a SECURITY DEFINER function
--     (`billlens_append_audit_log`) — clients cannot read or rewrite
--     the audit trail; only the service role reads it.
--   - Capture-layer tables (expense_drafts, capture_sources,
--     extraction_results, payment_evidence, receipt_privacy_preferences):
--     LOCAL-ONLY in v2.4.0 — RLS stays enabled with NO client policies
--     (deny-all). The mobile app never syncs these rows; when the cloud
--     capture pipeline lands, scoped policies arrive with it.
--   - device_installations / sync_conflicts: own-row policies
--     (`user_id = auth.uid()`).
--
-- VERIFY after applying (live probes, see docs/release/):
--   Each table must report rls_enabled = true and, for client tables,
--   a non-empty policy list:
--     select tablename, rowsecurity from pg_tables
--      where schemaname = 'public' order by tablename;
--     select tablename, policyname from pg_policies
--      where schemaname = 'public' order by tablename, policyname;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Correct the broken phase-6 policies (they referenced profile_id).
--    Drop first, recreate below against group_members.user_id.
-- ---------------------------------------------------------------------------
drop policy if exists settlement_state_history_readable_by_group_members
  on settlement_state_history;
drop policy if exists reminders_select_own on settlement_reminders;
drop policy if exists reminders_insert_own on settlement_reminders;
drop policy if exists reminders_update_own on settlement_reminders;
drop policy if exists reminders_delete_own on settlement_reminders;
drop policy if exists payment_handles_select_own on member_payment_handles;
drop policy if exists payment_handles_insert_own on member_payment_handles;
drop policy if exists payment_handles_update_own on member_payment_handles;
drop policy if exists payment_handles_delete_own on member_payment_handles;

-- ---------------------------------------------------------------------------
-- 1. profiles — own row only.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_insert_own on profiles;
drop policy if exists profiles_update_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. groups — membership-scoped. The creator is implicitly the owner
--    member (CreateGroupUseCase writes both rows in one sync batch).
--    Owners-only mutation is enforced by app logic + server functions
--    (rename/archive require the owner role — a member-side check would
--    need a role lookup that RLS alone cannot express safely on UPDATE).
--    Note: group CREATION has no membership row yet, so insert allows
--    any authenticated user with created_by = auth.uid(); the insert +
--    owner-member insert arrive atomically from the client.
-- ---------------------------------------------------------------------------
drop policy if exists groups_select_member on groups;
drop policy if exists groups_insert_own on groups;
drop policy if exists groups_update_member on groups;
drop policy if exists groups_delete_member on groups;
create policy groups_select_member on groups
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy groups_insert_own on groups
  for insert with check (created_by = auth.uid());
create policy groups_update_member on groups
  for update using (
    -- v2.5.0 FIX: previously ANY active member could rename/archive/
    -- soft-delete the group via a direct REST call (owner check existed
    -- only on DELETE). Renaming is owner-gated like every other
    -- mutation; the app's member-facing flows never rename groups.
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy groups_delete_member on groups
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 3. group_members — members see the roster of their groups; a user may
--    insert/update rows only for THEMSELVES and only where the group has
--    an ACTIVE (unrevoked, unexpired) invite — v2.5.0 FIX: the previous
--    self-insert branch had no invite predicate, so any authenticated
--    user could insert themselves into ANY group whose id they knew.
--    NOTE: RLS cannot see request payloads, so token-BINDING (joining
--    with the specific token value) must go through a SECURITY DEFINER
--    RPC; this policy is the RLS-level guard rail (no active invite →
--    no self-join). Owner-added members are unaffected.
--    Leaving (setting left_at on your own row) is allowed; removing
--    others is owner/service-role only.
-- ---------------------------------------------------------------------------
drop policy if exists group_members_select_peer on group_members;
drop policy if exists group_members_insert_self on group_members;
drop policy if exists group_members_update_self on group_members;
drop policy if exists group_members_delete_owner on group_members;
create policy group_members_select_peer on group_members
  for select using (
    exists (
      select 1 from group_members me
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and me.left_at is null
        and me.deleted_at is null
    )
  );
create policy group_members_insert_self on group_members
  for insert with check (
    -- Owner adds a member to their own group…
    exists (
      select 1 from group_members me
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
        and me.left_at is null
        and me.deleted_at is null
    )
    -- …or the user joins THEMSELVES while the group has an active invite.
    or (
      user_id = auth.uid()
      and exists (
        select 1 from group_invites i
        where i.group_id = group_members.group_id
          and i.status = 'pending'
          and i.revoked_at is null
          and i.deleted_at is null
          and i.expires_at > now()
          and i.use_count < i.max_uses
      )
    )
  );
create policy group_members_update_self on group_members
  for update using (
    user_id = auth.uid()
    or exists (
      select 1 from group_members me
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
        and me.left_at is null
        and me.deleted_at is null
    )
  )
  -- v2.5.0 FIX: the WITH CHECK pins what a self-update may produce —
  -- previously an own-row UPDATE could REWRITE group_id (joining an
  -- arbitrary group) or self-promote to admin. Now a member can only
  -- keep their own row a plain 'member' row; elevation is owner-only
  -- (covered by the owner branch of the same check). Tradeoff: an
  -- 'admin' cannot set left_at themselves (an owner or service role
  -- removes them) — acceptable for the release candidate.
  with check (
    (user_id = auth.uid() and role = 'member')
    or exists (
      select 1 from group_members me
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
        and me.left_at is null
        and me.deleted_at is null
    )
  );
create policy group_members_delete_owner on group_members
  for delete using (
    exists (
      select 1 from group_members me
      where me.group_id = group_members.group_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
        and me.left_at is null
        and me.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. group_invites — members of the group read invites (tokens are
--    server-validated at redemption); only the group's owner creates or
--    revokes invites.
-- ---------------------------------------------------------------------------
drop policy if exists group_invites_select_member on group_invites;
drop policy if exists group_invites_insert_owner on group_invites;
drop policy if exists group_invites_update_owner on group_invites;
drop policy if exists group_invites_delete_owner on group_invites;
create policy group_invites_select_member on group_invites
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy group_invites_insert_owner on group_invites
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy group_invites_update_owner on group_invites
  for update using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy group_invites_delete_owner on group_invites
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 5. expenses + expense_payers + expense_splits + receipts + receipt_items
--    — group membership for read AND write; deletes owner-only.
--    (Financial invariants like "splits sum to total" are enforced by
--    the server-side sync functions / future DB triggers — RLS decides
--    WHO, never HOW MUCH.)
-- ---------------------------------------------------------------------------
drop policy if exists expenses_select_member on expenses;
drop policy if exists expenses_insert_member on expenses;
drop policy if exists expenses_update_member on expenses;
drop policy if exists expenses_delete_member on expenses;
create policy expenses_select_member on expenses
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = expenses.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expenses_insert_member on expenses
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = expenses.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expenses_update_member on expenses
  for update using (
    exists (
      select 1 from group_members gm
      where gm.group_id = expenses.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expenses_delete_member on expenses
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.group_id = expenses.group_id
        and gm.user_id = auth.uid()
        and (gm.role = 'owner' or expenses.created_by = auth.uid())
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

drop policy if exists expense_payers_select_member on expense_payers;
drop policy if exists expense_payers_insert_member on expense_payers;
drop policy if exists expense_payers_update_member on expense_payers;
drop policy if exists expense_payers_delete_member on expense_payers;
create policy expense_payers_select_member on expense_payers
  for select using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_payers.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_payers_insert_member on expense_payers
  for insert with check (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_payers.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_payers_update_member on expense_payers
  for update using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_payers.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_payers_delete_member on expense_payers
  for delete using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_payers.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

drop policy if exists expense_splits_select_member on expense_splits;
drop policy if exists expense_splits_insert_member on expense_splits;
drop policy if exists expense_splits_update_member on expense_splits;
drop policy if exists expense_splits_delete_member on expense_splits;
create policy expense_splits_select_member on expense_splits
  for select using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_splits.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_splits_insert_member on expense_splits
  for insert with check (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_splits.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_splits_update_member on expense_splits
  for update using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_splits.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy expense_splits_delete_member on expense_splits
  for delete using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_splits.expense_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

drop policy if exists receipts_select_member on receipts;
drop policy if exists receipts_insert_member on receipts;
drop policy if exists receipts_update_member on receipts;
create policy receipts_select_member on receipts
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = receipts.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy receipts_insert_member on receipts
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = receipts.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy receipts_update_member on receipts
  for update using (
    exists (
      select 1 from group_members gm
      where gm.group_id = receipts.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

drop policy if exists receipt_items_select_member on receipt_items;
drop policy if exists receipt_items_insert_member on receipt_items;
drop policy if exists receipt_items_update_member on receipt_items;
create policy receipt_items_select_member on receipt_items
  for select using (
    exists (
      select 1 from receipts r
      join group_members gm on gm.group_id = r.group_id
      where r.id = receipt_items.receipt_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy receipt_items_insert_member on receipt_items
  for insert with check (
    exists (
      select 1 from receipts r
      join group_members gm on gm.group_id = r.group_id
      where r.id = receipt_items.receipt_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy receipt_items_update_member on receipt_items
  for update using (
    exists (
      select 1 from receipts r
      join group_members gm on gm.group_id = r.group_id
      where r.id = receipt_items.receipt_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 6. settlements + settlement_state_history + settlement_reminders +
--    member_payment_handles — group membership (recreating the corrected
--    phase-6 policies against group_members.user_id).
-- ---------------------------------------------------------------------------
drop policy if exists settlements_select_member on settlements;
drop policy if exists settlements_insert_member on settlements;
drop policy if exists settlements_update_member on settlements;
drop policy if exists settlements_delete_member on settlements;
create policy settlements_select_member on settlements
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy settlements_insert_member on settlements
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy settlements_update_member on settlements
  for update using (
    exists (
      select 1 from group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy settlements_delete_member on settlements
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- Corrected phase-6 policy (was: gm.profile_id — column does not exist).
alter table settlement_state_history enable row level security;
alter table settlement_state_history force row level security;
drop policy if exists settlement_state_history_readable_by_group_members
  on settlement_state_history;
create policy settlement_state_history_readable_by_group_members
  on settlement_state_history
  for select using (
    exists (
      select 1 from settlements s
      join group_members gm on gm.group_id = s.group_id
      where s.id = settlement_state_history.settlement_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

drop policy if exists reminders_select_own on settlement_reminders;
drop policy if exists reminders_insert_own on settlement_reminders;
drop policy if exists reminders_update_own on settlement_reminders;
drop policy if exists reminders_delete_own on settlement_reminders;
create policy reminders_select_own on settlement_reminders
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from group_members gm
      where gm.group_id = settlement_reminders.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy reminders_insert_own on settlement_reminders
  for insert with check (created_by = auth.uid());
create policy reminders_update_own on settlement_reminders
  for update using (created_by = auth.uid());
create policy reminders_delete_own on settlement_reminders
  for delete using (created_by = auth.uid());

drop policy if exists payment_handles_select_own on member_payment_handles;
drop policy if exists payment_handles_insert_own on member_payment_handles;
drop policy if exists payment_handles_update_own on member_payment_handles;
drop policy if exists payment_handles_delete_own on member_payment_handles;
create policy payment_handles_select_own on member_payment_handles
  for select using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy payment_handles_insert_own on member_payment_handles
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy payment_handles_update_own on member_payment_handles
  for update using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );
create policy payment_handles_delete_own on member_payment_handles
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.id = member_payment_handles.member_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 7. duplicate_candidates + field_corrections — group-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists duplicate_candidates_select_member on duplicate_candidates;
create policy duplicate_candidates_select_member on duplicate_candidates
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = duplicate_candidates.group_id
        and gm.user_id = auth.uid()
        and gm.left_at is null
        and gm.deleted_at is null
    )
  );

-- field_corrections keys off extraction_result_id (capture layer) —
-- the only group-free linkage is corrected_by, so policies scope to it.
drop policy if exists field_corrections_select_own on field_corrections;
drop policy if exists field_corrections_insert_own on field_corrections;
create policy field_corrections_select_own on field_corrections
  for select using (corrected_by = auth.uid());
create policy field_corrections_insert_own on field_corrections
  for insert with check (corrected_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. guest_identity_links — the upgrade flow writes links for the
--    CURRENT user only.
-- ---------------------------------------------------------------------------
drop policy if exists guest_links_select_own on guest_identity_links;
drop policy if exists guest_links_insert_own on guest_identity_links;
create policy guest_links_select_own on guest_identity_links
  for select using (profile_id = auth.uid());
create policy guest_links_insert_own on guest_identity_links
  for insert with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. device_installations + sync_conflicts — own rows.
-- ---------------------------------------------------------------------------
drop policy if exists device_installations_own on device_installations;
create policy device_installations_own on device_installations
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists sync_conflicts_own on sync_conflicts;
create policy sync_conflicts_own on sync_conflicts
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. audit_logs — NO client policies (append via SECURITY DEFINER
--     function; reads are service-role only). RLS stays enabled.
--     Capture-layer tables (expense_drafts, capture_sources,
--     extraction_results, payment_evidence, receipt_privacy_preferences)
--     remain RLS-enabled with NO client policies: local-only in v2.4.0.
-- ---------------------------------------------------------------------------

-- Append-only audit writer callable by authenticated clients.
create or replace function billlens_append_audit_log(
  p_entity_type text,
  p_entity_id text,
  p_action audit_action,
  p_change_summary jsonb default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_logs (
    id, entity_type, entity_id, action, change_summary,
    actor_id, created_at, updated_at, client_created_at, client_updated_at
  ) values (
    gen_random_uuid(),
    p_entity_type,
    p_entity_id,
    p_action,
    p_change_summary,
    auth.uid(),
    now(), now(), now(), now()
  );
$$;

-- v2.5.0 FIX: the REVOKE referenced a signature (uuid) that never
-- existed — the only overload is (text, text, audit_action, jsonb).
-- On PostgreSQL the mismatched REVOKE errors and the WHOLE migration
-- aborts (taking every policy below with it).
revoke all on function billlens_append_audit_log(text, text, audit_action, jsonb) from public;
grant execute on function billlens_append_audit_log(text, text, audit_action, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 11. profiles auto-provisioning: a profile row must exist for every
--     auth.users row (RLS policies key off profiles via group_members).
--     Trigger keeps them in sync server-side.
-- ---------------------------------------------------------------------------
create or replace function billlens_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, email, client_created_at, client_updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.email, 'unknown@billlens.invalid'),
    now(), now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function billlens_handle_new_user();

-- ---------------------------------------------------------------------------
-- 12. account_deletion_requests — the cloud side of the deletion flow
--     (local half landed in the SQLite v5 migration). Client may create
--     and cancel its OWN request; only the service-role purge job
--     executes/completes it.
-- ---------------------------------------------------------------------------
create table if not exists account_deletion_requests (
  id                    uuid primary key,
  user_id               uuid not null references profiles (id) on delete cascade,
  status                text not null check (status in ('scheduled', 'cancelled', 'executed'))
                        default 'scheduled',
  requested_at          timestamptz not null default now(),
  recovery_deadline_at  timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  version               integer not null default 1 check (version > 0),
  client_created_at     timestamptz not null default now(),
  client_updated_at     timestamptz not null default now()
);

create index if not exists idx_account_deletion_user on account_deletion_requests (user_id);
create index if not exists idx_account_deletion_purge_due
  on account_deletion_requests (recovery_deadline_at)
  where status = 'scheduled';

alter table account_deletion_requests enable row level security;

drop policy if exists account_deletion_select_own on account_deletion_requests;
drop policy if exists account_deletion_insert_own on account_deletion_requests;
drop policy if exists account_deletion_update_own on account_deletion_requests;
create policy account_deletion_select_own on account_deletion_requests
  for select using (user_id = auth.uid());
create policy account_deletion_insert_own on account_deletion_requests
  for insert with check (user_id = auth.uid());
create policy account_deletion_update_own on account_deletion_requests
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- 14. v2.5.0 additions — release-candidate security hardening
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 14.1 Receipt-image storage bucket + policies.
--
--      The app is local-first for receipt images today (receipts.storage_mode
--      defaults to 'local_only' and the mobile client has no .upload() call
--      yet), but the moment cloud storage is enabled these policies apply:
--        - bucket is PRIVATE (no public read),
--        - objects are namespaced by the owning user ("<uid>/<...>"),
--        - SELECT/INSERT require the object path to start with auth.uid(),
--        - UPDATE/DELETE follow the same owner rule (soft-delete friendly).
--      Service role bypasses RLS for server-side maintenance.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_select_own on storage.objects;
drop policy if exists receipts_insert_own on storage.objects;
drop policy if exists receipts_update_own on storage.objects;
drop policy if exists receipts_delete_own on storage.objects;

create policy receipts_select_own on storage.objects
  for select using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy receipts_insert_own on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy receipts_update_own on storage.objects
  for update using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy receipts_delete_own on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 14.2 Account-deletion cloud purge.
--
--      v2.4.0 wrote deletion requests to LOCAL SQLite only — they never
--      reached the cloud, so remote data was never purged. The request
--      itself can now be uploaded (account_deletion_requests RLS allows
--      own-row INSERT); this SECURITY DEFINER RPC performs the actual
--      purge once the recovery window lapses, and a scheduled job calls
--      it (see supabase/migrations + docs/deployment.md):
--
--        select cron.schedule(
--          'billlens-account-purge', '0 3 * * *',
--          $$select billlens_purge_expired_accounts()$$
--        );
--
--      (pg_cron is available on Supabase projects; if the extension is
--      not enabled, run the RPC from an external scheduler.)
-- ---------------------------------------------------------------------------
create or replace function billlens_purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged_count integer := 0;
  target_user uuid;
begin
  for target_user in
    select user_id from account_deletion_requests
    where status = 'scheduled'
      and deleted_at is null
      and recovery_deadline_at <= now()
    for update skip locked
  loop
    -- Group data: the owner's groups (cascade removes members, invites,
    -- expenses, splits, payers, settlements, receipts metadata).
    delete from groups where created_by = target_user;
    -- Memberships in OTHER people's groups.
    delete from group_members where user_id = target_user;
    -- Personal rows.
    delete from member_payment_handles where member_id in (
      select id from group_members where user_id = target_user
    );
    delete from settlement_reminders where created_by = target_user;
    delete from guest_identity_links where profile_id = target_user;
    delete from device_installations where profile_id = target_user;
    delete from sync_conflicts where profile_id = target_user;
    delete from profiles where id = target_user;
    -- Receipt objects in storage (owner-namespaced prefix).
    delete from storage.objects where bucket_id = 'receipts' and (storage.foldername(name))[1] = target_user::text;

    update account_deletion_requests
      set status = 'executed', updated_at = now()
      where user_id = target_user and status = 'scheduled';

    purged_count := purged_count + 1;
  end loop;
  return purged_count;
end;
$$;

revoke all on function billlens_purge_expired_accounts() from public;
revoke all on function billlens_purge_expired_accounts() from authenticated;
-- Service role (and the pg_cron runner) only.
