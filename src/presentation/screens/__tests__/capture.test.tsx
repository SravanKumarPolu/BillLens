/**
 * Capture screen + component tests (Prompt 17).
 *
 * Uses `@testing-library/react-native` to render the capture screens
 * in isolation. `expo-router` is mocked so the screens can call
 * `router.push` / `router.back` without a real navigation host.
 *
 * Coverage:
 *   - CaptureEntryScreen: 4 options visible + navigation
 *   - ImageQualityReviewScreen: Phase 2 stub notice + buttons
 *   - ProcessingScreen: processing + failed states
 *   - PrivacyNotice: shows the correct label / description for each mode
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { PrivacyNotice } from '@presentation/components/PrivacyNotice';
import { CAPTURE_OPTIONS, CaptureEntryView } from '@presentation/screens/capture/CaptureEntryScreen';
import { ImageQualityReviewView } from '@presentation/screens/capture/ImageQualityReviewScreen';
import { ProcessingView } from '@presentation/screens/capture/ProcessingScreen';
import { useCaptureStore } from '@store/capture-store';

// Mock expo-router — only variables prefixed with `mock` may be
// referenced inside `jest.mock()` factory bodies (jest hoists them).
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    back: (...args: readonly unknown[]) => mockRouterBack(...args),
    replace: (...args: readonly unknown[]) => mockRouterReplace(...args),
  },
}));

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterBack.mockClear();
  mockRouterReplace.mockClear();
  useCaptureStore.getState().resetProcessing();
  useCaptureStore.getState().setDefaultStorageMode('local_only');
});

// ---------------------------------------------------------------------------
// CaptureEntryScreen
// ---------------------------------------------------------------------------

describe('CaptureEntryView', () => {
  it('renders all 4 capture options', () => {
    const { getByText } = renderWithProviders(
      <CaptureEntryView
        defaultStorageMode="local_only"
        onClose={() => {}}
      />,
    );

    expect(getByText('Scan Receipt')).toBeTruthy();
    expect(getByText('Import from Gallery')).toBeTruthy();
    expect(getByText('Import Payment Screenshot')).toBeTruthy();
    expect(getByText('Add Manually')).toBeTruthy();
  });

  it('exposes exactly 4 options through CAPTURE_OPTIONS', () => {
    expect(CAPTURE_OPTIONS).toHaveLength(4);
    expect(CAPTURE_OPTIONS.map((o) => o.id)).toEqual([
      'scan',
      'gallery',
      'payment',
      'manual',
    ]);
  });

  it('renders the screen title "Add Expense"', () => {
    const { getByText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={() => {}} />,
    );
    expect(getByText('Add Expense')).toBeTruthy();
  });

  it('navigates to /capture/camera when Scan Receipt is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={() => {}} />,
    );

    fireEvent.press(getByLabelText('Scan Receipt'));
    expect(mockRouterPush).toHaveBeenCalledWith('/capture/camera');
  });

  it('navigates to /capture/gallery when Import from Gallery is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={() => {}} />,
    );

    fireEvent.press(getByLabelText('Import from Gallery'));
    expect(mockRouterPush).toHaveBeenCalledWith('/capture/gallery');
  });

  it('navigates to /capture/camera?mode=payment when Import Payment Screenshot is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={() => {}} />,
    );

    fireEvent.press(getByLabelText('Import Payment Screenshot'));
    expect(mockRouterPush).toHaveBeenCalledWith('/capture/camera?mode=payment');
  });

  it('navigates to /expenses/new when Add Manually is pressed', () => {
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={() => {}} />,
    );

    fireEvent.press(getByLabelText('Add Manually'));
    expect(mockRouterPush).toHaveBeenCalledWith('/expenses/new');
  });

  it('appends ?groupId=… to every option when a groupId is provided', () => {
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView groupId="g_abc" defaultStorageMode="local_only" onClose={() => {}} />,
    );

    fireEvent.press(getByLabelText('Scan Receipt'));
    expect(mockRouterPush).toHaveBeenCalledWith('/capture/camera?groupId=g_abc');

    fireEvent.press(getByLabelText('Add Manually'));
    expect(mockRouterPush).toHaveBeenCalledWith('/expenses/new?groupId=g_abc');
  });

  it('invokes onClose when the close icon is pressed', () => {
    const onClose = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="local_only" onClose={onClose} />,
    );

    fireEvent.press(getByLabelText('Close the capture screen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the PrivacyNotice showing the active storage mode', () => {
    const { getByText } = renderWithProviders(
      <CaptureEntryView defaultStorageMode="cloud_private" onClose={() => {}} />,
    );

    expect(getByText('Cloud private')).toBeTruthy();
    expect(getByText('Uploaded privately to your account')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ImageQualityReviewScreen
// ---------------------------------------------------------------------------

describe('ImageQualityReviewView', () => {
  it('shows the technical-checks notice once checks complete (not a CV claim)', () => {
    const { getByText, queryByText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [],
          isPhase2Stub: false,
        }}
        checked
        blocked={false}
        onRetake={() => {}}
        onContinue={() => {}}
      />,
    );

    expect(getByText('Basic checks done')).toBeTruthy();
    // The notice must NOT claim on-device blur/CV detection.
    expect(queryByText('Image quality check is not yet available')).toBeNull();
  });

  it('renders Retake and Continue buttons', () => {
    const { getByLabelText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [],
          isPhase2Stub: false,
        }}
        checked
        blocked={false}
        onRetake={() => {}}
        onContinue={() => {}}
      />,
    );

    expect(getByLabelText('Retake the photo')).toBeTruthy();
    expect(getByLabelText('Continue to processing with this image')).toBeTruthy();
  });

  it('invokes onRetake when Retake is pressed', () => {
    const onRetake = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [],
          isPhase2Stub: false,
        }}
        checked
        blocked={false}
        onRetake={onRetake}
        onContinue={() => {}}
      />,
    );

    fireEvent.press(getByLabelText('Retake the photo'));
    expect(onRetake).toHaveBeenCalled();
  });

  it('offers image replacement and invokes it', () => {
    const onReplace = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [],
          isPhase2Stub: false,
        }}
        checked
        blocked={false}
        onRetake={() => {}}
        onReplace={onReplace}
        onContinue={() => {}}
      />,
    );

    fireEvent.press(
      getByLabelText('Replace this image with another from the gallery or camera'),
    );
    expect(onReplace).toHaveBeenCalled();
  });

  it('invokes onContinue when Continue is pressed', () => {
    const onContinue = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [],
          isPhase2Stub: false,
        }}
        checked
        blocked={false}
        onRetake={() => {}}
        onContinue={onContinue}
      />,
    );

    fireEvent.press(getByLabelText('Continue to processing with this image'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('disables Continue and explains why when the image is blocked', () => {
    const onContinue = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ImageQualityReviewView
        viewModel={{
          imageUri: 'file:///tmp/receipt.jpg',
          warnings: [
            {
              kind: 'unsupported',
              message: 'This image is larger than the 10 MB limit.',
            },
          ],
          isPhase2Stub: false,
        }}
        checked
        blocked
        onRetake={() => {}}
        onContinue={onContinue}
      />,
    );

    const button = getByLabelText(
      'Continue is unavailable because the image failed the basic checks',
    );
    expect(button).toBeTruthy();
    // A disabled button's press is a no-op — the handler must not fire.
    fireEvent.press(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ProcessingScreen
// ---------------------------------------------------------------------------

describe('ProcessingView', () => {
  it('shows the indeterminate processing state', () => {
    const { getByText, getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'processing',
          statusMessage: 'Reading text',
          errorMessage: null,
          ocrUnavailable: false,
        }}
        onCancel={() => {}}
        onRetry={() => {}}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    expect(getByText('Processing…')).toBeTruthy();
    expect(getByText('Reading text')).toBeTruthy();
    expect(getByLabelText('Processing: Reading text')).toBeTruthy();
    expect(getByLabelText('Cancel processing')).toBeTruthy();
  });

  it('shows the failure state with retry / choose-another / add-manually', () => {
    const { getByText, getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'failed',
          statusMessage: 'Processing failed',
          errorMessage: 'Could not read the receipt.',
          ocrUnavailable: false,
        }}
        onCancel={() => {}}
        onRetry={() => {}}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    expect(getByText('Processing failed')).toBeTruthy();
    expect(getByText('Could not read the receipt.')).toBeTruthy();
    expect(getByLabelText('Retry processing the image')).toBeTruthy();
    expect(getByLabelText('Choose a different image to process')).toBeTruthy();
    expect(getByLabelText('Skip processing and enter the expense manually')).toBeTruthy();
  });

  it('invokes onRetry when Retry is pressed', () => {
    const onRetry = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'failed',
          statusMessage: 'Processing failed',
          errorMessage: 'Could not read the receipt.',
          ocrUnavailable: false,
        }}
        onCancel={() => {}}
        onRetry={onRetry}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    fireEvent.press(getByLabelText('Retry processing the image'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('invokes onCancel when the Cancel button is pressed', () => {
    const onCancel = jest.fn();
    const { getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'processing',
          statusMessage: 'Preparing image',
          errorMessage: null,
          ocrUnavailable: false,
        }}
        onCancel={onCancel}
        onRetry={() => {}}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    fireEvent.press(getByLabelText('Cancel processing'));
    expect(onCancel).toHaveBeenCalled();
  });

  // --- v2.5.0: explicit "Receipt scanning unavailable" state -----------------

  it('shows the unavailable state (no Retry) when OCR is not configured', () => {
    const { queryByLabelText, getByText, getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'failed',
          statusMessage: 'Processing failed',
          errorMessage:
            'Receipt scanning is not available in this build: no OCR provider is configured.',
          ocrUnavailable: true,
        }}
        onCancel={() => {}}
        onRetry={() => {
          throw new Error('Retry must not be offered when OCR is unavailable');
        }}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    expect(getByText('Receipt scanning unavailable')).toBeTruthy();
    expect(
      getByLabelText(
        'Receipt scanning unavailable: Receipt scanning is not available in this build: no OCR provider is configured.',
      ),
    ).toBeTruthy();
    // Retry is intentionally absent — a configuration gap cannot be retried.
    expect(queryByLabelText('Retry processing the image')).toBeNull();
    // Manual entry is the primary recovery path; re-picking an image stays.
    expect(getByLabelText('Enter the expense manually')).toBeTruthy();
    expect(getByLabelText('Choose a different image to process')).toBeTruthy();
  });

  it('keeps the retryable failure card when ocrUnavailable is false', () => {
    const { getByLabelText } = renderWithProviders(
      <ProcessingView
        viewModel={{
          status: 'failed',
          statusMessage: 'Processing failed',
          errorMessage: 'Network error while scanning the receipt.',
          ocrUnavailable: false,
        }}
        onCancel={() => {}}
        onRetry={() => {}}
        onChooseAnother={() => {}}
        onAddManually={() => {}}
      />,
    );

    expect(getByLabelText('Retry processing the image')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PrivacyNotice
// ---------------------------------------------------------------------------

describe('PrivacyNotice', () => {
  it('renders the local-only label and description when mode is local_only', () => {
    const { getByText } = renderWithProviders(<PrivacyNotice mode="local_only" />);

    expect(getByText('Local only')).toBeTruthy();
    expect(getByText('Stored only on this device')).toBeTruthy();
  });

  it('renders the cloud-private description', () => {
    const { getByText } = renderWithProviders(<PrivacyNotice mode="cloud_private" />);

    expect(getByText('Cloud private')).toBeTruthy();
    expect(getByText('Uploaded privately to your account')).toBeTruthy();
  });

  it('renders the shared-with-group description', () => {
    const { getByText } = renderWithProviders(<PrivacyNotice mode="shared_with_group" />);

    expect(getByText('Shared with group')).toBeTruthy();
    expect(getByText('Visible to group members')).toBeTruthy();
  });

  it('renders the delete-after-extraction description', () => {
    const { getByText } = renderWithProviders(<PrivacyNotice mode="delete_after_extraction" />);

    expect(getByText('Delete after extraction')).toBeTruthy();
    expect(getByText('Deleted after the values are extracted')).toBeTruthy();
  });

  it('falls back to the capture store default when no mode is provided', () => {
    useCaptureStore.getState().setDefaultStorageMode('shared_with_group');
    const { getByText } = renderWithProviders(<PrivacyNotice />);

    expect(getByText('Shared with group')).toBeTruthy();
  });

  it('hides the description line when compact is true', () => {
    const { queryByText, getByText } = renderWithProviders(
      <PrivacyNotice mode="local_only" compact />,
    );

    expect(getByText('Local only')).toBeTruthy();
    expect(queryByText('Stored only on this device')).toBeNull();
  });
});
