/**
 * Encrypted sync primitives — unit tests.
 *
 * Covers device identity, group-key wrapping, envelope authenticity,
 * tamper detection and replay/freshness guards. These are the guarantees
 * the relay relies on; the relay itself never sees plaintext.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GroupKeyring,
  assertFreshness,
  createDeviceIdentity,
  createEncryptedEvent,
  deviceIdFromPublicKey,
  eventDigest,
  generateGroupKey,
  openEncryptedEvent,
  publicIdentity,
  signBytes,
  unwrapGroupKey,
  verifyBytes,
  wrapGroupKey,
} from '@domain/sync-crypto';

const SEED_A = new Uint8Array(32).fill(1);
const SEED_B = new Uint8Array(32).fill(2);
const SEED_C = new Uint8Array(32).fill(3);

const alice = createDeviceIdentity(SEED_A);
const bob = createDeviceIdentity(SEED_B);
const carol = createDeviceIdentity(SEED_C);
const groupKey = generateGroupKey(new Uint8Array(32).fill(9));

describe('device identity', () => {
  it('derives a stable device id from the signing key', () => {
    expect(alice.deviceId).toBe(deviceIdFromPublicKey(alice.signing.publicKey));
    expect(createDeviceIdentity(SEED_A).deviceId).toBe(alice.deviceId);
    expect(bob.deviceId).not.toBe(alice.deviceId);
  });

  it('signs and verifies, and rejects a modified message', () => {
    const message = new TextEncoder().encode('expense:42');
    const signature = signBytes(alice.signing.privateKey, message);
    const publicKey = publicIdentity(alice).signingPublicKey;
    expect(verifyBytes(publicKey, message, signature)).toBe(true);
    expect(verifyBytes(publicKey, new TextEncoder().encode('expense:43'), signature)).toBe(false);
    expect(verifyBytes(publicIdentity(bob).signingPublicKey, message, signature)).toBe(false);
  });
});

describe('group key wrapping', () => {
  it('delivers the key only to the addressed device', () => {
    const wrapped = wrapGroupKey(groupKey, publicIdentity(bob).encryptionPublicKey);
    const unwrapped = unwrapGroupKey(wrapped, bob.encryption.privateKey);
    expect(unwrapped.keyId).toBe(groupKey.keyId);
    expect(Buffer.from(unwrapped.key).toString('hex')).toBe(Buffer.from(groupKey.key).toString('hex'));

    expect(() => unwrapGroupKey(wrapped, carol.encryption.privateKey)).toThrow(/different device/);
  });

  it('rejects a tampered wrap', () => {
    const wrapped = wrapGroupKey(groupKey, publicIdentity(bob).encryptionPublicKey);
    const tampered = { ...wrapped, ciphertext: `${wrapped.ciphertext.slice(0, -2)}00` };
    expect(() => unwrapGroupKey(tampered, bob.encryption.privateKey)).toThrow();
  });

  it('rotates epochs while keeping history readable', () => {
    const keyring = new GroupKeyring();
    keyring.add(groupKey);
    const oldId = groupKey.keyId;
    const next = keyring.rotate();

    expect(next.keyId).not.toBe(oldId);
    expect(keyring.epochs()).toEqual([oldId, next.keyId]);
    expect(keyring.currentKey().keyId).toBe(next.keyId);
    expect(keyring.get(oldId)).toEqual(groupKey.key);
  });
});

describe('encrypted envelope', () => {
  const payload = { type: 'expense.created', amountMinor: 120_000, currency: 'INR' };

  function build(identity = alice, key = groupKey, eventId = 'evt_1') {
    return createEncryptedEvent({
      groupId: 'group_1',
      eventId,
      identity,
      groupKey: key,
      payload,
      createdAt: '2026-10-21T10:00:00.000Z',
    });
  }

  it('round-trips a payload and hides it on the wire', () => {
    const event = build();
    expect(JSON.stringify(event)).not.toContain('120000');
    expect(JSON.stringify(event)).not.toContain('expense.created');

    const opened = openEncryptedEvent(event, {
      senderSigningPublicKey: publicIdentity(alice).signingPublicKey,
      groupKey,
    });
    expect(opened.payload).toEqual(payload);
    expect(opened.header.deviceId).toBe(alice.deviceId);
  });

  it('rejects tampered ciphertext', () => {
    const event = build();
    const tampered = { ...event, ciphertext: `${event.ciphertext.slice(0, -2)}00` };
    expect(() =>
      openEncryptedEvent(tampered, {
        senderSigningPublicKey: publicIdentity(alice).signingPublicKey,
        groupKey,
      }),
    ).toThrow(/signature is invalid|decrypted/);
  });

  it('rejects a sender swap (relay cannot re-attribute an event)', () => {
    const event = build();
    expect(() =>
      openEncryptedEvent(event, {
        senderSigningPublicKey: publicIdentity(bob).signingPublicKey,
        groupKey,
      }),
    ).toThrow(/sender does not match/);
  });

  it('rejects a different key epoch', () => {
    const event = build();
    const other = generateGroupKey(new Uint8Array(32).fill(7));
    expect(() =>
      openEncryptedEvent(event, {
        senderSigningPublicKey: publicIdentity(alice).signingPublicKey,
        groupKey: other,
      }),
    ).toThrow(/epoch/);
  });

  it('produces a stable digest for dedupe and a different one when altered', () => {
    const event = build();
    expect(eventDigest(event)).toBe(eventDigest({ ...event }));
    expect(eventDigest({ ...event, nonce: `${event.nonce.slice(0, -2)}00` })).not.toBe(
      eventDigest(event),
    );
  });

  it('enforces the freshness window', () => {
    const event = build();
    const now = new Date('2026-10-22T10:00:00.000Z');
    expect(() => assertFreshness(event.header, now)).not.toThrow();
    expect(() => assertFreshness(event.header, new Date('2026-12-01T00:00:00.000Z'))).toThrow(
      /older/,
    );
  });
});
