/** /groups/members/[groupId] — add, rename and deactivate members. */

import GroupMembersScreen from '@presentation/screens/group/GroupMembersScreen';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { PageHead } from '@presentation/web/PageHead';

export default function GroupMembersRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  if (!params.groupId) return <Redirect href="/(tabs)/groups" />;
  return (
    <>
      <PageHead title="Manage members" description="Add, rename or deactivate group members." />
      <GroupMembersScreen />
    </>
  );
}
