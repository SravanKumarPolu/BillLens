/**
 * SupabaseRemoteSyncPort tests (v2.5.0).
 *
 * Regression coverage for the release-candidate verification fixes:
 *
 *   - Aggregate payload extraction: `expense` ops carry
 *     {expense, payers, splits} and `settlement` ops nest {settlement};
 *     spreading them raw into a PostgREST insert/update ALWAYS failed
 *     (unknown columns). The port must flatten per entity type.
 *   - Delete ops must NOT spread the payload (`reason` is not a column).
 *   - A 23505 on create is SUCCESS when our row already exists (the
 *     retry of a server-accepted-but-response-lost write), conflict
 *     otherwise.
 *   - 401 / PGRST301 classify as retriable AUTH_TOKEN_EXPIRED (never
 *     DELETED_REMOTELY, which dead-ended the queue after token expiry).
 *
 * The Supabase client is faked with the minimal query-builder surface
 * the port uses (.from().insert/update/select/single/maybeSingle/.rpc).
 */

import { describe, expect, it } from '@jest/globals';

import type { SyncOperation } from '@domain/repositories/sync.repository';
import { asDateTime } from '@domain/value-objects';
import { SupabaseRemoteSyncPort } from '@infrastructure/remote/supabase-remote-sync-port';

// ---------------------------------------------------------------------------
// Minimal Supabase client double
// ---------------------------------------------------------------------------

type TableCall = { table: string; method: string; args: unknown };

class FakeQueryBuilder {
  constructor(
    private readonly state: {
      calls: TableCall[];
      table: string;
      method: string;
      /** Result returned by .single()/.maybeSingle(). */
      result: { data: unknown; error: unknown };
    },
  ) {}

  insert(values: unknown) {
    this.state.calls.push({ table: this.state.table, method: 'insert', args: values });
    return this;
  }
  update(values: unknown) {
    this.state.calls.push({ table: this.state.table, method: 'update', args: values });
    return this;
  }
  upsert(values: unknown) {
    this.state.calls.push({ table: this.state.table, method: 'upsert', args: values });
    return this;
  }
  eq(_col: string, _val: unknown) {
    return this;
  }
  select(_cols?: string) {
    return this;
  }
  single() {
    return Promise.resolve(this.state.result);
  }
  maybeSingle() {
    return Promise.resolve(this.state.result);
  }
}

class FakeSupabaseClient {
  readonly calls: TableCall[] = [];
  /** Behavior for the NEXT .from(table) builder. */
  nextResult: { data: unknown; error: unknown } = { data: null, error: null };
  /** Queue of results — one per from() invocation. */
  resultQueue: { data: unknown; error: unknown }[] = [];
  rpcError: { code: string; message: string } | null = null;

  from(table: string) {
    const result = this.resultQueue.length > 0 ? (this.resultQueue.shift() as { data: unknown; error: unknown }) : this.nextResult;
    return new FakeQueryBuilder({ calls: this.calls, table, method: 'from', result });
  }

  async rpc(name: string, args: unknown) {
    this.calls.push({ table: `rpc:${name}`, method: 'rpc', args });
    return { data: null, error: this.rpcError };
  }
}

function makeOp(overrides?: Partial<SyncOperation>): SyncOperation {
  return {
    id: 'op-1',
    entityType: 'group',
    entityId: 'grp-1',
    operation: 'create',
    payload: { name: 'Trip' },
    idempotencyKey: 'idem-1',
    baseVersion: 0,
    localVersion: 1,
    status: 'pending',
    retryCount: 0,
    createdAt: asDateTime('2026-10-11T00:00:00.000Z'),
    ...overrides,
  };
}

function makePort(client: FakeSupabaseClient): SupabaseRemoteSyncPort {
  // Inject the fake client by stubbing getClient via prototype access.
  const port = new SupabaseRemoteSyncPort('https://demo.supabase.co', 'anon-key');
  (port as unknown as { client: unknown }).client = client;
  return port;
}

