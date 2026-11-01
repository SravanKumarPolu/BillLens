/** /groups/members/[groupId] — add, rename and deactivate members. */

import GroupMembersScreen from '@presentation/screens/group/GroupMembersScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function GroupMembersRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Manage members" description="Add, rename or deactivate group members." />
      <GroupMembersScreen />
    </>
  );
}
