/**
 * /groups/[groupId]/settlements — per-group settlement history.
 *
 * Reads the `groupId` route param, runs the `requireGroupExists` guard,
 * and delegates to {@link GroupSettlementsScreen}. Private financial
 * surface — `noindex` on web.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireGroupExists } from '@presentation/navigation/route-guards';
import { GroupSettlementsScreen } from '@presentation/screens/settlement/SettlementHistoryScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function GroupSettlementsRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId || !requireGroupExists(groupId)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return (
    <>
      <PageHead
        title="Settlement history"
        description="Every transfer recorded in this group, with status and reversals."
        noindex
      />
      <GroupSettlementsScreen groupId={groupId} />
    </>
  );
}
