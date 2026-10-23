/**
 * GalleryPickerScreen tests.
 *
 * Verifies the pure presentational component renders correctly for the
 * requesting / picking / cancelled / denied / failed states and that
 * user interactions on the buttons trigger the right callbacks. The
 * container's `expo-image-picker` integration is covered by integration
 * tests; here we focus on the UI contract.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  buildImageQualityQuery,
  GalleryPickerView,
  type GalleryPickerViewModel,
} from '@presentation/screens/capture/GalleryPickerScreen';

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  MediaTypeOptions: { Images: 1 },
}));

function makeViewModel(
  overrides: Partial<GalleryPickerViewModel> = {},
): GalleryPickerViewModel {
  return {
    status: 'picking',
    error: null,
    mode: 'scan',
    groupId: undefined,
    ...overrides,
  };
}

describe('buildImageQualityQuery', () => {
  it('builds the query string for a scan with no group', () => {
    const q = buildImageQualityQuery('file:///tmp/x.jpg', 'scan', undefined);
    // v2.26.0: sourceType is always propagated so "Choose another image"
    // returns to the same capture surface.
    expect(q).toBe('?imageUri=file%3A%2F%2F%2Ftmp%2Fx.jpg&mode=scan&sourceType=gallery');
  });

  it('includes the groupId when provided', () => {
    const q = buildImageQualityQuery('file:///tmp/x.jpg', 'payment', 'g_456');
    expect(q).toContain('imageUri=');
    expect(q).toContain('mode=payment');
    expect(q).toContain('groupId=g_456');
  });
});

describe('GalleryPickerView', () => {
  it('renders the "Opening your photo library" loader while picking', () => {
    const vm = makeViewModel({ status: 'picking' });
    const { getByText } = render(
      <GalleryPickerView viewModel={vm} onCancel={() => {}} onTryAgain={() => {}} />,
    );
    expect(getByText('Opening your photo library…')).toBeTruthy();
    expect(getByText(/Pick a receipt or payment screenshot/i)).toBeTruthy();
  });

  it('renders the "Nothing picked" card when the picker was cancelled', () => {
    const handleCancel = jest.fn();
    const vm = makeViewModel({ status: 'cancelled' });
    const { getByText, getByLabelText } = render(
      <GalleryPickerView viewModel={vm} onCancel={(): void => { handleCancel(); }} onTryAgain={() => {}} />,
    );
    expect(getByText('Nothing picked')).toBeTruthy();
    expect(getByText(/You cancelled the picker/i)).toBeTruthy();
    fireEvent.press(getByLabelText('Return to the capture entry'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the permission-denied card when status is denied', () => {
    const handleTryAgain = jest.fn();
    const handleCancel = jest.fn();
    const vm = makeViewModel({
      status: 'denied',
      error: 'Permission denied by user',
    });
    const { getByText, getByLabelText } = render(
      <GalleryPickerView
        viewModel={vm}
        onCancel={(): void => { handleCancel(); }}
        onTryAgain={(): void => { handleTryAgain(); }}
      />,
    );
    expect(getByText('Photo library access required')).toBeTruthy();
    expect(getByText(/grant the permission in your device settings/i)).toBeTruthy();
    expect(getByText('Permission denied by user')).toBeTruthy();
    fireEvent.press(getByLabelText('Request gallery permission again'));
    expect(handleTryAgain).toHaveBeenCalledTimes(1);
  });

  it('renders the failed card when status is failed', () => {
    const handleTryAgain = jest.fn();
    const handleCancel = jest.fn();
    const vm = makeViewModel({
      status: 'failed',
      error: 'Could not open picker',
    });
    const { getByText, getByLabelText } = render(
      <GalleryPickerView
        viewModel={vm}
        onCancel={(): void => { handleCancel(); }}
        onTryAgain={(): void => { handleTryAgain(); }}
      />,
    );
    expect(getByText('Could not pick an image')).toBeTruthy();
    expect(getByText(/Something went wrong while opening the photo picker/i)).toBeTruthy();
    expect(getByText('Could not open picker')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry the gallery picker'));
    expect(handleTryAgain).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('Return to the capture entry'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
