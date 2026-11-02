/**
 * Expo-backed implementations of the capture pipeline's image ports
 * (v2.4.0).
 *
 * - `ExpoImageDataReader` reads image bytes as base64 through
 *   expo-file-system's current `File` API (SDK 54) — no deprecated
 *   legacy `FileSystem.*` calls.
 * - `ExpoImageHasher` fingerprints the base64 payload with SHA-256 via
 *   expo-crypto. The hash is over the CANONICAL base64 encoding of the
 *   file (expo-crypto digests strings, not byte streams); identical
 *   files always produce identical hashes, which is the duplicate-detection
 *   contract. The `sha256-b64:` prefix documents the canonicalisation.
 *
 * Both classes are thin adapters over native modules and are deliberately
 * NOT unit-tested — the application layer tests inject fakes for these
 * ports instead (the same pattern as ExpoSqliteDatabase).
 */

import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { ensureLocalImage } from '@utils/local-image';

import type {
  CapturedImageData,
  ImageDataReader,
  ImageHasher,
} from '@application/capture/process-capture.usecase';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function inferMime(uri: string): string | undefined {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return undefined;
  return MIME_BY_EXTENSION[clean.slice(dot + 1).toLowerCase()] ?? undefined;
}

export class ExpoImageDataReader implements ImageDataReader {
  async read(uri: string): Promise<CapturedImageData> {
    // Gallery picks may be Android `content://` URIs whose permission is
    // gone by the time OCR runs. Normalise to an app-local file first; this
    // also gives a clear error for missing/empty/corrupt files.
    const localUri = await ensureLocalImage(uri, 'image');
    const file = new File(localUri);
    const info = file.info();
    if (!info.exists || (info.size ?? 0) <= 0) {
      throw new Error(`Image file not found or empty: ${uri}`);
    }
    const base64 = await file.base64();
    if (base64.length === 0) {
      throw new Error(`Image could not be decoded: ${uri}`);
    }
    const mimeType = inferMime(localUri);
    return {
      base64,
      sizeBytes: info.size ?? Math.floor((base64.length * 3) / 4),
      ...(mimeType !== undefined ? { mimeType } : {}),
    };
  }
}

export class ExpoImageHasher implements ImageHasher {
  async hashImageBase64(base64: string): Promise<string> {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64,
    );
    return `sha256-b64:${digest}`;
  }
}
