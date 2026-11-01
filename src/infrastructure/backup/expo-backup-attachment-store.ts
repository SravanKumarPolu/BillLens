/**
 * Receipt attachment storage for encrypted backups.
 *
 * Reads are bounded by the caller; writes go to app-managed document storage
 * using the legacy base64 API (modern File.write is text-only for strings).
 * No plaintext archive is ever created.
 */

import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

export interface BackupAttachmentBytes {
  readonly base64: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface BackupAttachmentStore {
  read(uri: string): Promise<BackupAttachmentBytes | null>;
  write(id: string, base64: string, extension: string): Promise<string>;
  remove(uri: string): Promise<void>;
  availableBytes(): Promise<number | null>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const ALLOWED = new Set(Object.keys(MIME_BY_EXTENSION));

export function attachmentExtension(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : 'jpg';
  return ALLOWED.has(ext) ? ext : 'jpg';
}

/** Base64-prefix magic check; HEIC brands start with an `ftyp` box. */
export function looksLikeSupportedImage(base64: string, extension: string): boolean {
  if (base64.length < 16) return false;
  if (base64.startsWith('/9j/')) return true; // JPEG
  if (base64.startsWith('iVBOR')) return true; // PNG
  if (base64.startsWith('R0lGOD')) return true; // GIF
  if (base64.startsWith('UklGR')) return true; // WebP
  if (extension === 'heic' || extension === 'heif') {
    return base64.startsWith('AAAA') && base64.slice(0, 240).includes('ZnR5cA');
  }
  return false;
}

export class ExpoBackupAttachmentStore implements BackupAttachmentStore {
  async read(uri: string): Promise<BackupAttachmentBytes | null> {
    try {
      const file = new File(uri);
      const info = file.info();
      if (!info.exists) return null;
      if ((info.size ?? 0) <= 0) throw new Error('Receipt image is empty.');
      const base64 = await file.base64();
      const extension = attachmentExtension(uri);
      return {
        base64,
        sizeBytes: info.size ?? 0,
        mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
      };
    } catch (error) {
      if (error instanceof Error && /not found|no such file|does not exist|empty|invalid/i.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async write(id: string, base64: string, extension: string): Promise<string> {
    const dir = `${Paths.document.uri.replace(/\/$/, '')}/billlens-restored-receipts/`;
    await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const destination = `${dir}${safeId}.${ALLOWED.has(extension) ? extension : 'jpg'}`;
    await LegacyFileSystem.writeAsStringAsync(destination, base64, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
    const info = new File(destination).info();
    if (!info.exists || (info.size ?? 0) <= 0) {
      throw new Error('Restored receipt image could not be written.');
    }
    return destination;
  }

  async remove(uri: string): Promise<void> {
    await LegacyFileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }

  async availableBytes(): Promise<number | null> {
    const value = Paths.availableDiskSpace;
    return Number.isFinite(value) ? value : null;
  }
}
