/**
 * SQL splitter tests.
 *
 * Regression: `MIGRATION_0001` contains the comment
 * "guest_identity_links (local-only; tracks guest → cloud upgrade)".
 * The old splitter cut on every `;`, so the second half of that comment
 * (`tracks guest …`) became a statement and SQLite rejected it with
 * `near "tracks": syntax error` on the very first app launch.
 */

import { describe, expect, it } from '@jest/globals';

import { splitSqlStatements } from '@infrastructure/sqlite/sql-statements';

describe('splitSqlStatements', () => {
  it('splits plain statements and drops empty chunks', () => {
    expect(splitSqlStatements('create table a (id text);\n\ncreate index b on a (id);')).toEqual([
      'create table a (id text)',
      'create index b on a (id)',
    ]);
  });

  it('ignores a semicolon inside a line comment and drops the comment', () => {
    const sql = `-- a table (local-only; tracks guest upgrade)
create table guest_identity_links (id text primary key);
select 1;`;

    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    // The comment text (and its semicolon) must not leak into SQL.
    expect(statements[0]).toBe('create table guest_identity_links (id text primary key)');
    expect(statements.some((s) => s.startsWith('tracks'))).toBe(false);
    expect(statements[1]).toBe('select 1');
  });

  it('ignores a semicolon inside a block comment', () => {
    const statements = splitSqlStatements('/* one; two */ create table a (id text); select 2;');
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe('create table a (id text)');
    expect(statements[1]).toBe('select 2');
  });

  it('keeps a semicolon inside a string literal', () => {
    const statements = splitSqlStatements(
      "insert into t (note) values ('a;b'); insert into t (note) values ('c');",
    );
    expect(statements).toEqual([
      "insert into t (note) values ('a;b')",
      "insert into t (note) values ('c')",
    ]);
  });

  it('handles escaped single quotes inside a string', () => {
    const statements = splitSqlStatements("insert into t values ('it''s; fine'); select 3;");
    expect(statements).toHaveLength(2);
    expect(statements[1]).toBe('select 3');
  });

  it('ignores trailing comments after the last statement', () => {
    const statements = splitSqlStatements('select 1;\n-- done; nothing else');
    expect(statements).toEqual(['select 1']);
  });

  it('returns no statements for comments and whitespace only', () => {
    expect(splitSqlStatements('-- just a comment; really\n\n')).toEqual([]);
    expect(splitSqlStatements('   \n\t')).toEqual([]);
    expect(splitSqlStatements('')).toEqual([]);
  });
});
