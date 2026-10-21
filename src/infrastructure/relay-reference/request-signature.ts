/**
 * Signed HTTP requests between a device and the relay.
 *
 * Every authenticated call signs:
 *   `${method}\n${path}\n${sha256(body)}`
 * with the device's Ed25519 key. The relay looks the device up by
 * `x-device-id` and verifies with its registered public key, so a stolen
 * bearer token is not enough — the caller must hold the device key.
 */

import type { DeviceIdentity } from '@domain/sync-crypto';
import { fromHex, signBytes, toHex, verifyBytes } from '@domain/sync-crypto';

export const DEVICE_ID_HEADER = 'x-device-id';
export const SIGNATURE_HEADER = 'x-signature';

export interface SignedRequestHeaders {
  readonly [DEVICE_ID_HEADER]: string;
  readonly [SIGNATURE_HEADER]: string;
}

function messageFor(method: string, path: string, body: string): Uint8Array {
  return new TextEncoder().encode(`${method.toUpperCase()}\n${path}\n${body}`);
}

export function signRequest(
  identity: DeviceIdentity,
  method: string,
  path: string,
  body: string,
): SignedRequestHeaders {
  const signature = signBytes(
    identity.signing.privateKey,
    messageFor(method, path, body),
  );
  return {
    [DEVICE_ID_HEADER]: identity.deviceId,
    [SIGNATURE_HEADER]: toHex(signature),
  };
}

export function verifyRequest(
  signingPublicKeyHex: string,
  method: string,
  path: string,
  body: string,
  signatureHex: string,
): boolean {
  try {
    return verifyBytes(
      signingPublicKeyHex,
      messageFor(method, path, body),
      fromHex(signatureHex),
    );
  } catch {
    return false;
  }
}
