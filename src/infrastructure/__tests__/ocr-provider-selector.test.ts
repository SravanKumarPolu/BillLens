/**
 * OCR provider selector tests (v2.5.0).
 *
 * Covers the production mock guard: mock OCR may only be selected in
 * non-production environments (allowMock: true); production builds
 * resolve to `remote` or an explicit `unavailable` state — never a
 * silent fallback to sample data presented as a real scan.
 */

import { describe, expect, it } from '@jest/globals';

import {
  OCR_EDGE_FUNCTION_PATH,
  resolveOcrProvider,
} from '@infrastructure/capture/ocr-provider-selector';
import {
  UnavailableCaptureProcessor,
} from '@infrastructure/capture/unavailable-capture-processor';

const loadImage = async () => '';

describe('resolveOcrProvider (development — allowMock: true)', () => {
  it('selects the mock processor when nothing is configured', () => {
    const selection = resolveOcrProvider({
      supabaseUrl: '',
      supabaseAnonKey: '',
      allowMock: true,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('mock');
    expect(selection.reason).toContain('No Supabase project configured');
    expect(selection.reason).toContain('mock processor');
  });

  it('selects remote OCR when a Supabase project is configured', () => {
    const selection = resolveOcrProvider({
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon',
      allowMock: true,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('remote');
    expect(selection.endpoint).toBe(`https://demo.supabase.co${OCR_EDGE_FUNCTION_PATH}`);
  });

  it('respects an explicit mock override even when configured', () => {
    const selection = resolveOcrProvider({
      modeOverride: 'mock',
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon',
      allowMock: true,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('mock');
    expect(selection.reason).toContain('EXPO_PUBLIC_OCR_MODE=mock');
  });

  it('normalises trailing slashes in the endpoint URL', () => {
    const selection = resolveOcrProvider({
      supabaseUrl: 'https://demo.supabase.co///',
      supabaseAnonKey: 'anon',
      allowMock: true,
      loadImageBase64: loadImage,
    });
    expect(selection.endpoint).toBe(`https://demo.supabase.co${OCR_EDGE_FUNCTION_PATH}`);
  });
});

describe('resolveOcrProvider (production — allowMock: false)', () => {
  it('resolves to UNAVAILABLE when nothing is configured — never mock', () => {
    const selection = resolveOcrProvider({
      supabaseUrl: '',
      supabaseAnonKey: '',
      allowMock: false,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('unavailable');
    expect(selection.processor).toBeInstanceOf(UnavailableCaptureProcessor);
    expect(selection.reason).toContain('receipt scanning is unavailable');
  });

  it('resolves to UNAVAILABLE when remote is forced but unconfigured — never mock', () => {
    const selection = resolveOcrProvider({
      modeOverride: 'remote',
      supabaseUrl: '',
      supabaseAnonKey: '',
      allowMock: false,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('unavailable');
    expect(selection.reason).toContain('no Supabase project is configured');
  });

  it('REFUSES an explicit mock override in production', () => {
    const selection = resolveOcrProvider({
      modeOverride: 'mock',
      supabaseUrl: '',
      supabaseAnonKey: '',
      allowMock: false,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('unavailable');
    expect(selection.reason).toContain('not permitted in production');
  });

  it('refuses mock in production even when a project IS configured (explicit override)', () => {
    const selection = resolveOcrProvider({
      modeOverride: 'mock',
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon',
      allowMock: false,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('unavailable');
  });

  it('resolves to remote in production when configured', () => {
    const selection = resolveOcrProvider({
      supabaseUrl: 'https://prod.supabase.co',
      supabaseAnonKey: 'anon',
      allowMock: false,
      loadImageBase64: loadImage,
    });
    expect(selection.mode).toBe('remote');
    expect(selection.endpoint).toBe(`https://prod.supabase.co${OCR_EDGE_FUNCTION_PATH}`);
  });
});

describe('UnavailableCaptureProcessor', () => {
  it('rejects every process() call with a typed NOT_CONFIGURED error', async () => {
    const processor = new UnavailableCaptureProcessor();
    await expect(
      processor.process({
        captureSourceId: 'capture-1' as never,
        imageUri: 'file:///receipt.jpg',
        sourceType: 'paper_receipt',
      }),
    ).rejects.toMatchObject({
      name: 'OcrCaptureError',
      code: 'NOT_CONFIGURED',
      retriable: false,
    });
  });
});
