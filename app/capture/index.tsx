/**
 * /capture — Capture entry (camera/gallery/manual).
 *
 * Reads the optional `source` and `groupId` query params and delegates
 * to {@link CaptureEntryScreen}.
 *
 * Deep links:
 *   billlens://capture                — open camera
 *   billlens://capture?source=gallery — open gallery picker
 *   billlens://capture?source=payment — open payment-screenshot picker
 *   billlens://capture?groupId=g_abc  — pre-bind the capture to a group
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureEntryScreen } from '@presentation/screens/capture/CaptureEntryScreen';

export default function CaptureRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    source?: 'gallery' | 'payment' | 'scan';
    groupId?: string;
  }>();
  return <CaptureEntryScreen source={params.source} groupId={params.groupId} />;
}
