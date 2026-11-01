/** /groups/delete/[groupId] — guarded permanent deletion. */

import GroupDeleteScreen from '@presentation/screens/group/GroupDeleteScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function GroupDeleteRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Delete group" description="Permanently delete a group and its financial records." />
      <GroupDeleteScreen />
    </>
  );
}
