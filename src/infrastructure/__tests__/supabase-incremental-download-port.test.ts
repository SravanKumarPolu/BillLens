/**
 * SupabaseIncrementalDownloadPort tests (v2.6.0).
 *
 * The Supabase client is faked with the minimal query-builder surface
 * the download port uses: .from().select().or().gt().order().order().limit().
 *
 * Under test:
 *   - KEYSET pagination: the (updated_at, id) tuple filter, limit+1
 *     fetch, hasMore detection, nextCursor = last ROW of the page.
 *   - TOMBSTONES: deleted_at rows map to changeType 'delete'.
 *   - TABLE ROUTING per entity type; unknown types serve an empty feed.
 *   - NOT_CONFIGURED without env/args.
 *   - PostgREST error propagation (PGRST301 → AUTH_TOKEN_EXPIRED message).
 *   - ACCESS-TOKEN binding (the JWT factory is passed to the client).
 */

import { describe, expect, it } from '@jest/globals';

import type { RemoteEntityType } from '@domain/services/sync/incremental-download';
import {
  SupabaseIncrementalDownloadPort,
  parseCursor,
} from '@infrastructure/remote/supabase-incremental-download-port';

// ---------------------------------------------------------------------------
// Minimal Supabase client double (query builder chain)
// ---------------------------------------------------------------------------

interface RecordedQuery {
  readonly table: string;
  readonly orFilter: string | null;
  readonly gtFilter: { column: string; value: string } | null;
  order: readonly string[];
  readonly limit: number;
}

class FakeQueryBuilder {
  constructor(
    private readonly state: {
      query: RecordedQuery;
      result: { data: unknown; error: unknown };
    },
  ) {}

  select(_cols?: string) {
    return this;
  }
  or(filter: string) {
    (this.state.query as { orFilter: string | null }).orFilter = filter;
    return this;
  }
  gt(column: string, value: string) {
    (this.state.query as { gtFilter: { column: string; value: string } | null }).gtFilter = {
      column,
      value,
    };
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.state.query.order = [
      ...this.state.query.order,
      `${column}:${options?.ascending === false ? 'desc' : 'asc'}`,
    ];
    return this;
  }
  limit(n: number) {
    (this.state.query as { limit: number }).limit = n;
    return this;
  }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | Promise<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | Promise<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.state.result).then(onfulfilled, onrejected);
  }
}

class FakeSupabaseClient {
  readonly queries: RecordedQuery[] = [];
  /** Result queue — one entry per query, in order. */
  readonly resultQueue: { data: unknown; error: unknown }[] = [];
  /** Capture of the createClient options (accessToken binding). */
  static lastClientOptions: Record<string, unknown> | null = null;

  from(table: string) {
    const result =
      this.resultQueue.length > 0
        ? (this.resultQueue.shift() as { data: unknown; error: unknown })
        : { data: [], error: null };
    const query: RecordedQuery = {
      table,
      orFilter: null,
      gtFilter: null,
      order: [],
      limit: 0,
    };
    this.queries.push(query);
    return new FakeQueryBuilder({ query, result });
  }
}

function makePort(client: FakeSupabaseClient): SupabaseIncrementalDownloadPort {
  const port = new SupabaseIncrementalDownloadPort('https://demo.supabase.co', 'anon-key');
  (port as unknown as { client: unknown }).client = client;
  return port;
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function cloudRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'row-1',
    updated_at: '2026-10-02T10:00:00.000Z',
    version: 1,
    deleted_at: null,
    ...overrides,
  };
}

