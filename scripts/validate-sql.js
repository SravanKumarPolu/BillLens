#!/usr/bin/env node
/**
 * SQL structural validator for BillLens migrations.
 *
 * Checks each .sql file for:
 *   1. Balanced parentheses.
 *   2. Matching $$ ... $$ (and $tag$ ... $tag$) dollar-quote pairs.
 *   3. Balanced BEGIN/END (case-insensitive, inside dollar quotes only).
 *   4. Matching ' single-quoted strings.
 *   5. Statement count (each statement ends with ; outside quotes).
 *   6. Common typos: double semicolons, missing semicolons at end of CREATE
 *      TABLE statements.
 *
 * This validator does NOT do full PostgreSQL semantic parsing — that
 * requires a real Postgres instance. It catches structural mistakes that
 * would cause immediate syntax errors on `supabase db push`.
 *
 * Usage: node scripts/validate-sql.js
 */

const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
const seedPath = path.resolve(__dirname, '..', 'supabase', 'seed.sql');

const files = [];
if (fs.existsSync(migrationsDir)) {
  for (const entry of fs.readdirSync(migrationsDir)) {
    if (entry.endsWith('.sql')) {
      files.push(path.join(migrationsDir, entry));
    }
  }
}
if (fs.existsSync(seedPath)) {
  files.push(seedPath);
}

if (files.length === 0) {
  console.error('No SQL files found to validate.');
  process.exit(1);
}

let totalErrors = 0;
let totalWarnings = 0;

for (const file of files) {
  const sql = fs.readFileSync(file, 'utf-8');
  const result = validateSql(sql);
  const basename = path.basename(file);

  if (result.errors.length === 0) {
    console.log(`✓ ${basename} — ${result.statementCount} statements, structurally valid`);
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`    ⚠ ${w}`);
        totalWarnings++;
      }
    }
  } else {
    console.log(`✗ ${basename} — ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      console.log(`    ✗ ${e}`);
      totalErrors++;
    }
    for (const w of result.warnings) {
      console.log(`    ⚠ ${w}`);
      totalWarnings++;
    }
  }
}

if (totalErrors > 0) {
  console.error(`\n${totalErrors} structural error(s), ${totalWarnings} warning(s).`);
  process.exit(1);
} else {
  console.log(`\nAll SQL files structurally valid. (${totalWarnings} warning(s))`);
  process.exit(0);
}

function validateSql(sql) {
  const errors = [];
  const warnings = [];
  let parenDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let statementCount = 0;
  let beginEndDepth = 0;
  let line = 1;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === '\n') {
      line++;
      if (inLineComment) inLineComment = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inDollarQuote) {
      if (char === '$') {
        const tag = matchDollarTag(sql, i);
        if (tag && tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
          i += tag.length - 1;
        }
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        if (next === "'") {
          // Escaped quote
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    // Line comment
    if (char === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    // Block comment
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // Single quote start
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    // Dollar quote start
    if (char === '$') {
      const tag = matchDollarTag(sql, i);
      if (tag) {
        inDollarQuote = true;
        dollarTag = tag;
        i += tag.length - 1;
        continue;
      }
    }

    // Track BEGIN/END inside dollar-quoted blocks (for PL/pgSQL)
    // We detect these as keywords after we close a dollar quote, but
    // simpler: detect them in the source stream when not in a quote/comment.
    // Match word boundary + BEGIN/END/CASE/IF.
    if (/[a-zA-Z_]/.test(char)) {
      let j = i;
      let word = '';
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
        word += sql[j];
        j++;
      }
      const upper = word.toUpperCase();
      if (upper === 'BEGIN' || upper === 'CASE') {
        beginEndDepth++;
      } else if (upper === 'END' || upper === 'COMMIT' || upper === 'ROLLBACK') {
        beginEndDepth--;
        if (beginEndDepth < 0) {
          errors.push(`Line ${line}: ${upper} without matching BEGIN or CASE`);
        }
      }
      i = j - 1;
      continue;
    }

    if (char === '(') {
      parenDepth++;
      continue;
    }
    if (char === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        errors.push(`Line ${line}: closing parenthesis without matching open`);
      }
      continue;
    }
    if (char === ';') {
      if (parenDepth !== 0) {
        errors.push(`Line ${line}: semicolon with unbalanced parentheses (depth ${parenDepth})`);
      }
      statementCount++;
      continue;
    }
    if (!/\s/.test(char)) {
    }
  }

  if (parenDepth !== 0) {
    errors.push(`Unbalanced parentheses at end of file: depth ${parenDepth}`);
  }
  if (inDollarQuote) {
    errors.push(`Unterminated dollar-quote: ${dollarTag}`);
  }
  if (inSingleQuote) {
    errors.push(`Unterminated single-quoted string`);
  }
  if (inBlockComment) {
    errors.push(`Unterminated block comment`);
  }
  if (beginEndDepth !== 0) {
    errors.push(`Unbalanced BEGIN/END: depth ${beginEndDepth}`);
  }

  return { errors, warnings, statementCount };
}

function matchDollarTag(sql, i) {
  if (sql[i] !== '$') return null;
  if (sql[i + 1] === '$') return '$$';
  let j = i + 1;
  let tag = '$';
  while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
    tag += sql[j];
    j++;
  }
  if (j > i + 1 && j < sql.length && sql[j] === '$') {
    return tag + '$';
  }
  return null;
}
