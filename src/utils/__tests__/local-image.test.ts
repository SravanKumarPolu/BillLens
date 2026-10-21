/**
 * Local image normalisation tests.
 *
 * The reported device failure was a `content://` gallery URI reaching the
 * modern File API. These tests pin the copy/verify behaviour with mocked
 * filesystem primitives (the real module needs a native runtime).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFileInfo = jest.fn<(uri: string) => unknown>();
const mockCopyAsync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMakeDirectoryAsync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockGetInfoAsync = jest.fn<(...args: unknown[]) => Promise<{ exists: boolean; size?: number }>>();

jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((uri: unknown) => ({
    uri,
    info: () => mockFileInfo(String(uri)),
  })),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: 'file:///cache/',
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: jest.fn(),
}));

import { ensureLocalImage } from '../local-image';

beforeEach(() => {
  jest.clearAllMocks();
  mockFileInfo.mockReset();
  mockFileInfo.mockReturnValue({ exists: false });
  mockMakeDirectoryAsync.mockResolvedValue(undefined);
  mockCopyAsync.mockReset();
  mockCopyAsync.mockResolvedValue(undefined);
  mockGetInfoAsync.mockReset();
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
});

describe('ensureLocalImage', () => {
  it('returns an existing non-empty file URI untouched', async () => {
    mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
    await expect(ensureLocalImage('file:///tmp/a.jpg')).resolves.toBe('file:///tmp/a.jpg');
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('copies a content:// URI into the app cache and verifies it', async () => {
    mockFileInfo.mockReturnValue({ exists: false });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 2048 });
    mockCopyAsync.mockResolvedValue(undefined);

    const result = await ensureLocalImage('content://media/external/images/1', 'gallery');

    expect(result).toMatch(/^file:\/\/\/cache\/billlens-images\/gallery-/);
    expect(result.endsWith('.jpg')).toBe(true);
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'content://media/external/images/1',
      to: result,
    });
    expect(mockGetInfoAsync).toHaveBeenCalledWith(result);
  });

  it('rejects an empty copy instead of handing a broken URI downstream', async () => {
    mockFileInfo.mockReturnValue({ exists: false });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });
    mockCopyAsync.mockResolvedValue(undefined);

    await expect(ensureLocalImage('content://media/external/images/2')).rejects.toThrow(
      /missing or empty/,
    );
  });

  it('propagates copy failures', async () => {
    mockFileInfo.mockReturnValue({ exists: false });
    mockCopyAsync.mockRejectedValue(new Error('permission denied'));

    await expect(ensureLocalImage('content://media/external/images/3')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('rejects an empty URI', async () => {
    await expect(ensureLocalImage('  ')).rejects.toThrow(/No image/);
  });
});
