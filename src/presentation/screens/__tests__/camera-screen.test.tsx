/**
 * CameraScreen tests.
 *
 * Verifies the pure presentational component renders correctly for the
 * undetermined / denied / granted states, and that the user's tap on
 * the shutter button triggers the `onCapture` callback. The container's
 * `expo-camera` integration is covered by the existing capture-pipeline
 * tests (mock processor + privacy gate); here we focus on the UI
 * contract.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import {
  buildImageQualityQuery,
  CameraScreenView,
  takeCameraPicture,
  type CameraViewModel,
} from '@presentation/screens/capture/CameraScreen';

/**
 * Mock for `expo-camera`'s `CameraView` JSX component. The name is
 * prefixed with `mock` so jest's mock-factory hoisting rule allows
 * the reference inside `jest.mock()`.
 */
const mockCameraView = (): ReactElement => <View testID="mock-camera-view" />;
mockCameraView.displayName = 'MockCameraView';

jest.mock('expo-camera', () => ({
  __esModule: true,
  CameraView: () => mockCameraView(),
  useCameraPermissions: () => [{ status: 'granted' }, jest.fn()],
  requestCameraPermissionsAsync: jest.fn(),
}));

function makeViewModel(
  overrides: Partial<CameraViewModel> = {},
): CameraViewModel {
  return {
    permission: 'granted',
    capturing: false,
    mode: 'scan',
    groupId: undefined,
    error: null,
    ...overrides,
  };
}

describe('buildImageQualityQuery', () => {
  it('builds the query string for a scan with no group', () => {
    const q = buildImageQualityQuery('file:///tmp/x.jpg', 'scan', undefined);
    expect(q).toBe('?imageUri=file%3A%2F%2F%2Ftmp%2Fx.jpg&mode=scan');
  });

  it('includes the groupId when provided', () => {
    const q = buildImageQualityQuery('file:///tmp/x.jpg', 'payment', 'g_123');
    expect(q).toContain('imageUri=');
    expect(q).toContain('mode=payment');
    expect(q).toContain('groupId=g_123');
  });

  it('returns an empty string when imageUri is empty', () => {
    const q = buildImageQualityQuery('', 'scan', undefined);
    expect(q).toBe('?imageUri=&mode=scan');
  });
});

describe('CameraScreenView', () => {
  it('renders the permission-denied card when permission is denied', () => {
    const vm = makeViewModel({ permission: 'denied' });
    const { getByText, getByLabelText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('Camera access required')).toBeTruthy();
    expect(getByText(/grant camera permission in your device settings/i)).toBeTruthy();
    expect(getByLabelText('Try camera permission again')).toBeTruthy();
  });

  it('renders the error message inside the denied card when present', () => {
    const vm = makeViewModel({ permission: 'denied', error: 'Permission request failed.' });
    const { getByText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('Permission request failed.')).toBeTruthy();
  });

  it('shows the "Payment screenshot" pill when mode=payment', () => {
    const vm = makeViewModel({ permission: 'granted', mode: 'payment' });
    const { getByText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('Payment screenshot')).toBeTruthy();
  });

  it('shows the "Receipt scan" pill when mode=scan', () => {
    const vm = makeViewModel({ permission: 'granted', mode: 'scan' });
    const { getByText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('Receipt scan')).toBeTruthy();
  });

  it('shows the capture error card when error is set', () => {
    const vm = makeViewModel({ permission: 'granted', error: 'Capture failed.' });
    const { getByText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(getByText('Capture failed.')).toBeTruthy();
  });

  it('calls onCapture when the shutter button is pressed', () => {
    const handleCapture = jest.fn();
    const vm = makeViewModel({ permission: 'granted' });
    const { getByLabelText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={(): void => { handleCapture(); }}
        onCancel={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('Capture receipt photo'));
    expect(handleCapture).toHaveBeenCalledTimes(1);
  });

  it('disables the shutter button while capturing', () => {
    const handleCapture = jest.fn();
    const vm = makeViewModel({ permission: 'granted', capturing: true });
    const { getByLabelText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={(): void => { handleCapture(); }}
        onCancel={() => {}}
      />,
    );
    const button = getByLabelText('Capturing photo, please wait');
    fireEvent.press(button);
    expect(handleCapture).not.toHaveBeenCalled();
  });

  it('calls onCancel when the close button is pressed', () => {
    const handleCancel = jest.fn();
    const vm = makeViewModel({ permission: 'granted' });
    const { getByLabelText } = render(
      <CameraScreenView
        viewModel={vm}
        cameraRef={{ current: null } as never}
        onCapture={() => {}}
        onCancel={(): void => { handleCancel(); }}
      />,
    );
    fireEvent.press(getByLabelText('Close the camera'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

describe('takeCameraPicture', () => {
  it('prefers the runtime takePictureAsync API', async () => {
    const takePictureAsync = jest
      .fn<(...args: unknown[]) => Promise<{ uri: string }>>()
      .mockResolvedValue({ uri: 'file:///a.jpg' });
    const takePicture = jest.fn<(...args: unknown[]) => Promise<{ uri: string }>>();
    const picture = await takeCameraPicture({ takePictureAsync, takePicture }, { quality: 0.8 });
    expect(picture.uri).toBe('file:///a.jpg');
    expect(takePictureAsync).toHaveBeenCalledWith({ quality: 0.8 });
    expect(takePicture).not.toHaveBeenCalled();
  });

  it('falls back to takePicture when that is the only API', async () => {
    const takePicture = jest
      .fn<(...args: unknown[]) => Promise<{ uri: string }>>()
      .mockResolvedValue({ uri: 'file:///b.jpg' });
    const picture = await takeCameraPicture({ takePicture }, { quality: 0.7 });
    expect(picture.uri).toBe('file:///b.jpg');
    expect(takePicture).toHaveBeenCalledWith({ quality: 0.7 });
  });

  it('throws a clear error when neither API exists', async () => {
    await expect(takeCameraPicture({}, { quality: 0.8 })).rejects.toThrow(
      /does not expose a picture API/,
    );
  });
});
});
