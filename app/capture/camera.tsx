/**
 * /capture/camera — camera viewfinder.
 *
 * Reads the optional `mode` and `groupId` query params and delegates
 * to {@link CameraScreen}. The real viewfinder surface lands here
 * (Phase 5 implementation using `expo-camera`'s `CameraView`).
 */

import { useLocalSearchParams } from 'expo-router';

import { CameraScreen } from '@presentation/screens/capture/CameraScreen';

export default function CaptureCameraRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    mode?: 'payment' | 'scan';
    groupId?: string;
  }>();
  return (
    <CameraScreen
      mode={params.mode === 'payment' ? 'payment' : 'scan'}
      groupId={params.groupId}
    />
  );
}
