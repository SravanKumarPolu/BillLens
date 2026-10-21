/**
 * Encrypted local backup envelope.
 *
 * Established primitives only: PBKDF2-HMAC-SHA256 (210k iterations) derives a
 * 256-bit key, XChaCha20-Poly1305 provides authenticated encryption. The
 * header is bound as AAD, so format/KDF/iteration tampering fails closed.
 * Hex encoding keeps the envelope JSON-safe on Hermes without base64 shims.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

import { bytesToUtf8, fromHex, toHex, utf8ToBytes } from '@domain/sync-crypto/encoding';

export const BACKUP_ENVELOPE_FORMAT = 'billlens-encrypted-backup';
export const BACKUP_ENVELOPE_VERSION = 1;
export const BACKUP_KDF = 'pbkdf2-sha256';
export const BACKUP_KDF_ITERATIONS = 210_000;

export interface BackupEnvelope {
  readonly format: typeof BACKUP_ENVELOPE_FORMAT;
  readonly version: typeof BACKUP_ENVELOPE_VERSION;
  readonly kdf: typeof BACKUP_KDF;
  readonly iterations: number;
  readonly saltHex: string;
  readonly nonceHex: string;
  readonly ciphertextHex: string;
}

function aad(envelope: Omit<BackupEnvelope, 'nonceHex' | 'ciphertextHex'>): Uint8Array {
  return utf8ToBytes(
    `${envelope.format}|${envelope.version}|${envelope.kdf}|${envelope.iterations}|${envelope.saltHex}`,
  );
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (password.length < 8) throw new Error('Backup password must be at least 8 characters.');
  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: BACKUP_KDF_ITERATIONS,
    dkLen: 32,
  });
}

export async function encryptBackup(
  plaintextJson: string,
  password: string,
): Promise<BackupEnvelope> {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = await deriveKey(password, salt);
  const header = {
    format: BACKUP_ENVELOPE_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    kdf: BACKUP_KDF,
    iterations: BACKUP_KDF_ITERATIONS,
    saltHex: toHex(salt),
  } as const;
  const ciphertext = xchacha20poly1305(key, nonce, aad(header)).encrypt(
    utf8ToBytes(plaintextJson),
  );
  return { ...header, nonceHex: toHex(nonce), ciphertextHex: toHex(ciphertext) };
}

function parseEnvelope(value: unknown): BackupEnvelope {
  if (typeof value !== 'object' || value === null) throw new Error('Not a BillLens backup.');
  const record = value as Record<string, unknown>;
  if (record.format !== BACKUP_ENVELOPE_FORMAT) throw new Error('Not a BillLens backup.');
  if (record.version !== BACKUP_ENVELOPE_VERSION) {
    throw new Error('This backup version is not supported by this app version.');
  }
  if (record.kdf !== BACKUP_KDF) throw new Error('Unsupported backup key derivation.');
  if (record.iterations !== BACKUP_KDF_ITERATIONS) {
    throw new Error('Unsupported backup KDF parameters.');
  }
  for (const field of ['saltHex', 'nonceHex', 'ciphertextHex']) {
    if (typeof record[field] !== 'string' || (record[field] as string).length === 0) {
      throw new Error('Backup file is incomplete or corrupted.');
    }
  }
  return {
    format: BACKUP_ENVELOPE_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    kdf: BACKUP_KDF,
    iterations: BACKUP_KDF_ITERATIONS,
    saltHex: record.saltHex as string,
    nonceHex: record.nonceHex as string,
    ciphertextHex: record.ciphertextHex as string,
  };
}

export async function decryptBackup(
  envelopeJson: string,
  password: string,
): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeJson);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  const envelope = parseEnvelope(parsed);
  const key = await deriveKey(password, fromHex(envelope.saltHex));
  try {
    const plaintext = xchacha20poly1305(key, fromHex(envelope.nonceHex), aad(envelope)).decrypt(
      fromHex(envelope.ciphertextHex),
    );
    return bytesToUtf8(plaintext);
  } catch {
    throw new Error('Wrong password, or the backup file is corrupted.');
  }
}
