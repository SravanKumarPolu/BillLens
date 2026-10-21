/**
 * SQL statement splitter for the local SQLite migrations.
 *
 * Migrations are plain SQL strings applied statement by statement inside
 * a transaction. Splitting on `;` is wrong: a semicolon can appear inside
 * a line comment, a block comment, or a string literal. When that
 * happened in `MIGRATION_0001_INITIAL_SCHEMA` (a comment reading
 * "guest_identity_links (local-only; tracks guest → cloud upgrade)") the
 * comment was cut in half and the fragment `tracks guest …` was executed
 * as SQL, failing on device with `near "tracks": syntax error`.
 *
 * This splitter tracks comments and single-quoted strings (including the
 * `''` escape) and only treats a semicolon as a separator outside them.
 * Comment text is dropped from the returned statements (they are what
 * gets executed); a newline/space is kept in its place so tokens never
 * merge.
 *
 * Not handled: `BEGIN … END` trigger bodies (our migrations contain none)
 * and dollar-quoted strings (PostgreSQL-only). If a trigger is ever added
 * here, extend `splitSqlStatements` and add a test first.
 */

export function splitSqlStatements(sql: string): readonly string[] {
  const statements: string[] = [];
  let current = '';
  // True when the current statement has any character that is not
  // whitespace/comment — used to drop comment-only chunks.
  let hasContent = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;

  const flush = (): void => {
    if (hasContent) statements.push(current.trim());
    current = '';
    hasContent = false;
  };

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      // Keep the newline so removing a trailing comment cannot merge two
      // tokens; the comment text itself is dropped.
      if (char === '\n') {
        current += '\n';
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        i += 1;
        inBlockComment = false;
        // A block comment separates tokens; keep one space.
        current += ' ';
      }
      continue;
    }

    if (inString) {
      current += char;
      if (char === "'") {
        if (next === "'") {
          // Escaped quote inside a string literal.
          current += next;
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === '-' && next === '-') {
      i += 1;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      hasContent = true;
      inString = true;
      continue;
    }

    if (char === ';') {
      flush();
      continue;
    }

    current += char;
    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
      hasContent = true;
    }
  }

  flush();
  return statements;
}
