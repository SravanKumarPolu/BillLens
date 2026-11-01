/**
 * /groups/[groupId]/balances — Group balances.
 *
 * Reads the `groupId` route param, runs the `requireGroupExists`
 * guard, and delegates to {@link GroupBalancesScreen}.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireGroupExists } from '@presentation/navigation/route-guards';
import { GroupBalancesScreen } from '@presentation/screens/group/GroupBalancesScreen';

export default function GroupBalancesRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId || !requireGroupExists(groupId)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return <GroupBalancesScreen groupId={groupId} />;
}
