/**
 * Per-device cryptographic identity.
 *
 * Two key pairs per device, both derived from 32 bytes of entropy:
 *   - Ed25519 for event signatures (authenticity, non-repudiation within a
 *     group), and
 *   - X25519 for group-key wrapping (confidential key delivery).
 *
 * Private keys are returned as bytes and MUST be stored in SecureStore by
 * the platform layer; this module never persists anything.
 *
 * Libraries: @noble/curves (audited, pure JS). No custom primitives are
 * implemented here.
 */

import { ed25519, x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

import { fromHex, toHex } from './encoding';

export interface KeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

export interface DeviceIdentity {
  /** Stable id derived from the signing public key (not a secret). */
  readonly deviceId: string;
  readonly signing: KeyPair;
  readonly encryption: KeyPair;
}

export interface DevicePublicIdentity {
  readonly deviceId: string;
  readonly signingPublicKey: string;
  readonly encryptionPublicKey: string;
}

function deriveKeyPair(seed: Uint8Array, label: string): KeyPair {
  const privateKey = sha256(new Uint8Array([...seed, ...new TextEncoder().encode(label)]));
  return {
    privateKey,
    publicKey: label === 'sign' ? ed25519.getPublicKey(privateKey) : x25519.getPublicKey(privateKey),
  };
}

/**
 * Create a device identity.
 *
 * @param seed 32 bytes of entropy. Tests pass a fixed seed for
 *   reproducibility; production MUST omit it (`randomBytes(32)`).
 */
export function createDeviceIdentity(seed: Uint8Array = randomBytes(32)): DeviceIdentity {
  if (seed.length !== 32) {
    throw new Error('Device identity seed must be 32 bytes.');
  }
  const signing = deriveKeyPair(seed, 'sign');
  const encryption = deriveKeyPair(seed, 'enc');
  return {
    deviceId: deviceIdFromPublicKey(signing.publicKey),
    signing,
    encryption,
  };
}

/** Device id = SHA-256 of the signing public key, hex (64 chars). */
export function deviceIdFromPublicKey(signingPublicKey: Uint8Array): string {
  return toHex(sha256(signingPublicKey));
}

export function publicIdentity(identity: DeviceIdentity): DevicePublicIdentity {
  return {
    deviceId: identity.deviceId,
    signingPublicKey: toHex(identity.signing.publicKey),
    encryptionPublicKey: toHex(identity.encryption.publicKey),
  };
}

/** Sign arbitrary bytes with the device's Ed25519 key. */
export function signBytes(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/** Verify a signature. Returns false (never throws) on malformed input. */
export function verifyBytes(
  publicKeyHex: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, fromHex(publicKeyHex));
  } catch {
    return false;
  }
}
