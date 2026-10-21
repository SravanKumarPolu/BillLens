/**
 * Encrypted sync envelope v1.
 *
 * Wire shape (all binary values hex):
 *
 *   {
 *     header: { v, groupId, eventId, deviceId, keyId, createdAt },
 *     nonce, ciphertext, signature
 *   }
 *
 * The relay sees only this envelope. Expense amounts, titles, members and
 * splits are inside `ciphertext` (XChaCha20-Poly1305, group key, header as
 * associated data).
 *
 * Authenticity: the sender signs
 *   SHA-256(canonical(header) || nonce || ciphertext)
 * with its Ed25519 key. `open` verifies the signature and that
 * `header.deviceId` really is the hash of the signing key before it
 * decrypts anything — a relay cannot swap senders or tamper silently.
 *
 * Replay: `eventId` is the idempotency key; `eventDigest` covers the whole
 * envelope so a modified copy is treated as a different (and invalid)
 * event. `assertFreshness` bounds clock skew.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

import { bytesToUtf8, canonicalJson, fromHex, toHex, utf8ToBytes } from './encoding';
import { deviceIdFromPublicKey, signBytes, verifyBytes } from './device-identity';

export const ENVELOPE_VERSION = 1 as const;
const NONCE_BYTES = 24;

export interface SyncEventHeader {
  readonly v: typeof ENVELOPE_VERSION;
  readonly groupId: string;
  readonly eventId: string;
  readonly deviceId: string;
  readonly keyId: string;
  readonly createdAt: string;
}

export interface EncryptedSyncEvent {
  readonly header: SyncEventHeader;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly signature: string;
}

export interface CreateEventInput {
  readonly groupId: string;
  readonly eventId: string;
  readonly identity: {
    readonly deviceId: string;
    readonly signing: { readonly privateKey: Uint8Array };
  };
  readonly groupKey: { readonly keyId: string; readonly key: Uint8Array };
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt?: string;
}

export function createEncryptedEvent(input: CreateEventInput): EncryptedSyncEvent {
  const header: SyncEventHeader = {
    v: ENVELOPE_VERSION,
    groupId: input.groupId,
    eventId: input.eventId,
    deviceId: input.identity.deviceId,
    keyId: input.groupKey.keyId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const nonce = randomBytes(NONCE_BYTES);
  const aad = utf8ToBytes(canonicalJson(header));
  const plaintext = utf8ToBytes(JSON.stringify(input.payload));
  const ciphertext = seal(input.groupKey.key, nonce, aad, plaintext);

  const signature = signBytes(
    input.identity.signing.privateKey,
    signingDigest(header, nonce, ciphertext),
  );

  return {
    header,
    nonce: toHex(nonce),
    ciphertext: toHex(ciphertext),
    signature: toHex(signature),
  };
}

export interface OpenEventInput {
  /** Device public keys for the sender, from the relay's membership records. */
  readonly senderSigningPublicKey: string;
  readonly groupKey: { readonly keyId: string; readonly key: Uint8Array };
}

export interface OpenedSyncEvent {
  readonly header: SyncEventHeader;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Verify and decrypt an envelope. Fails closed: any signature, identity,
 * version or AEAD mismatch throws and no payload is returned.
 */
export function openEncryptedEvent(
  event: EncryptedSyncEvent,
  input: OpenEventInput,
): OpenedSyncEvent {
  const { header } = event;
  if (header.v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${String(header.v)}`);
  }
  if (header.keyId !== input.groupKey.keyId) {
    throw new Error('Envelope was encrypted with a different group-key epoch.');
  }
  if (deviceIdFromPublicKey(fromHex(input.senderSigningPublicKey)) !== header.deviceId) {
    throw new Error('Envelope sender does not match its signing key.');
  }

  const signatureOk = verifyBytes(
    input.senderSigningPublicKey,
    signingDigest(header, fromHex(event.nonce), fromHex(event.ciphertext)),
    fromHex(event.signature),
  );
  if (!signatureOk) {
    throw new Error('Envelope signature is invalid.');
  }

  const aad = utf8ToBytes(canonicalJson(header));
  const plaintext = openSeal(
    input.groupKey.key,
    fromHex(event.nonce),
    aad,
    fromHex(event.ciphertext),
  );

  const payload = JSON.parse(bytesToUtf8(plaintext)) as unknown;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Envelope payload must be a JSON object.');
  }
  return { header, payload: payload as Readonly<Record<string, unknown>> };
}

/** Stable digest of the whole envelope (dedupe + audit). */
export function eventDigest(event: EncryptedSyncEvent): string {
  return toHex(sha256(utf8ToBytes(canonicalJson(event))));
}

/**
 * Verify an envelope's signature only (no decryption).
 *
 * Relays use this to reject forged or re-attributed events before storing
 * them; they never possess the group key.
 */
export function verifyEventSignature(
  event: EncryptedSyncEvent,
  senderSigningPublicKey: string,
): boolean {
  try {
    const { header } = event;
    if (header.v !== ENVELOPE_VERSION) return false;
    if (deviceIdFromPublicKey(fromHex(senderSigningPublicKey)) !== header.deviceId) return false;
    return verifyBytes(
      senderSigningPublicKey,
      signingDigest(header, fromHex(event.nonce), fromHex(event.ciphertext)),
      fromHex(event.signature),
    );
  } catch {
    return false;
  }
}

/**
 * Reject events too far in the past/future. The relay keeps its own TTL;
 * this is the device-side replay/skew guard.
 */
export function assertFreshness(
  header: SyncEventHeader,
  now: Date,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): void {
  const created = Date.parse(header.createdAt);
  if (!Number.isFinite(created)) throw new Error('Envelope has an invalid createdAt.');
  const delta = now.getTime() - created;
  if (delta > maxAgeMs) throw new Error('Envelope is older than the allowed window.');
  if (delta < -5 * 60 * 1000) throw new Error('Envelope is timestamped in the future.');
}


function seal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
}

function openSeal(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  try {
    return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } catch {
    throw new Error('Envelope could not be decrypted (wrong key or tampered payload).');
  }
}

function signingDigest(
  header: SyncEventHeader,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  return sha256(
    new Uint8Array([
      ...utf8ToBytes(canonicalJson(header)),
      ...utf8ToBytes('.'),
      ...nonce,
      ...utf8ToBytes('.'),
      ...ciphertext,
    ]),
  );
}
