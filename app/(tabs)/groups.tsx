/**
 * /(tabs)/groups — Groups list tab.
 * Thin route file: delegates to {@link GroupsListScreen}.
 */

import { GroupsListScreen } from '@presentation/screens/group/GroupsListScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function GroupsTabRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Groups"
        description="Every shared group, with your balance and sync state at a glance."
      />
      <GroupsListScreen />
    </>
  );
}
