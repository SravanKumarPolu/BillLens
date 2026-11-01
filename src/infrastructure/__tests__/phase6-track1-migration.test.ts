import { beforeEach, describe, expect, it } from '@jest/globals';

import { getSchemaVersion, runMigrations } from '../sqlite/schema';

import { InMemoryDatabase } from './in-memory-database';

/**
 * Phase 6 Track 1 migration test — verifies the migration applies
 * cleanly and creates the expected new tables and columns.
 *
 * The in-memory database has limited SQL support (no joins, no
 * aggregates other than count(*)), so this test focuses on schema
 * introspection: the schema_version row count, the list of tables
 * created, and the columns on the settlements table after migration.
 *
 * Full SQL behaviour (CHECK constraints, partial indexes, foreign
 * keys) is validated by the Supabase migration test in
 * `supabase test db` (run separately on a real Postgres instance).
 */
describe('Phase 6 Track 1 migration (SQLite)', () => {
  let db: InMemoryDatabase;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
  });

  it('bumps the schema version through all applied migrations (now 4)', async () => {
    // v1 = initial schema, v2 = Phase 6 Track 1, v3 = write-side support,
    // v4 = feedback store.
    expect(await getSchemaVersion(db)).toBe(11);
  });

  it('creates the settlement_state_history table', () => {
    expect(db.hasTable('settlement_state_history')).toBe(true);
  });

  it('migration 0003 adds audit_logs.group_id and monitoring_metrics', () => {
    expect(db.hasTable('monitoring_metrics')).toBe(true);
    expect(db.listColumns('audit_logs').includes('group_id')).toBe(true);
  });

  it('creates the settlement_reminders table', () => {
    expect(db.hasTable('settlement_reminders')).toBe(true);
  });

  it('creates the member_payment_handles table', () => {
    expect(db.hasTable('member_payment_handles')).toBe(true);
  });

  it('adds the status column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('status');
  });

  it('adds the confirmed_by_member_id column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('confirmed_by_member_id');
  });

  it('adds the confirmed_at column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('confirmed_at');
  });

  it('adds the payment_reference_hash column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('payment_reference_hash');
  });

  it('adds the operation_id column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('operation_id');
  });

  it('adds the evidence_hash column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('evidence_hash');
  });

  it('adds the dispute_reason column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('dispute_reason');
  });

  it('adds the dispute_note column to settlements', () => {
    const columns = db.listColumns('settlements');
    expect(columns).toContain('dispute_note');
  });

  it('preserves all pre-existing settlements columns', () => {
    const columns = db.listColumns('settlements');
    // Original columns from migration 0001 must all still be present
    for (const c of [
      'id', 'group_id', 'from_member_id', 'to_member_id',
      'amount_minor', 'currency_code', 'method', 'settlement_date',
      'note', 'reverses_settlement_id', 'reversal_of_settlement_id',
      'created_by', 'created_at', 'updated_at', 'deleted_at',
      'version', 'last_modified_by', 'client_created_at', 'client_updated_at',
    ]) {
      expect(columns).toContain(c);
    }
  });

  it('is idempotent — running migrations twice does not throw', async () => {
    // Re-run migrations on the already-migrated database.
    await expect(runMigrations(db)).resolves.not.toThrow();
    expect(await getSchemaVersion(db)).toBe(11);
  });
});
