/**
 * /(tabs)/groups — Groups list tab.
 * Thin route file: delegates to {@link GroupsListScreen}.
 */

import { GroupsListScreen } from '@presentation/screens/group/GroupsListScreen';

export default function GroupsTabRoute(): JSX.Element {
  return <GroupsListScreen />;
}
