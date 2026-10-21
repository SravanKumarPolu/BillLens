/**
 * Relay reference implementation + client — integration tests.
 *
 * Verifies the relay contract the encrypted sync design depends on:
 * registration, membership authorisation, opaque event storage,
 * per-device acknowledgements, duplicate suppression, TTL expiry and
 * rate limiting. No plaintext is ever sent to the relay.
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import {
  createDeviceIdentity,
  createEncryptedEvent,
  fromHex,
  generateGroupKey,
  publicIdentity,
  toHex,
} from '@domain/sync-crypto';
import { RelayClient, RelayError } from '@infrastructure/relay-reference/relay-client';
import { nodeHttpFetch } from './node-http-fetch';
import { startRelay, type RelayHandle } from '@infrastructure/relay-reference/relay-server';

const alice = createDeviceIdentity(new Uint8Array(32).fill(11));
const bob = createDeviceIdentity(new Uint8Array(32).fill(12));
const carol = createDeviceIdentity(new Uint8Array(32).fill(13));
const groupKey = generateGroupKey(new Uint8Array(32).fill(21));
const GROUP = 'group_relay_test';

let relay: RelayHandle;
let clientA: RelayClient;
let clientB: RelayClient;
let clientC: RelayClient;
let clock = Date.parse('2026-10-21T10:00:00.000Z');

/** Flip one byte so the ciphertext genuinely changes. */
function flipCiphertext(ciphertextHex: string): string {
  const bytes = fromHex(ciphertextHex);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return toHex(bytes);
}

function expenseEvent(identity = alice, eventId = 'evt_1') {
  return createEncryptedEvent({
    groupId: GROUP,
    eventId,
    identity,
    groupKey,
    payload: { type: 'expense.created', amountMinor: 120_000, currency: 'INR' },
    createdAt: new Date(clock).toISOString(),
  });
}

beforeAll(async () => {
  relay = await startRelay({
    ttlMs: 60_000,
    rateLimit: { max: 100, windowMs: 60_000 },
    now: () => clock,
  });
  clientA = new RelayClient(relay.url, alice, nodeHttpFetch);
  clientB = new RelayClient(relay.url, bob, nodeHttpFetch);
  clientC = new RelayClient(relay.url, carol, nodeHttpFetch);
  await clientA.register();
  await clientB.register();
  await clientC.register();
  await clientA.addMember(GROUP, alice.deviceId); // creates the relay group
  await clientA.addMember(GROUP, bob.deviceId);
});

afterAll(async () => {
  await relay.close();
});

describe('relay reference', () => {
  it('registers devices and authorises membership', async () => {
    expect(relay.stats().devices).toBe(3);
    const members = await clientA.listMembers(GROUP);
    expect(members.map((m) => m.deviceId).sort()).toEqual(
      [alice.deviceId, bob.deviceId].sort(),
    );

    await expect(clientC.fetchEvents(GROUP)).rejects.toMatchObject({ status: 403 });
  });

  it('stores only the encrypted envelope and dedupes re-submission', async () => {
    const event = expenseEvent();
    expect(JSON.stringify(event)).not.toContain('120000');

    expect((await clientA.submitEvent(GROUP, event)).duplicate).toBe(false);
    expect((await clientA.submitEvent(GROUP, event)).duplicate).toBe(true);
    expect(relay.stats().events).toBe(1);

    const received = await clientB.fetchEvents(GROUP);
    expect(received).toHaveLength(1);
    expect(received[0]?.header.eventId).toBe('evt_1');
    // The sender has already acknowledged its own event.
    expect(await clientA.fetchEvents(GROUP)).toHaveLength(0);
  });

  it('acknowledges per device and stops re-delivery', async () => {
    const received = await clientB.fetchEvents(GROUP);
    await clientB.acknowledge(GROUP, received.map((e) => e.header.eventId));
    expect(await clientB.fetchEvents(GROUP)).toHaveLength(0);
  });

  it('rejects an event whose sender is not the authenticated device', async () => {
    const event = expenseEvent(alice, 'evt_forged');
    await expect(clientB.submitEvent(GROUP, event)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects tampered envelopes before storage', async () => {
    const event = expenseEvent(alice, 'evt_tampered');
    const tampered = { ...event, ciphertext: flipCiphertext(event.ciphertext) };
    await expect(clientA.submitEvent(GROUP, tampered)).rejects.toMatchObject({ status: 401 });
  });

  it('expires events after the TTL', async () => {
    const event = expenseEvent(alice, 'evt_expiring');
    await clientA.submitEvent(GROUP, event);
    expect(await clientB.fetchEvents(GROUP)).toHaveLength(1);

    clock += 61_000;
    relay.expire();
    expect(await clientB.fetchEvents(GROUP)).toHaveLength(0);
    expect(relay.stats().events).toBe(0);
  });

  it('lets only the creator remove a member, after which they lose access', async () => {
    const group = 'g_remove';
    await clientA.addMember(group, alice.deviceId);
    await clientA.addMember(group, bob.deviceId);
    expect((await clientB.listMembers(group)).length).toBe(2);

    await expect(clientB.removeMember(group, alice.deviceId)).rejects.toMatchObject({ status: 403 });
    await clientA.removeMember(group, bob.deviceId);

    await expect(clientB.fetchEvents(group)).rejects.toMatchObject({ status: 403 });
    const members = await clientA.listMembers(group);
    expect(members.map((m) => m.deviceId)).toEqual([alice.deviceId]);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await nodeHttpFetch(`${relay.url}/v1/groups/${GROUP}/events`, {
      method: 'GET',
      headers: {},
    });
    expect(response.status).toBe(401);
  });

  it('rate-limits a device', async () => {
    const limited = await startRelay({
      rateLimit: { max: 2, windowMs: 60_000 },
      now: () => clock,
    });
    try {
      const client = new RelayClient(limited.url, alice, nodeHttpFetch);
      await client.register();
      await client.addMember('g_rate', alice.deviceId);
      await expect(client.listMembers('g_rate')).resolves.toBeDefined();
      await expect(client.listMembers('g_rate')).rejects.toBeInstanceOf(RelayError);
    } finally {
      await limited.close();
    }
  });

  it('never exposes a public key as a group key', () => {
    // Guard against accidentally putting key material in membership data.
    const publicKeys = publicIdentity(alice);
    expect(JSON.stringify(publicKeys)).not.toContain(Buffer.from(groupKey.key).toString('hex'));
  });
});
