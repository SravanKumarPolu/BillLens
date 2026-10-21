/**
 * Invitations, key delivery, revocation and recovery — real relay + SQLite.
 *
 * Three independent device identities, separate SQLite stores and the
 * reference relay. No key material is ever placed in the invitation token;
 * keys travel only inside per-device wraps.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

import { GroupAccessService } from '@application/sync/group-access.service';
import {
  GroupKeyring,
  createDeviceIdentity,
  createEncryptedEvent,
  generateGroupKey,
  openEncryptedEvent,
  publicIdentity,
} from '@domain/sync-crypto';
import { RelayClient } from '@infrastructure/relay-reference/relay-client';
import { startRelay, type RelayHandle } from '@infrastructure/relay-reference/relay-server';
import { SqliteEncryptedSyncStore } from '@infrastructure/sqlite/sqlite-encrypted-sync-store';
import { runMigrations } from '@infrastructure/sqlite/schema';

import { nodeHttpFetch } from './node-http-fetch';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

jest.setTimeout(60_000);

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const GROUP = 'g_invites';
const NOW = new Date('2026-10-21T12:00:00.000Z');

const alice = createDeviceIdentity(new Uint8Array(32).fill(61));
const bob = createDeviceIdentity(new Uint8Array(32).fill(62));
const carol = createDeviceIdentity(new Uint8Array(32).fill(63));
const dave = createDeviceIdentity(new Uint8Array(32).fill(64));

interface DeviceHarness {
  readonly identity: ReturnType<typeof createDeviceIdentity>;
  readonly keyring: GroupKeyring;
  readonly access: GroupAccessService;
  readonly store: SqliteEncryptedSyncStore;
  readonly relay: RelayClient;
}

describeWithSqlite('secure group invitations and key recovery', () => {
  let dir: string;
  let relay: RelayHandle;

  async function harness(identity: ReturnType<typeof createDeviceIdentity>): Promise<DeviceHarness> {
    const database = new SqliteCliDatabase(join(dir, `${identity.deviceId.slice(0, 8)}.db`));
    await runMigrations(database);
    const store = new SqliteEncryptedSyncStore(database);
    const client = new RelayClient(relay.url, identity, nodeHttpFetch);
    const keyring = new GroupKeyring();
    const access = new GroupAccessService({
      identity,
      keyring,
      store,
      relay: client,
      now: () => NOW,
    });
    return { identity, keyring, access, store, relay: client };
  }

  let a: DeviceHarness;
  let b: DeviceHarness;
  let c: DeviceHarness;
  let d: DeviceHarness;
  let currentKeyId = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'billlens-invites-'));
    relay = await startRelay({ now: () => NOW.getTime() });
    a = await harness(alice);
    b = await harness(bob);
    c = await harness(carol);
    d = await harness(dave);

    const groupKey = generateGroupKey(new Uint8Array(32).fill(71));
    a.keyring.add(groupKey);
    currentKeyId = groupKey.keyId;

    await a.relay.register();
    await a.relay.addMember(GROUP, alice.deviceId);
  });

  afterAll(async () => {
    await relay.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('invites and adds a device without exposing key material in the token', async () => {
    const invite = await a.access.createInvite(GROUP);
    expect(JSON.stringify(invite)).not.toContain(Buffer.from(a.keyring.currentKey().key).toString('hex'));

    await b.access.acceptInvite({ invitation: invite, token: invite.token });

    const members = await a.relay.listMembers(GROUP);
    expect(members.map((m) => m.deviceId).sort()).toEqual(
      [alice.deviceId, bob.deviceId].sort(),
    );
  });

  it('delivers the group key through the keybox and decrypts an event on B', async () => {
    await a.access.deliverKey(GROUP, bob.deviceId);
    const received = await b.access.receiveKeys(GROUP);
    expect(received.map((k) => k.keyId)).toContain(currentKeyId);
    expect(b.keyring.currentKey().keyId).toBe(currentKeyId);

    const event = createEncryptedEvent({
      groupId: GROUP,
      eventId: 'evt_invite_probe',
      identity: alice,
      groupKey: b.keyring.currentKey(),
      payload: { type: 'probe', amountMinor: 300 },
      createdAt: NOW.toISOString(),
    });
    // B can decrypt with the delivered key (proves the wrap was correct).
    const opened = openEncryptedEvent(event, {
      senderSigningPublicKey: publicIdentity(alice).signingPublicKey,
      groupKey: b.keyring.currentKey(),
    });
    expect(opened.payload.type).toBe('probe');
  });

  it('uses a one-time invitation and rejects replay', async () => {
    const invite = await a.access.createInvite(GROUP);
    await c.access.acceptInvite({ invitation: invite, token: invite.token });
    await expect(c.access.acceptInvite({ invitation: invite, token: invite.token })).rejects.toThrow();
  });

  it('revokes a member, blocks access and rotates the key', async () => {
    const before = a.keyring.currentKey().keyId;
    const next = await a.access.revokeMember(GROUP, bob.deviceId);

    expect(next.keyId).not.toBe(before);
    expect(a.keyring.currentKey().keyId).toBe(next.keyId);
    await expect(b.relay.fetchEvents(GROUP)).rejects.toMatchObject({ status: 403 });
    // The removed device never receives the new epoch (and cannot fetch).
    await expect(b.access.receiveKeys(GROUP)).rejects.toMatchObject({ status: 403 });
  });

  it('recovers a new device through an authorised member', async () => {
    const invite = await a.access.createInvite(GROUP);
    await d.access.acceptInvite({ invitation: invite, token: invite.token });

    const recovery = await a.access.recoverForDevice(GROUP, dave.deviceId);
    expect(recovery.keyId).toBe(a.keyring.currentKey().keyId);

    const received = await d.access.receiveKeys(GROUP);
    expect(received.map((k) => k.keyId)).toContain(a.keyring.currentKey().keyId);
  });

  it('cannot recover without an authorised key holder', async () => {
    const empty = new GroupKeyring();
    const orphan = new GroupAccessService({
      identity: createDeviceIdentity(new Uint8Array(32).fill(65)),
      keyring: empty,
      store: d.store,
      relay: d.relay,
      now: () => NOW,
    });
    await expect(orphan.recoverForDevice(GROUP, 'device_x')).rejects.toThrow(/no group key/i);
  });
});
