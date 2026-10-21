/**
 * SQLite portability guard for the local schema.
 *
 * The local schema is executed by `expo-sqlite`, which is plain SQLite.
 * The cloud schema is PostgreSQL. It is easy to copy a `check`
 * constraint from a Postgres migration into the local schema and have it
 * pass every test, because the in-memory test double only records
 * statements — it never asks SQLite to parse them. On a device the same
 * statement fails at prepare time and the app cannot open its database.
 *
 * This guard statically rejects PostgreSQL-only syntax in
 * `schema.ts` so that class of defect fails in CI instead of on a user's
 * first launch.
 */

import { describe, expect, it } from '@jest/globals';

import { MIGRATIONS, SCHEMA_VERSION_TABLE_SQL } from '@infrastructure/sqlite/schema';

/** Every statement that reaches SQLite on install or upgrade. */
const SCHEMA_SQL: readonly { readonly name: string; readonly sql: string }[] = [
  { name: 'SCHEMA_VERSION_TABLE_SQL', sql: SCHEMA_VERSION_TABLE_SQL },
  ...MIGRATIONS.map((migration) => ({
    name: `MIGRATION_${migration.version}_${migration.name}`,
    sql: migration.sql,
  })),
];

/**
 * Constructs that exist in PostgreSQL but NOT in SQLite.
 * `char_length` is the one that actually shipped: it was copied from
 * `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql`.
 */
const POSTGRES_ONLY: readonly { readonly pattern: RegExp; readonly use: string }[] = [
  { pattern: /\bchar_length\s*\(/i, use: 'length(' },
  { pattern: /\bnow\s*\(\s*\)/i, use: "datetime('now')" },
  { pattern: /\btimestamptz\b/i, use: 'text ISO-8601 timestamps' },
  { pattern: /\bserial\b/i, use: 'integer primary key' },
  { pattern: /\bilike\b/i, use: 'like (SQLite LIKE is case-insensitive for ASCII)' },
  { pattern: /::\s*\w+/i, use: 'cast(...) or implicit typing' },
  { pattern: /\binterval\b/i, use: "datetime(..., '+N days')" },
];

describe('SQLite schema portability', () => {
  it('has a non-empty body for every registered migration', () => {
    expect(SCHEMA_SQL.length).toBe(MIGRATIONS.length + 1);
    for (const entry of SCHEMA_SQL) {
      expect(entry.sql.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(SCHEMA_SQL)('$name uses only SQLite syntax', ({ sql }) => {
    for (const { pattern, use } of POSTGRES_ONLY) {
      const match = pattern.exec(sql);
      if (match !== null) {
        throw new Error(
          `PostgreSQL-only construct ${JSON.stringify(match[0])} found in a SQLite schema. Use ${use} instead.`,
        );
      }
    }
  });

  it('keeps length() checks on the settlement hashes', () => {
    // The specific regression this guard exists for: hash-length checks
    // must use SQLite's length(), not PostgreSQL's char_length().
    const settlementMigration = MIGRATIONS.find((migration) => migration.version === 2);
    expect(settlementMigration).toBeDefined();
    const sql = settlementMigration?.sql ?? '';
    expect(sql).toContain('length(payment_reference_hash) = 64');
    expect(sql).toContain('length(evidence_hash) = 64');
  });
});
