/**
 * Group keys and their per-device wrapping.
 *
 * A group has one symmetric key per epoch (32 bytes, XChaCha20-Poly1305).
 * The key never leaves a device in plaintext:
 *
 *   wrapGroupKey(groupKey, recipientEncryptionPublicKey)
 *     1. generates an ephemeral X25519 key pair,
 *     2. ECDH with the recipient's static X25519 key,
 *     3. HKDF-SHA256 → 32-byte wrapping key,
 *     4. XChaCha20-Poly1305 encrypts the group key with AAD binding the
 *        key id and both public keys.
 *
 * Only the holder of the recipient's X25519 private key can unwrap it.
 * Removing a member means rotating the group key and never wrapping the
 * new epoch for that device; old events stay readable only to holders of
 * the old epoch.
 *
 * Libraries: @noble/curves + @noble/ciphers + @noble/hashes. No custom
 * cipher is implemented here.
 */

import { x25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

import { fromHex, toHex, utf8ToBytes } from './encoding';

const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const WRAP_INFO = utf8ToBytes('billlens/group-key-wrap/v1');

export interface GroupKey {
  /** Public identifier of this epoch (not the key itself). */
  readonly keyId: string;
  readonly key: Uint8Array;
}

export interface WrappedGroupKey {
  readonly keyId: string;
  /** Ephemeral X25519 public key (hex). */
  readonly ephemeralPublicKey: string;
  /** Recipient X25519 public key (hex) — binds the wrap to one device. */
  readonly recipientPublicKey: string;
  readonly nonce: string;
  readonly ciphertext: string;
}

function keyIdFor(key: Uint8Array): string {
  return toHex(sha256(new Uint8Array([...utf8ToBytes('billlens/group-key-id/v1'), ...key]))).slice(0, 32);
}

export function generateGroupKey(key: Uint8Array = randomBytes(KEY_BYTES)): GroupKey {
  if (key.length !== KEY_BYTES) {
    throw new Error('Group keys must be 32 bytes.');
  }
  return { keyId: keyIdFor(key), key };
}

export function wrapGroupKey(
  groupKey: GroupKey,
  recipientEncryptionPublicKeyHex: string,
): WrappedGroupKey {
  const recipientPublicKey = fromHex(recipientEncryptionPublicKeyHex);
  const ephemeralPrivateKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  const shared = x25519.getSharedSecret(ephemeralPrivateKey, recipientPublicKey);
  const salt = sha256(new Uint8Array([...ephemeralPublicKey, ...recipientPublicKey]));
  const wrappingKey = hkdf(sha256, shared, salt, WRAP_INFO, KEY_BYTES);

  const nonce = randomBytes(NONCE_BYTES);
  const aad = utf8ToBytes(
    `billlens/group-key/v1:${groupKey.keyId}:${toHex(ephemeralPublicKey)}:${recipientEncryptionPublicKeyHex}`,
  );
  const ciphertext = xchacha20poly1305(wrappingKey, nonce, aad).encrypt(groupKey.key);

  return {
    keyId: groupKey.keyId,
    ephemeralPublicKey: toHex(ephemeralPublicKey),
    recipientPublicKey: recipientEncryptionPublicKeyHex,
    nonce: toHex(nonce),
    ciphertext: toHex(ciphertext),
  };
}

/**
 * Unwrap a group key with the recipient's X25519 private key.
 *
 * Throws on tampering (AEAD failure), a wrap addressed to another device,
 * or a malformed payload.
 */
export function unwrapGroupKey(
  wrapped: WrappedGroupKey,
  recipientEncryptionPrivateKey: Uint8Array,
): GroupKey {
  if (wrapped.recipientPublicKey !== toHex(x25519.getPublicKey(recipientEncryptionPrivateKey))) {
    throw new Error('Group key is wrapped for a different device.');
  }

  const ephemeralPublicKey = fromHex(wrapped.ephemeralPublicKey);
  const recipientPublicKey = fromHex(wrapped.recipientPublicKey);
  const shared = x25519.getSharedSecret(recipientEncryptionPrivateKey, ephemeralPublicKey);
  const salt = sha256(new Uint8Array([...ephemeralPublicKey, ...recipientPublicKey]));
  const wrappingKey = hkdf(sha256, shared, salt, WRAP_INFO, KEY_BYTES);
  const aad = utf8ToBytes(
    `billlens/group-key/v1:${wrapped.keyId}:${wrapped.ephemeralPublicKey}:${wrapped.recipientPublicKey}`,
  );

  const key = xchacha20poly1305(wrappingKey, fromHex(wrapped.nonce), aad).decrypt(
    fromHex(wrapped.ciphertext),
  );
  if (keyIdFor(key) !== wrapped.keyId) {
    throw new Error('Unwrapped group key does not match its key id.');
  }
  return { keyId: wrapped.keyId, key };
}

/**
 * A device's view of a group's keys, by epoch. Retaining old epochs lets
 * the device read history after a rotation; the current epoch is used for
 * new events.
 */
export class GroupKeyring {
  private readonly keys = new Map<string, Uint8Array>();
  private current: string | null = null;

  add(groupKey: GroupKey): void {
    this.keys.set(groupKey.keyId, groupKey.key);
    this.current = groupKey.keyId;
  }

  get(keyId: string): Uint8Array {
    const key = this.keys.get(keyId);
    if (key === undefined) throw new Error(`Unknown group key epoch: ${keyId}`);
    return key;
  }

  currentKey(): GroupKey {
    if (this.current === null) throw new Error('No group key installed.');
    return { keyId: this.current, key: this.get(this.current) };
  }

  /** Rotate to a fresh epoch and return it (old epochs remain readable). */
  rotate(): GroupKey {
    const next = generateGroupKey();
    this.add(next);
    return next;
  }

  epochs(): readonly string[] {
    return [...this.keys.keys()];
  }
}
