/**
 * Two-device encrypted sync — end-to-end (Node + two real SQLite files).
 *
 * Device A and Device B each own a separate SQLite database. They share a
 * group key (wrapped to B's X25519 key out of band), exchange only
 * encrypted envelopes through the reference relay, and each applies the
 * other's events locally. No plaintext leaves either device.
 *
 * Covers the brief's scenario: ₹1,200 split four ways → ₹300 each; B
 * records a second expense; A receives it; balances agree; duplicate
 * delivery applies nothing twice.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

import { EncryptedSyncEngine } from '@application/sync/encrypted-sync-engine';
import {
  GroupKeyring,
  createDeviceIdentity,
  createEncryptedEvent,
  generateGroupKey,
  publicIdentity,
  unwrapGroupKey,
  wrapGroupKey,
  type EncryptedSyncEvent,
  type GroupKey,
} from '@domain/sync-crypto';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { RelayClient } from '@infrastructure/relay-reference/relay-client';
import { startRelay, type RelayHandle } from '@infrastructure/relay-reference/relay-server';
import { runMigrations } from '@infrastructure/sqlite/schema';

import { nodeHttpFetch } from './node-http-fetch';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

const GROUP = 'g_two_devices';
const MEMBERS = [
  { id: 'm_owner', name: 'Owner' },
  { id: 'm_asha', name: 'Asha' },
  { id: 'm_ravi', name: 'Ravi' },
  { id: 'm_meera', name: 'Meera' },
] as const;
const NOW = new Date('2026-10-21T12:00:00.000Z');

// Two SQLite files + migrations + relay setup exceed the default 5s budget
// when the whole repo runs in parallel.
jest.setTimeout(60_000);

const deviceA = createDeviceIdentity(new Uint8Array(32).fill(31));
const deviceB = createDeviceIdentity(new Uint8Array(32).fill(32));

let dir: string;
let relay: RelayHandle | undefined;
let servicesA: AppServices;
let servicesB: AppServices;
let dbA: SqliteCliDatabase;
let dbB: SqliteCliDatabase;
let relayA: RelayClient;
let relayB: RelayClient;
let groupKey: GroupKey;
let keyringA: GroupKeyring;
let keyringB: GroupKeyring;
let engineA: EncryptedSyncEngine;
let engineB: EncryptedSyncEngine;

async function seedDevice(
  database: SqliteCliDatabase,
  createdBy: string,
): Promise<AppServices> {
  await runMigrations(database);
  const services = createCompositionRoot({ database });
  await services.groups.createGroup.execute({
    groupId: GROUP,
    name: 'Two devices',
    currencyCode: 'INR',
    createdBy,
    ownerMemberId: MEMBERS[0].id,
    now: '2026-10-01T09:00:00.000Z' as never,
  });
  for (const member of MEMBERS.slice(1)) {
    await services.repositories.members.save({
      id: member.id as never,
      groupId: GROUP as never,
      displayName: member.name,
      role: 'member',
      joinedAt: '2026-10-01T09:00:00.000Z',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
      version: 1,
      isActive: true,
      isRegisteredUser: false,
    } as never);
  }
  return services;
}

function balanceFor(services: AppServices, memberId: string): Promise<number> {
  return services.balances.getGroupBalances.execute({ groupId: GROUP as never }).then((result) => {
    const inr = result.results.find((row) => row.currencyCode === 'INR');
    return (
      inr?.memberCurrencyBalances.find((row) => row.memberId === memberId)?.netBalanceMinor ?? 0
    );
  });
}

function expensePayload(input: {
  id: string;
  title: string;
  amountMinor: number;
  payerMemberId: string;
}): Readonly<Record<string, unknown>> {
  return {
    type: 'expense.created',
    expense: {
      id: input.id,
      title: input.title,
      amountMinor: input.amountMinor,
      currencyCode: 'INR',
      expenseDate: '2026-10-21',
      payerMemberId: input.payerMemberId,
      participantIds: MEMBERS.map((m) => m.id),
    },
  };
}

async function applyPayload(services: AppServices, payload: Readonly<Record<string, unknown>>): Promise<void> {
  if (payload.type !== 'expense.created') throw new Error(`Unknown event type: ${String(payload.type)}`);
  const expense = payload.expense as {
    id: string;
    title: string;
    amountMinor: number;
    currencyCode: string;
    expenseDate: string;
    payerMemberId: string;
    participantIds: string[];
  };
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP,
    expenseId: expense.id,
    title: expense.title,
    amountMinor: expense.amountMinor,
    currencyCode: expense.currencyCode,
    expenseDate: expense.expenseDate,
    payerContributions: [{ memberId: expense.payerMemberId, amountMinor: expense.amountMinor }],
    participantIds: expense.participantIds,
    createdBy: 'local-user',
    now: NOW.toISOString() as never,
  });
}

function makeEvent(eventId: string, payload: Readonly<Record<string, unknown>>): EncryptedSyncEvent {
  return createEncryptedEvent({
    groupId: GROUP,
    eventId,
    identity: deviceA,
    groupKey,
    payload,
    createdAt: NOW.toISOString(),
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-two-devices-'));
  dbA = new SqliteCliDatabase(join(dir, 'a.db'));
  servicesA = await seedDevice(dbA, 'local-user');
  dbB = new SqliteCliDatabase(join(dir, 'b.db'));
  servicesB = await seedDevice(dbB, 'local-user');

  groupKey = generateGroupKey(new Uint8Array(32).fill(41));
  const wrappedForB = wrapGroupKey(groupKey, publicIdentity(deviceB).encryptionPublicKey);
  const keyForB = unwrapGroupKey(wrappedForB, deviceB.encryption.privateKey);

  keyringA = new GroupKeyring();
  keyringA.add(groupKey);
  keyringB = new GroupKeyring();
  keyringB.add(keyForB);

  relay = await startRelay({ now: () => NOW.getTime() });
  relayA = new RelayClient(relay.url, deviceA, nodeHttpFetch);
  relayB = new RelayClient(relay.url, deviceB, nodeHttpFetch);
  await relayA.register();
  await relayB.register();
  await relayA.addMember(GROUP, deviceA.deviceId);
  await relayA.addMember(GROUP, deviceB.deviceId);

  const members = await relayA.listMembers(GROUP);
  const signingKeys = new Map(members.map((m) => [m.deviceId, m.signingPublicKey]));

  engineA = new EncryptedSyncEngine({
    groupId: GROUP,
    keyring: keyringA,
    memberSigningKeys: signingKeys,
    source: relayA,
    apply: (payload) => applyPayload(servicesA, payload),
    now: () => NOW,
  });
  engineB = new EncryptedSyncEngine({
    groupId: GROUP,
    keyring: keyringB,
    memberSigningKeys: signingKeys,
    source: relayB,
    apply: (payload) => applyPayload(servicesB, payload),
    now: () => NOW,
  });
});

afterAll(async () => {
  await relay?.close();
  dbA?.close();
  dbB?.close();
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('two-device encrypted sync', () => {
  it('syncs a ₹1,200 expense to the other device without plaintext on the relay', async () => {
    await servicesA.expenses.createExpenseManually.execute({
      groupId: GROUP,
      expenseId: 'e_dinner',
      title: 'Dinner',
      amountMinor: 120_000,
      currencyCode: 'INR',
      expenseDate: '2026-10-21',
      payerContributions: [{ memberId: 'm_owner', amountMinor: 120_000 }],
      participantIds: MEMBERS.map((m) => m.id),
      createdBy: 'local-user',
      now: NOW.toISOString() as never,
    });
    expect(await balanceFor(servicesA, 'm_owner')).toBe(90_000);

    const event = makeEvent(
      'evt_dinner',
      expensePayload({ id: 'e_dinner', title: 'Dinner', amountMinor: 120_000, payerMemberId: 'm_owner' }),
    );
    expect(JSON.stringify(event)).not.toContain('120000');
    await relayA.submitEvent(GROUP, event);

    const result = await engineB.pullOnce();
    expect(result.applied).toBe(1);

    expect(await balanceFor(servicesB, 'm_owner')).toBe(90_000);
    expect(await balanceFor(servicesB, 'm_asha')).toBe(-30_000);
    expect(await balanceFor(servicesB, 'm_ravi')).toBe(-30_000);
    expect(await balanceFor(servicesB, 'm_meera')).toBe(-30_000);

    const count = await dbB.get<{ count: number }>(
      "select count(*) as count from expenses where group_id = ? and deleted_at is null",
      [GROUP],
    );
    expect(count?.count).toBe(1);
  });

  it('propagates the other device’s expense back and keeps balances consistent', async () => {
    await servicesB.expenses.createExpenseManually.execute({
      groupId: GROUP,
      expenseId: 'e_taxi',
      title: 'Taxi',
      amountMinor: 40_000,
      currencyCode: 'INR',
      expenseDate: '2026-10-21',
      payerContributions: [{ memberId: 'm_asha', amountMinor: 40_000 }],
      participantIds: MEMBERS.map((m) => m.id),
      createdBy: 'local-user',
      now: NOW.toISOString() as never,
    });

    const event = createEncryptedEvent({
      groupId: GROUP,
      eventId: 'evt_taxi',
      identity: deviceB,
      groupKey,
      payload: expensePayload({ id: 'e_taxi', title: 'Taxi', amountMinor: 40_000, payerMemberId: 'm_asha' }),
      createdAt: NOW.toISOString(),
    });
    await relayB.submitEvent(GROUP, event);
    expect((await engineA.pullOnce()).applied).toBe(1);

    // Owner: +900 (dinner) −100 (taxi share) = +800. Asha: −300 +300 = 0.
    expect(await balanceFor(servicesA, 'm_owner')).toBe(80_000);
    expect(await balanceFor(servicesA, 'm_asha')).toBe(0);
    expect(await balanceFor(servicesA, 'm_ravi')).toBe(-40_000);
    expect(await balanceFor(servicesA, 'm_meera')).toBe(-40_000);

    // B's local copy already had the dinner, and now the taxi.
    expect(await balanceFor(servicesB, 'm_owner')).toBe(80_000);
    expect(await balanceFor(servicesB, 'm_asha')).toBe(0);
  });

  it('applies nothing twice when a pull runs again', async () => {
    expect(await engineA.pullOnce()).toEqual({ applied: 0, skipped: 0, conflicts: 0 });
    expect(await engineB.pullOnce()).toEqual({ applied: 0, skipped: 0, conflicts: 0 });

    const countA = await dbB.get<{ count: number }>(
      "select count(*) as count from expenses where group_id = ? and deleted_at is null",
      [GROUP],
    );
    expect(countA?.count).toBe(2);
    expect(relay?.stats().events).toBe(2);
  });

  it('does not deliver A’s events back to A and vice versa', async () => {
    expect(await relayA.fetchEvents(GROUP)).toHaveLength(0);
    expect(await relayB.fetchEvents(GROUP)).toHaveLength(0);
  });
});
