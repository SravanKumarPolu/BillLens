/**
 * /capture/gallery — gallery picker.
 *
 * Reads the optional `groupId` query param and delegates to
 * {@link GalleryPickerScreen}. The real picker surface lands here
 * (Phase 5 implementation using `expo-image-picker`).
 *
 * The optional `mode` query param scopes the picker to a receipt scan
 * (default) or a payment screenshot.
 */

import { useLocalSearchParams } from 'expo-router';

import { GalleryPickerScreen } from '@presentation/screens/capture/GalleryPickerScreen';

export default function CaptureGalleryRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string; mode?: 'payment' | 'scan' }>();
  return (
    <GalleryPickerScreen
      groupId={params.groupId}
      mode={params.mode === 'payment' ? 'payment' : 'scan'}
    />
  );
}
