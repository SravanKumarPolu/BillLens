/**
 * /drafts/[draftId] — Draft review.
 *
 * Reads the `draftId` route param, runs the `requireDraftExists`
 * guard, and delegates to {@link DraftReviewScreen}.
 *
 * Deep link: billlens://drafts/<id>
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireDraftExists } from '@presentation/navigation/route-guards';
import { DraftReviewScreen } from '@presentation/screens/drafts/DraftReviewScreen';

export default function DraftReviewRoute(): JSX.Element {
  const params = useLocalSearchParams<{ draftId?: string }>();
  const draftId = params.draftId;

  if (!draftId || !requireDraftExists(draftId)) {
    return <Redirect href="/(tabs)" />;
  }

  return <DraftReviewScreen draftId={draftId} />;
}
