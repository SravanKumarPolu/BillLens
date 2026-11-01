/**
 * /groups/[groupId] — Group home.
 *
 * Reads the `groupId` route param, runs the `requireGroupExists`
 * guard, and delegates to {@link GroupHomeScreen}.
 *
 * If the guard fails (empty / missing id), the user is redirected to
 * the groups list tab.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireGroupExists } from '@presentation/navigation/route-guards';
import { GroupHomeScreen } from '@presentation/screens/group/GroupHomeScreen';

export default function GroupHomeRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId || !requireGroupExists(groupId)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return <GroupHomeScreen groupId={groupId} />;
}
