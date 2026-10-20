/**
 * evaluateImageQuality tests — the technical pre-flight gate (v2.4.0).
 */

import { describe, expect, it } from '@jest/globals';

import { evaluateImageQuality } from '@application/capture';

describe('evaluateImageQuality', () => {
  it('passes a healthy image with no warnings', () => {
    const result = evaluateImageQuality({ sizeBytes: 2 * 1024 * 1024, mimeType: 'image/jpeg' });
    expect(result.warnings).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });

  it('blocks an implausibly small (corrupt) image', () => {
    const result = evaluateImageQuality({ sizeBytes: 2 * 1024 });
    expect(result.blocked).toBe(true);
    expect(result.warnings[0]?.kind).toBe('unsupported');
  });

  it('blocks an image above the 10 MB budget', () => {
    const result = evaluateImageQuality({ sizeBytes: 11 * 1024 * 1024, mimeType: 'image/jpeg' });
    expect(result.blocked).toBe(true);
    expect(result.warnings[0]?.message).toContain('10 MB');
  });

  it('blocks unsupported media types', () => {
    const result = evaluateImageQuality({ sizeBytes: 500 * 1024, mimeType: 'image/gif' });
    expect(result.blocked).toBe(true);
    expect(result.warnings[0]?.message).toContain('image/gif');
  });

  it('accepts all supported formats', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
      const result = evaluateImageQuality({ sizeBytes: 500 * 1024, mimeType });
      expect(result.blocked).toBe(false);
    }
  });

  it('tolerates an unknown mime type (extension sniffing may fail)', () => {
    const result = evaluateImageQuality({ sizeBytes: 500 * 1024 });
    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});
