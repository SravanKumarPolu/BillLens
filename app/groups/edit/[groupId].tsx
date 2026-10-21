/** /groups/edit/[groupId] — edit group metadata and guarded currency. */

import GroupEditScreen from '@presentation/screens/group/GroupEditScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function GroupEditRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Edit group" description="Rename a group, change its category and currency." />
      <GroupEditScreen />
    </>
  );
}