const EXPENSE_PAYLOAD = {
  expense: {
    id: 'exp-1',
    group_id: 'grp-1',
    title: 'Dinner',
    amount_minor: 1000,
    currency_code: 'INR',
    expense_date: '2026-10-11',
    split_type: 'equal',
    created_by: 'mem-1',
    created_at: '2026-10-11T00:00:00.000Z',
    updated_at: '2026-10-11T00:00:00.000Z',
    deleted_at: null,
    version: 1,
  },
  payers: [
    { id: 'pay-1', expense_id: 'exp-1', member_id: 'mem-1', amount_minor: 1000, version: 1 },
  ],
  splits: [
    { id: 'spl-1', expense_id: 'exp-1', member_id: 'mem-1', amount_minor: 1000, version: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Payload flattening
// ---------------------------------------------------------------------------

describe('SupabaseRemoteSyncPort — aggregate payload extraction', () => {
  it('expense create inserts ONLY the flattened expense row (not the aggregate envelope)', async () => {
    const client = new FakeSupabaseClient();
    // Queue: main insert OK, then payers upsert OK, then splits upsert OK.
    client.resultQueue.push({ data: {}, error: null }, { data: null, error: null }, { data: null, error: null });
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({ entityType: 'expense', entityId: 'exp-1', payload: EXPENSE_PAYLOAD }),
    );

    expect(result).toEqual({ status: 'success' });
    const insert = client.calls.find((c) => c.table === 'expenses' && c.method === 'insert');
    expect(insert).toBeDefined();
    const inserted = insert?.args as Record<string, unknown>;
    // Flattened — the nested envelope keys must NOT leak into the row.
    expect(inserted['expense']).toBeUndefined();
    expect(inserted['payers']).toBeUndefined();
    expect(inserted['splits']).toBeUndefined();
    expect(inserted['title']).toBe('Dinner');
    expect(inserted['amount_minor']).toBe(1000);
    expect(inserted['id']).toBe('exp-1');
    expect(inserted['version']).toBe(1);
    // Children ride along as upserts.
    expect(client.calls.some((c) => c.table === 'expense_payers' && c.method === 'upsert')).toBe(true);
    expect(client.calls.some((c) => c.table === 'expense_splits' && c.method === 'upsert')).toBe(true);
  });

  it('settlement create extracts the nested settlement row', async () => {
    const client = new FakeSupabaseClient();
    client.nextResult = { data: {}, error: null };
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({
        entityType: 'settlement',
        entityId: 'stl-1',
        payload: {
          settlement: {
            id: 'stl-1',
            group_id: 'grp-1',
            amount_minor: 500,
            currency_code: 'INR',
            version: 1,
          },
        },
      }),
    );

    expect(result).toEqual({ status: 'success' });
    const insert = client.calls.find((c) => c.table === 'settlements' && c.method === 'insert');
    const inserted = insert?.args as Record<string, unknown>;
    expect(inserted['settlement']).toBeUndefined();
    expect(inserted['amount_minor']).toBe(500);
  });

  it('flat group payloads pass through unchanged', async () => {
    const client = new FakeSupabaseClient();
    client.nextResult = { data: {}, error: null };
    const port = makePort(client);

    await port.uploadOperation(makeOp({ payload: { name: 'Trip', currency_code: 'INR' } }));

    const insert = client.calls.find((c) => c.table === 'groups');
    expect(insert?.args).toEqual({ name: 'Trip', currency_code: 'INR', id: 'grp-1', version: 1 });
  });

  it('delete ops write ONLY deleted_at (never spread payload keys like reason)', async () => {
    const client = new FakeSupabaseClient();
    client.nextResult = { data: {}, error: null };
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({
        entityType: 'expense',
        entityId: 'exp-1',
        operation: 'delete',
        payload: { id: 'exp-1', deletedAt: '2026-10-11T01:00:00.000Z', reason: 'user' },
        baseVersion: 2,
      }),
    );

    expect(result).toEqual({ status: 'success' });
    const update = client.calls.find((c) => c.table === 'expenses' && c.method === 'update');
    expect(update?.args).toEqual({ deleted_at: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// Idempotent create retries (server-accepted-but-response-lost writes)
// ---------------------------------------------------------------------------

describe('SupabaseRemoteSyncPort — duplicate-create resolution', () => {
  it('treats 23505 as SUCCESS when our row already exists (retried write)', async () => {
    const client = new FakeSupabaseClient();
    // 1st call: insert → 23505; 2nd call: verification select → row found.
    client.resultQueue.push(
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: { id: 'exp-1', version: 1 }, error: null },
    );
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({ entityType: 'expense', entityId: 'exp-1', payload: EXPENSE_PAYLOAD }),
    );

    expect(result).toEqual({ status: 'success' });
  });

  it('treats 23505 as CONFLICT when a different row holds the key', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push(
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null, error: null }, // verification: no row with our id
    );
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({ entityType: 'expense', entityId: 'exp-1', payload: EXPENSE_PAYLOAD }),
    );

    expect(result).toMatchObject({ status: 'conflict' });
  });
});

// ---------------------------------------------------------------------------
// Version conflicts + auth expiry classification
// ---------------------------------------------------------------------------

describe('SupabaseRemoteSyncPort — update guard + error classification', () => {
  it('surfaces PGRST116 on update as a conflict with the cloud version', async () => {
    const client = new FakeSupabaseClient();
    client.resultQueue.push(
      { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      { data: { version: 4, amount_minor: 999 }, error: null },
    );
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({ operation: 'update', baseVersion: 2, payload: { title: 'x' } }),
    );

    expect(result).toMatchObject({ status: 'conflict', cloudVersion: 4 });
  });

  it('classifies JWT expiry (PGRST301) as retriable AUTH_TOKEN_EXPIRED', async () => {
    const client = new FakeSupabaseClient();
    client.nextResult = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };
    const port = makePort(client);

    const result = await port.uploadOperation(makeOp({ payload: {} }));

    expect(result).toMatchObject({ status: 'error', errorCode: 'AUTH_TOKEN_EXPIRED' });
  });

  it('classifies 401 as retriable AUTH_TOKEN_EXPIRED', async () => {
    const client = new FakeSupabaseClient();
    client.nextResult = { data: null, error: { code: '401', message: 'Unauthorized' } };
    const port = makePort(client);

    const result = await port.uploadOperation(makeOp({ payload: {} }));

    expect(result).toMatchObject({ status: 'error', errorCode: 'AUTH_TOKEN_EXPIRED' });
  });

  it('rejects unmapped entity types (deny-all tables) as UNSUPPORTED_ENTITY_TYPE', async () => {
    const client = new FakeSupabaseClient();
    const port = makePort(client);

    const result = await port.uploadOperation(
      makeOp({ entityType: 'preference' }),
    );

    expect(result).toMatchObject({ status: 'error', errorCode: 'UNSUPPORTED_ENTITY_TYPE' });
    expect(client.calls).toHaveLength(0); // no network call attempted
  });

  it('returns NOT_CONFIGURED (retriable) when no Supabase env exists', async () => {
    const port = new SupabaseRemoteSyncPort(undefined, undefined);
    const result = await port.uploadOperation(makeOp());
    expect(result).toMatchObject({ status: 'error', errorCode: 'NOT_CONFIGURED' });
  });
});
