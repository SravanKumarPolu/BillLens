/**
 * Byte/JSON helpers shared by the sync-crypto modules.
 *
 * Hex is used for every serialised key, nonce and ciphertext so the
 * envelope is JSON-safe on React Native (no Buffer, no base64 shims).
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export { bytesToHex as toHex, hexToBytes as fromHex };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8ToBytes(value: string): Uint8Array {
  return encoder.encode(value);
}

export function bytesToUtf8(value: Uint8Array): string {
  return decoder.decode(value);
}

/**
 * Deterministic JSON: object keys sorted recursively.
 *
 * Signatures and AEAD associated data must not depend on property order,
 * otherwise a harmless re-serialisation invalidates every signature.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Structural equality for small JSON records (used in tests). */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
