/**
 * Local image normalisation for camera and gallery input.
 *
 * `expo-image-picker` can return Android `content://` URIs. The modern
 * `expo-file-system` `File` class only reliably reads app-local
 * `file://` paths, so validation/OCR failed with "image could not be read
 * from storage" for gallery picks.
 *
 * This helper copies any non-local URI into the app cache with a
 * collision-resistant name and verifies the copy exists and is non-empty.
 * The original file is never deleted.
 *
 * Uses the legacy filesystem API **only** for `copyAsync`, which still
 * supports `content://` sources on Android; all reads afterwards use the
 * modern `File` API.
 */

import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const;

function extensionFor(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
  return (EXTENSIONS as readonly string[]).includes(ext) ? ext : 'jpg';
}

function cacheDirectory(): string {
  const dir = LegacyFileSystem.cacheDirectory;
  if (dir === null || dir.length === 0) {
    throw new Error('No cache directory is available to store the image.');
  }
  return dir;
}

/**
 * Returns a readable `file://` URI for the image, copying it into the app
 * cache when the source is a `content://` URI, a stale path, or otherwise
 * unreadable by the modern File API.
 */
export async function ensureLocalImage(
  uri: string,
  purpose: 'capture' | 'gallery' | 'image' = 'image',
): Promise<string> {
  const trimmed = uri.trim();
  if (trimmed.length === 0) {
    throw new Error('No image was provided.');
  }

  // Fast path: an existing app-local file.
  if (trimmed.startsWith('file://')) {
    try {
      const file = new File(trimmed);
      const info = file.info();
      if (info.exists && (info.size ?? 0) > 0) return trimmed;
    } catch {
      // Fall through to the copy path (stale/invalid file URI).
    }
  }

  const dir = `${cacheDirectory()}billlens-images/`;
  await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const destination = `${dir}${purpose}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extensionFor(trimmed)}`;

  await LegacyFileSystem.copyAsync({ from: trimmed, to: destination });

  const info = await LegacyFileSystem.getInfoAsync(destination);
  if (!info.exists || (info.size ?? 0) <= 0) {
    throw new Error('The copied image is missing or empty.');
  }
  return destination;
}

/** Delete a cached copy after processing/cancellation (best effort). */
export async function removeLocalImage(uri: string): Promise<void> {
  if (!uri.startsWith('file://')) return;
  await LegacyFileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
