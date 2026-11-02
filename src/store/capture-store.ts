/**
 * Capture store.
 *
 * Holds ephemeral capture-pipeline UI state:
 *   - `defaultStorageMode` — the user's default receipt-privacy preference
 *     for new captures. NOT persisted — privacy defaults can also be set
 *     per-group (via the group store) and per-capture (via the capture
 *     flow), so the global default is read at capture start time.
 *     Persisting it would create two sources of truth; instead, it
 *     starts at the safest default (`local_only`) and is updated in
 *     memory by the settings screen.
 *   - `processing` — the current capture-processing lifecycle state.
 *     Used by `ProcessingScreen` to show indeterminate progress and the
 *     failure UI.
 *
 * Both pieces of state are ephemeral and re-derived on every app launch,
 * so this store is NOT persisted.
 */

import { create } from 'zustand';

import type { StorageMode } from '@presentation/view-models/groups';

/** Status of the current capture-processing run. */
export type ProcessingStatus = 'idle' | 'processing' | 'failed';

/** Indeterminate status messages cycled by `ProcessingScreen`. */
export const PROCESSING_STATUS_MESSAGES: readonly string[] = [
  'Preparing image',
  'Reading text',
  'Understanding document',
  'Checking totals',
  'Creating draft',
];

export interface ProcessingState {
  readonly status: ProcessingStatus;
  /** Current status message (one of `PROCESSING_STATUS_MESSAGES`). */
  readonly statusMessage: string;
  /** Error message shown when `status === 'failed'`, otherwise null. */
  readonly errorMessage: string | null;
}

export interface CaptureStore {
  /** Default privacy mode for new captures. */
  readonly defaultStorageMode: StorageMode;
  setDefaultStorageMode: (mode: StorageMode) => void;

  /** Current capture-processing lifecycle state. */
  readonly processing: ProcessingState;
  /** Move processing into the `processing` state with the first message. */
  startProcessing: () => void;
  /** Update the indeterminate status message (cycling). */
  setProcessingMessage: (message: string) => void;
  /** Move processing into the `failed` state with an error message. */
  failProcessing: (errorMessage: string) => void;
  /** Move processing back to `idle`. */
  resetProcessing: () => void;
}

const INITIAL_PROCESSING: ProcessingState = {
  status: 'idle',
  statusMessage: PROCESSING_STATUS_MESSAGES[0]!,
  errorMessage: null,
};

export const useCaptureStore = create<CaptureStore>()((set) => ({
  defaultStorageMode: 'local_only',
  setDefaultStorageMode: (mode) => set({ defaultStorageMode: mode }),

  processing: INITIAL_PROCESSING,
  startProcessing: () =>
    set({
      processing: {
        status: 'processing',
        statusMessage: PROCESSING_STATUS_MESSAGES[0]!,
        errorMessage: null,
      },
    }),
  setProcessingMessage: (message) =>
    set((state) => ({
      processing: { ...state.processing, statusMessage: message },
    })),
  failProcessing: (errorMessage) =>
    set({
      processing: {
        status: 'failed',
        statusMessage: 'Processing failed',
        errorMessage,
      },
    }),
  resetProcessing: () => set({ processing: INITIAL_PROCESSING }),
}));
