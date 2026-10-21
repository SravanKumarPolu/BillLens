# SQLite migrations

## The failure that blocked startup

```
NativeDatabase.execAsync rejected — near "tracks": syntax error
```

**Exact cause.** `runMigrations` split each migration string on every `;`.
`MIGRATION_0001_INITIAL_SCHEMA` contains this comment:

```sql
-- guest_identity_links (local-only; tracks guest → cloud upgrade)
```

The split cut the comment at its semicolon. The first fragment was an
unterminated comment; the second began `tracks guest …` and was executed as
SQL, which SQLite rejected at the `tracks` token.

**Statement corrected.** The splitter, not the comment:
`migration.sql.split(';')` → `splitSqlStatements(migration.sql)` in
`src/infrastructure/sqlite/schema.ts`.

`splitSqlStatements` (`src/infrastructure/sqlite/sql-statements.ts`) tracks
line comments, block comments and single-quoted strings (including `''`
escapes), drops comment text and only splits on a semicolon outside them.

A second, earlier defect is also guarded: PostgreSQL's `char_length()` had
been copied into seven SQLite `CHECK` constraints. SQLite has no such
function, so the first launch failed at prepare time. It is now `length()`.

## Why the test suite missed both

- `InMemoryDatabase` records statements; it never asks SQLite to parse them.
- `scripts/validate-sql.js` checks the *Postgres* migrations' structure.
- `npm run db:verify` piped whole blocks into `sqlite3`, so a bad statement
  split was invisible.

## Guards

| Guard | What it does |
|---|---|
| `sql-statements.test.ts` | 7 cases: comments, block comments, strings, escaped quotes, comment-only input |
| `sqlite-schema-portability.test.ts` | rejects PostgreSQL-only constructs in every registered migration |
| `sqlite-migrations-execution.test.ts` | runs the real `runMigrations` on a real SQLite file; asserts 40 tables, version 9, idempotent second boot |
| `npm run db:verify` | extracts the schema blocks and executes them in `sqlite3` (10 blocks, 40 tables); fails on the original errors |

Both migration guards reproduce the device error when the old code is
restored (`near "tracks": syntax error`, `unknown function: char_length`).

## Migration 0008 — encrypted sync state

Adds: `sync_processed_events` (durable apply/ack markers, including
`conflict`), `sync_event_conflicts`, `sync_device_memberships`,
`sync_key_epochs`, `sync_event_cursors`. No key material is stored.

## Rules for new migrations

1. Never copy a Postgres `CHECK` into `schema.ts` without changing functions
   (`char_length` → `length`, `now()` → `datetime('now')`).
2. Semicolons inside comments are allowed now, but avoid them anyway.
3. Add the migration to `MIGRATIONS`; both guards pick it up automatically.
4. Migrations are additive and run inside a transaction; a failure rolls back.
5. Test with `npm run db:verify` and the Jest execution suite before merging.

User data is never reset: the failed migration rolled back, so retrying after
the fix re-applies from the current `schema_version`.
