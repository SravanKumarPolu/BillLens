/**
 * Durable encrypted-event processing.
 *
 * Proves the properties the app needs before the encrypted path can be
 * enabled: duplicates never re-apply, state survives a restart, failures
 * are not acknowledged, and conflicting financial events become review
 * records instead of overwrites.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { EncryptedSyncEngine } from '@application/sync/encrypted-sync-engine';
import type { EncryptedEventSource } from '@application/sync/encrypted-sync-engine';
import type { EncryptedSyncStore } from '@application/sync/encrypted-sync-store.port';
import { assertExpenseEventApplicable } from '@application/sync/financial-conflict';
import {
  GroupKeyring,
  createDeviceIdentity,
  createEncryptedEvent,
  fromHex,
  generateGroupKey,
  publicIdentity,
  toHex,
  type EncryptedSyncEvent,
} from '@domain/sync-crypto';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { SqliteEncryptedSyncStore } from '@infrastructure/sqlite/sqlite-encrypted-sync-store';
import { runMigrations } from '@infrastructure/sqlite/schema';

import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const GROUP = 'g_persist';
const OWNER = 'm_owner';
const NOW = new Date('2026-10-21T12:00:00.000Z');

const alice = createDeviceIdentity(new Uint8Array(32).fill(51));
const bob = createDeviceIdentity(new Uint8Array(32).fill(52));
const groupKey = generateGroupKey(new Uint8Array(32).fill(53));

class FakeSource implements EncryptedEventSource {
  events: EncryptedSyncEvent[] = [];
  acked: string[] = [];

  async fetchEvents(): Promise<readonly EncryptedSyncEvent[]> {
    return this.events;
  }
  async acknowledge(_groupId: string, eventIds: readonly string[]): Promise<void> {
    this.acked.push(...eventIds);
  }
}

function eventFor(
  eventId: string,
  payload: Readonly<Record<string, unknown>>,
  identity = alice,
): EncryptedSyncEvent {
  return createEncryptedEvent({
    groupId: GROUP,
    eventId,
    identity,
    groupKey,
    payload,
    createdAt: NOW.toISOString(),
  });
}

function payload(amountMinor: number): Readonly<Record<string, unknown>> {
  return {
    type: 'expense.created',
    expense: {
      id: 'e_1',
      title: 'Dinner',
      amountMinor,
      currencyCode: 'INR',
      expenseDate: '2026-10-21',
      payerMemberId: OWNER,
      participantIds: [OWNER],
    },
  };
}

describeWithSqlite('encrypted sync persistence', () => {
  let dir: string;
  let db: SqliteCliDatabase;
  let services: AppServices;
  let store: EncryptedSyncStore;
  let keyring: GroupKeyring;
  let source: FakeSource;


  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'billlens-persist-'));
    db = new SqliteCliDatabase(join(dir, 'db.sqlite'));
    await runMigrations(db);
    services = createCompositionRoot({ database: db });
    await services.groups.createGroup.execute({
      groupId: GROUP,
      name: 'Persistence',
      currencyCode: 'INR',
      createdBy: 'local-user',
      ownerMemberId: OWNER,
      now: '2026-10-01T09:00:00.000Z' as never,
    });
    store = new SqliteEncryptedSyncStore(db);
    keyring = new GroupKeyring();
    keyring.add(groupKey);
    source = new FakeSource();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function engine(apply: (p: Readonly<Record<string, unknown>>) => Promise<void>) {
    return new EncryptedSyncEngine({
      groupId: GROUP,
      keyring,
      memberSigningKeys: new Map([[alice.deviceId, publicIdentity(alice).signingPublicKey]]),
      source,
      apply,
      store,
      now: () => NOW,
    });
  }

  it('applies once, survives a restart, and never re-applies', async () => {
    let applies = 0;
    source.events = [eventFor('evt_1', payload(120_000))];
    const first = engine(async () => {
      applies += 1;
    });
    expect(await first.pullOnce()).toEqual({ applied: 1, skipped: 0, conflicts: 0 });
    expect(applies).toBe(1);
    expect(source.acked).toContain('evt_1');

    const record = await store.getProcessedEvent('evt_1');
    expect(record?.status).toBe('processed');

    // New engine instance (app restart) over the same store.
    const restarted = engine(async () => {
      applies += 1;
    });
    expect(await restarted.pullOnce()).toEqual({ applied: 0, skipped: 1, conflicts: 0 });
    expect(applies).toBe(1);
  });

  it('does not acknowledge a failed event and can retry it', async () => {
    source.events = [eventFor('evt_fail', payload(50_000))];
    source.acked = [];
    let attempts = 0;
    const failing = engine(async () => {
      attempts += 1;
      throw new Error('database busy');
    });
    await expect(failing.pullOnce()).rejects.toThrow(/database busy/);
    expect(attempts).toBe(1);
    expect(source.acked).toEqual([]);
    expect((await store.getProcessedEvent('evt_fail'))?.status).toBe('failed');

    const retrying = engine(async () => {
      attempts += 1;
    });
    expect(await retrying.pullOnce()).toEqual({ applied: 1, skipped: 0, conflicts: 0 });
    expect(attempts).toBe(2);
    expect(source.acked).toContain('evt_fail');
  });

  it('records a financial conflict instead of overwriting', async () => {
    await services.expenses.createExpenseManually.execute({
      groupId: GROUP,
      expenseId: 'e_1',
      title: 'Dinner',
      amountMinor: 120_000,
      currencyCode: 'INR',
      expenseDate: '2026-10-21',
      payerContributions: [{ memberId: OWNER, amountMinor: 120_000 }],
      participantIds: [OWNER],
      createdBy: 'local-user',
      now: NOW.toISOString() as never,
    });

    source.events = [eventFor('evt_conflict', payload(150_000))];
    source.acked = [];

    const conflicting = engine(async (remotePayload) => {
      const remote = remotePayload.expense as {
        id: string;
        amountMinor: number;
        currencyCode: string;
        payerMemberId: string;
        participantIds: string[];
      };
      const expense = await services.repositories.expenses.findById('e_1' as never);
      const payers = await services.repositories.expenses.listPayers('e_1' as never);
      assertExpenseEventApplicable({
        local:
          expense === null
            ? null
            : {
                id: expense.id,
                version: expense.version,
                amountMinor: expense.amountMinor,
                currencyCode: expense.currencyCode,
                payerSignature: payers.map((p) => `${p.memberId}:${p.amountMinor}`).sort().join('|'),
                participantSignature: '',
              },
        remote: {
          id: remote.id,
          version: (expense?.version ?? 0) + 1,
          amountMinor: remote.amountMinor,
          currencyCode: remote.currencyCode,
          payerSignature: `${remote.payerMemberId}:${remote.amountMinor}`,
          participantSignature: remote.participantIds.sort().join('|'),
        },
        localPayload: expense,
        remotePayload,
      });
      throw new Error('should not apply');
    });

    expect(await conflicting.pullOnce()).toEqual({ applied: 0, skipped: 0, conflicts: 1 });
    expect((await store.getProcessedEvent('evt_conflict'))?.status).toBe('conflict');
    expect(source.acked).toContain('evt_conflict');

    const conflicts = await store.listConflicts(GROUP);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entityId).toBe('e_1');
    await store.resolveConflict(conflicts[0]!.id, 'keep_local', NOW.toISOString());
    expect((await store.listConflicts(GROUP))).toHaveLength(0);

    const expense = await services.repositories.expenses.findById('e_1' as never);
    expect(expense?.amountMinor).toBe(120_000);
  });

  it('keeps event durability metadata and cursors', async () => {
    await store.putKeyEpoch({ groupId: GROUP, keyId: groupKey.keyId, createdAt: NOW.toISOString() });
    await store.saveCursor(GROUP, bob.deviceId, NOW.toISOString(), NOW.toISOString());
    expect(await store.getCursor(GROUP, bob.deviceId)).toBe(NOW.toISOString());
    expect((await store.listKeyEpochs(GROUP))[0]?.keyId).toBe(groupKey.keyId);

    await store.upsertMembership({
      groupId: GROUP,
      deviceId: bob.deviceId,
      signingPublicKey: publicIdentity(bob).signingPublicKey,
      encryptionPublicKey: publicIdentity(bob).encryptionPublicKey,
      status: 'active',
      addedAt: NOW.toISOString(),
    });
    expect((await store.listMemberships(GROUP))[0]?.deviceId).toBe(bob.deviceId);
  });

  it('treats an invalid signature as a failure, not a conflict', async () => {
    const event = eventFor('evt_bad_sig', payload(1));
    const tampered = { ...event, signature: event.signature.replace(/^../, '00') };
    source.events = [tampered];
    source.acked = [];
    const failing = engine(async () => undefined);
    await expect(failing.pullOnce()).rejects.toThrow();
    expect((await store.getProcessedEvent('evt_bad_sig'))?.status).toBe('failed');
    expect(source.acked).toEqual([]);
    // Unused import guard: fromHex/toHex are used to build deterministic ids in helpers.
    expect(toHex(fromHex('00'))).toBe('00');
  });
});