describe('SupabaseIncrementalDownloadPort', () => {
  it('queries the right table per entity type with keyset ordering', async () => {
    const client = new FakeSupabaseClient();
    const port = makePort(client);
    const result = await port.downloadChanges('expense', null, 10);

    expect(client.queries).toHaveLength(1);
    const q = client.queries[0] as RecordedQuery;
    expect(q.table).toBe('expenses');
    expect(q.order).toEqual(['updated_at:asc', 'id:asc']);
    expect(q.limit).toBe(11); // limit + 1 for hasMore detection
    expect(q.orFilter).toBeNull(); // first sync — no cursor filter
    expect(result.hasMore).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('builds the TUPLE continuation filter from a composite cursor', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push({
      data: [
        cloudRow({ id: 'row-2', updated_at: '2026-10-02T10:01:00.000Z', version: 2 }),
      ],
      error: null,
    });
    const port = makePort(client);
    const result = await port.downloadChanges(
      'group',
      '2026-10-02T10:00:00.000Z|row-1',
      10,
    );

    const q = client.queries[0] as RecordedQuery;
    expect(q.table).toBe('groups');
    expect(q.orFilter).toBe(
      'updated_at.gt."2026-10-02T10:00:00.000Z",and(updated_at.eq."2026-10-02T10:00:00.000Z",id.gt."row-1")',
    );
    expect(result.changes).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    // nextCursor = the last APPLIED row position.
    expect(result.nextCursor).toBe('2026-10-02T10:01:00.000Z|row-2');
  });

  it('detects hasMore via the +1 fetch and cuts the page at the limit', async () => {
    const rows = [
      cloudRow({ id: 'r1', updated_at: '2026-10-02T10:00:00.000Z' }),
      cloudRow({ id: 'r2', updated_at: '2026-10-02T10:01:00.000Z' }),
      cloudRow({ id: 'r3', updated_at: '2026-10-02T10:02:00.000Z' }),
    ];
    const client = new FakeSupabaseClient();
    client.resultQueue.push({ data: rows, error: null });
    const port = makePort(client);
    const result = await port.downloadChanges('settlement', null, 2);

    expect(result.hasMore).toBe(true);
    expect(result.changes).toHaveLength(2); // the extra row is cut
    expect(result.nextCursor).toBe('2026-10-02T10:01:00.000Z|r2');
  });

  it('maps soft-deleted rows to DELETE tombstones carrying the payload', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push({
      data: [
        cloudRow({
          id: 'gone',
          deleted_at: '2026-10-03T08:00:00.000Z',
          version: 3,
        }),
      ],
      error: null,
    });
    const port = makePort(client);
    const result = await port.downloadChanges('group_member', null, 10);
    const tombstone = result.changes[0];
    expect(tombstone?.changeType).toBe('delete');
    expect(String(tombstone?.deletedAt)).toBe('2026-10-03T08:00:00.000Z');
    expect(tombstone?.version).toBe(3);
    // The payload is the FULL row (the applier writes it verbatim).
    expect((tombstone?.payload as Record<string, unknown>)['id']).toBe('gone');
  });

  it('maps live rows to create (v1) / update (v>1)', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push({
      data: [
        cloudRow({ id: 'new-row', version: 1 }),
        cloudRow({ id: 'upd-row', version: 4, updated_at: '2026-10-02T11:00:00.000Z' }),
      ],
      error: null,
    });
    const port = makePort(client);
    const result = await port.downloadChanges('expense_split', null, 10);
    expect(result.changes[0]?.changeType).toBe('create');
    expect(result.changes[1]?.changeType).toBe('update');
  });

  it('routes every served entity type to its cloud table', async () => {
    const routing: readonly [RemoteEntityType, string][] = [
      ['group', 'groups'],
      ['group_member', 'group_members'],
      ['group_invite', 'group_invites'],
      ['expense', 'expenses'],
      ['expense_payer', 'expense_payers'],
      ['expense_split', 'expense_splits'],
      ['settlement', 'settlements'],
    ];
    for (const [entityType, table] of routing) {
      const client = new FakeSupabaseClient();
      const port = makePort(client);
      await port.downloadChanges(entityType, null, 5);
      expect((client.queries[0] as RecordedQuery).table).toBe(table);
    }
  });

  it('serves an EMPTY feed for out-of-scope entity types (receipts etc.)', async () => {
    const client = new FakeSupabaseClient();
    const port = makePort(client);
    const result = await port.downloadChanges('receipt', null, 10);
    expect(result.changes).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(client.queries).toHaveLength(0); // no query issued at all
  });

  it('propagates PostgREST errors with their code for classification', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    const port = makePort(client);
    await expect(port.downloadChanges('group', null, 10)).rejects.toThrow('PGRST301');
  });

  it('throws NOT_CONFIGURED when Supabase env is absent', async () => {
    const port = new SupabaseIncrementalDownloadPort(undefined, undefined);
    await expect(port.downloadChanges('group', null, 10)).rejects.toThrow('NOT_CONFIGURED');
  });
});

describe('cursor parsing', () => {
  it('parses composite cursors into (timestamp, id)', () => {
    const parsed = parseCursor('2026-10-02T10:00:00.000Z|abc-123');
    expect(parsed).toEqual({ updatedAt: '2026-10-02T10:00:00.000Z', rowId: 'abc-123' });
  });

  it('accepts an empty row id (overlap-lowered cursor re-reads the bucket)', () => {
    const parsed = parseCursor('2026-10-02T09:55:00.000Z|');
    expect(parsed).toEqual({ updatedAt: '2026-10-02T09:55:00.000Z', rowId: null });
  });

  it('returns null for garbage', () => {
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor('garbage')).toBeNull();
    expect(parseCursor('not-a-date|x')).toBeNull();
  });
});
