/**
 * /capture/image-quality — image quality review.
 *
 * Reads the optional `imageUri`, `groupId`, and `mode` query params
 * and delegates to {@link ImageQualityReviewScreen}.
 *
 * Phase 2: there is no real camera pipeline yet, so `imageUri` is
 * usually undefined and the screen renders the placeholder preview.
 */

import { useLocalSearchParams } from 'expo-router';

import { ImageQualityReviewScreen } from '@presentation/screens/capture/ImageQualityReviewScreen';

export default function CaptureImageQualityRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    imageUri?: string;
    groupId?: string;
    mode?: 'payment' | 'scan';
    sourceType?: string;
  }>();
  return (
    <ImageQualityReviewScreen
      imageUri={params.imageUri}
      groupId={params.groupId}
      mode={params.mode}
      sourceType={params.sourceType}
    />
  );
}
