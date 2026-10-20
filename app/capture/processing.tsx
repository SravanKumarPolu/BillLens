/**
 * /capture/processing — capture processing.
 *
 * Reads the `imageUri` (required for the real pipeline), plus optional
 * `groupId` / `mode` / `sourceType` query params, and delegates to
 * {@link ProcessingScreen}.
 */

import { useLocalSearchParams } from 'expo-router';

import { ProcessingScreen } from '@presentation/screens/capture/ProcessingScreen';

export default function CaptureProcessingRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    imageUri?: string;
    groupId?: string;
    mode?: 'payment' | 'scan';
    sourceType?: string;
  }>();
  return (
    <ProcessingScreen
      imageUri={params.imageUri}
      groupId={params.groupId}
      mode={params.mode}
      sourceType={params.sourceType as never}
    />
  );
}
