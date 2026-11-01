/**
 * Capture store tests (Prompt 17).
 *
 * Exercises the ephemeral capture store: default storage mode,
 * processing lifecycle (idle → processing → failed → idle), and the
 * indeterminate status message cycling helpers.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { PROCESSING_STATUS_MESSAGES, useCaptureStore } from '@store/capture-store';

describe('capture store', () => {
  beforeEach(() => {
    useCaptureStore.getState().resetProcessing();
    useCaptureStore.getState().setDefaultStorageMode('local_only');
  });

  describe('default storage mode', () => {
    it('starts at local_only', () => {
      expect(useCaptureStore.getState().defaultStorageMode).toBe('local_only');
    });

    it('updates when set', () => {
      useCaptureStore.getState().setDefaultStorageMode('cloud_private');
      expect(useCaptureStore.getState().defaultStorageMode).toBe('cloud_private');
    });
  });

  describe('processing lifecycle', () => {
    it('starts idle with the first status message', () => {
      const processing = useCaptureStore.getState().processing;
      expect(processing.status).toBe('idle');
      expect(processing.statusMessage).toBe(PROCESSING_STATUS_MESSAGES[0]);
      expect(processing.errorMessage).toBeNull();
    });

    it('transitions to processing with startProcessing', () => {
      useCaptureStore.getState().startProcessing();
      const processing = useCaptureStore.getState().processing;
      expect(processing.status).toBe('processing');
      expect(processing.errorMessage).toBeNull();
      expect(processing.statusMessage).toBe(PROCESSING_STATUS_MESSAGES[0]);
    });

    it('updates the status message without changing the status', () => {
      useCaptureStore.getState().startProcessing();
      useCaptureStore.getState().setProcessingMessage(PROCESSING_STATUS_MESSAGES[2]!);
      const processing = useCaptureStore.getState().processing;
      expect(processing.status).toBe('processing');
      expect(processing.statusMessage).toBe(PROCESSING_STATUS_MESSAGES[2]);
    });

    it('transitions to failed with an error message', () => {
      useCaptureStore.getState().startProcessing();
      useCaptureStore.getState().failProcessing('Could not read the receipt.');
      const processing = useCaptureStore.getState().processing;
      expect(processing.status).toBe('failed');
      expect(processing.errorMessage).toBe('Could not read the receipt.');
      expect(processing.statusMessage).toBe('Processing failed');
    });

    it('returns to idle on resetProcessing', () => {
      useCaptureStore.getState().failProcessing('boom');
      useCaptureStore.getState().resetProcessing();
      const processing = useCaptureStore.getState().processing;
      expect(processing.status).toBe('idle');
      expect(processing.errorMessage).toBeNull();
    });
  });

  describe('PROCESSING_STATUS_MESSAGES', () => {
    it('exposes every expected stage in order', () => {
      expect(PROCESSING_STATUS_MESSAGES).toEqual([
        'Preparing image',
        'Reading text',
        'Understanding document',
        'Checking totals',
        'Creating draft',
      ]);
    });
  });
});
