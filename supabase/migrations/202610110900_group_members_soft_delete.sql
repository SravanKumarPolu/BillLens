-- ============================================================================
-- BillLens v2.6.0 — group_members soft-delete column
-- File: 202610110900_group_members_soft_delete.sql
-- Sorts BEFORE 202610111000_phase_cloud_rls_policies.sql (filename order).
-- ============================================================================
--
-- CRITICAL FRESH-DEPLOY FIX (v2.6.0):
--
-- The RLS policy migration (202610111000) references
-- `group_members.deleted_at` in roughly 45 policies
-- (`gm.deleted_at is null` / `me.deleted_at is null`), but NO prior
-- migration ever added that column to the table. On a clean project
-- `supabase db push` FAILED at 202610111000 with
-- "column gm.deleted_at does not exist" — the entire documented RLS
-- posture was unprovisionable. (The v2.5.0 pass fixed the same class of
-- defect for `gm.profile_id` and the REVOKE signature but missed this
-- reference because the probe SQL only checked the policies it touched.)
--
-- Fix: add the nullable column BEFORE the policy migration runs, and
-- backfill members who already left (left_at) so membership revocations
-- surface as tombstones to the incremental download (the cloud→device
-- pull maps `deleted_at` on group_members to the local `left_at`).
--
-- Idempotent: safe on fresh projects, on projects stuck before the RLS
-- migration, and on (hypothetical) projects that somehow applied the
-- RLS migration already.
-- ============================================================================

alter table group_members add column if not exists deleted_at timestamptz;

-- Members who already left are soft-deleted as of the moment they left.
update group_members
set deleted_at = left_at
where deleted_at is null
  and left_at is not null;

create index if not exists idx_group_members_deleted_at
  on group_members (deleted_at)
  where deleted_at is not null;
