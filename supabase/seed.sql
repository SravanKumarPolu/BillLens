-- ============================================================================
-- BillLens — Development Seed Data
-- ============================================================================
-- WARNING: This file is for DEVELOPMENT ONLY. It must NEVER be run against
-- a production database. The presence of this file is gated by the
-- `EXPO_PUBLIC_APP_ENV=development` check in the seed runner script.
--
-- All seeded users, groups, and expenses use deterministic UUIDs so that
-- tests can reference them by ID. All emails use the @billlens.example domain
-- so they cannot accidentally deliver to real users.
-- ============================================================================

begin;

-- Clean up any prior seed data (idempotent re-runs).
delete from audit_logs;
delete from sync_conflicts;
delete from device_installations;
delete from receipt_items;
delete from expense_splits;
delete from expense_payers;
delete from expenses;
delete from settlements;
delete from group_invites;
delete from group_members;
delete from receipts;
delete from groups;
delete from guest_identity_links;
delete from profiles;

-- ----------------------------------------------------------------------------
-- Users
-- ----------------------------------------------------------------------------
insert into profiles (id, display_name, email, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-0000-0000-0000-000000000001', 'Alice (Dev)',     'alice@billlens.example',     now(), now(), 1, now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'Bob (Dev)',       'bob@billlens.example',       now(), now(), 1, now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'Charlie (Dev)',   'charlie@billlens.example',   now(), now(), 1, now(), now());

-- ----------------------------------------------------------------------------
-- Group
-- ----------------------------------------------------------------------------
insert into groups (id, name, description, currency_code, created_by, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-1000-0000-0000-000000000001',
   'Dev Goa Trip',
   'Development-only seed group — do not appear in production',
   'INR',
   '00000000-0000-0000-0000-000000000001',
   now(), now(), 1, now(), now());

-- ----------------------------------------------------------------------------
-- Group members
-- ----------------------------------------------------------------------------
insert into group_members (id, group_id, user_id, display_name, role, joined_at, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-2000-0000-0000-000000000001', '00000000-1000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Alice',     'owner',  now(), now(), now(), 1, now(), now()),
  ('00000000-2000-0000-0000-000000000002', '00000000-1000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Bob',       'member', now(), now(), now(), 1, now(), now()),
  ('00000000-2000-0000-0000-000000000003', '00000000-1000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Charlie',   'member', now(), now(), now(), 1, now(), now());

-- ----------------------------------------------------------------------------
-- Expense: A pays ₹1200, A/B/C split 300/400/500
-- ----------------------------------------------------------------------------
-- This is the example from the spec. Used to verify balance calculations.
insert into expenses (id, group_id, title, amount_minor, currency_code, expense_date, split_type, created_by, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-3000-0000-0000-000000000001',
   '00000000-1000-0000-0000-000000000001',
   'Dinner at Paradise (seed)',
   1200,
   'INR',
   now(),
   'equal',
   '00000000-0000-0000-0000-000000000001',
   now(), now(), 1, now(), now());

insert into expense_payers (id, expense_id, member_id, amount_minor, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-4000-0000-0000-000000000001',
   '00000000-3000-0000-0000-000000000001',
   '00000000-2000-0000-0000-000000000001', -- Alice paid
   1200,
   now(), now(), 1, now(), now());

insert into expense_splits (id, expense_id, member_id, amount_minor, created_at, updated_at, version, client_created_at, client_updated_at) values
  ('00000000-5000-0000-0000-000000000001', '00000000-3000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001', 300, now(), now(), 1, now(), now()),
  ('00000000-5000-0000-0000-000000000002', '00000000-3000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000002', 400, now(), now(), 1, now(), now()),
  ('00000000-5000-0000-0000-000000000003', '00000000-3000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000003', 500, now(), now(), 1, now(), now());

-- Expected balances after this seed:
--   Alice:   paid 1200 - share 300 = +900 (creditor)
--   Bob:     paid 0    - share 400 = -400 (debtor)
--   Charlie: paid 0    - share 500 = -500 (debtor)
-- Suggested transfers: Bob → Alice 400, Charlie → Alice 500.

commit;

-- ============================================================================
-- End of seed data
-- ============================================================================
