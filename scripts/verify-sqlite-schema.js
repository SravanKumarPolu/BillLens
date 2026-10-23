#!/usr/bin/env node
/**
 * Verify that the local SQLite schema actually executes.
 *
 * `scripts/validate-sql.js` checks the *structure* of the Supabase
 * (PostgreSQL) migrations. This script checks the *local* schema against
 * a real SQLite engine, because the in-memory test double never asks
 * SQLite to parse a statement — which is how `char_length()` (a
 * PostgreSQL function) once reached a device and broke the first launch.
 *
 * Usage: node scripts/verify-sqlite-schema.js
 *
 * Engine preference: Node's built-in `node:sqlite` (`DatabaseSync`,
 * real SQLite bundled with Node >= 22.5), falling back to the `sqlite3`
 * CLI binary. Skips with a warning only when NEITHER engine is available
 * so the check stays optional for contributors on very old Node versions.
 */

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Load `node:sqlite` when the runtime provides it; null otherwise. */
function loadNodeSqlite() {
  try {
    return require('node:sqlite');
  } catch {
    return null;
  }
}

const nodeSqlite = loadNodeSqlite();

const SCHEMA_PATH = join(__dirname, '..', 'src', 'infrastructure', 'sqlite', 'schema.ts');

/** Extract `const NAME = \`...\`;` blocks from the schema module. */
function extractSqlBlocks(source) {
  const pattern = /(?:export\s+)?const\s+(SCHEMA_VERSION_TABLE_SQL|MIGRATION_\d{4}_[A-Z0-9_]+)\s*=\s*`([\s\S]*?)`;/g;
  const blocks = new Map();
  for (const match of source.matchAll(pattern)) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

function main() {
  const source = readFileSync(SCHEMA_PATH, 'utf8');
  const blocks = extractSqlBlocks(source);
  if (blocks.size === 0) {
    console.error('No schema SQL blocks found — has schema.ts been restructured?');
    process.exit(1);
  }

  // Deterministic order: version table first, then migrations by number.
  const names = [...blocks.keys()].sort((a, b) => {
    if (a === 'SCHEMA_VERSION_TABLE_SQL') return -1;
    if (b === 'SCHEMA_VERSION_TABLE_SQL') return 1;
    return a.localeCompare(b);
  });

  const sql = names
    .map((name) => `-- ${name}\n${blocks.get(name)}`)
    .join('\n');

  let tables;
  try {
    if (nodeSqlite) {
      const db = new nodeSqlite.DatabaseSync(':memory:');
      try {
        db.exec(sql);
        const row = db
          .prepare("select count(*) as count from sqlite_master where type = 'table'")
          .get();
        tables = String(row.count);
      } finally {
        db.close();
      }
    } else {
      execFileSync('sqlite3', ['-bail', ':memory:'], { input: sql, stdio: 'pipe' });
      tables = execFileSync('sqlite3', [':memory:'], {
        input: `${sql}\nselect count(*) from sqlite_master where type = 'table';`,
        stdio: 'pipe',
      })
        .toString()
        .trim()
        .split('\n')
        .pop();
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(
        '⚠ neither node:sqlite nor the sqlite3 CLI is available — skipping SQLite execution check.',
      );
      return;
    }
    const stderr = error.stderr ? error.stderr.toString() : error.message || String(error);
    console.error('✖ Local schema does not execute in SQLite:');
    console.error(stderr.trim());
    process.exit(1);
  }

  console.log(
    `✓ SQLite schema executes cleanly — ${blocks.size} blocks, ${tables} tables created.`,
  );
}

main();
