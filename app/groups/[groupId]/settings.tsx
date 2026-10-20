/**
 * /groups/[groupId]/settings — Group settings.
 *
 * Reads the `groupId` route param, runs the `requireGroupExists`
 * guard, and delegates to {@link GroupSettingsScreen}.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireGroupExists } from '@presentation/navigation/route-guards';
import { GroupSettingsScreen } from '@presentation/screens/group/GroupSettingsScreen';

export default function GroupSettingsRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId || !requireGroupExists(groupId)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return <GroupSettingsScreen groupId={groupId} />;
}
