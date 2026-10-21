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
import { PageHead } from '@presentation/web/PageHead';

export default function CaptureRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    source?: 'gallery' | 'payment' | 'scan';
    groupId?: string;
  }>();
  return (
    <>
      <PageHead
        title="Capture a receipt"
        description="Scan a receipt or import a screenshot; BillLens extracts the values for review."
        noindex
      />
      <CaptureEntryScreen source={params.source} groupId={params.groupId} />
    </>
  );
}
