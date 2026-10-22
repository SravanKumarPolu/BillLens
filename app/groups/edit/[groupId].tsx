/** /groups/edit/[groupId] — edit group metadata and guarded currency. */

import GroupEditScreen from '@presentation/screens/group/GroupEditScreen';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { PageHead } from '@presentation/web/PageHead';

export default function GroupEditRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  if (!params.groupId) return <Redirect href="/(tabs)/groups" />;
  return (
    <>
      <PageHead title="Edit group" description="Rename a group, change its category and currency." />
      <GroupEditScreen />
    </>
  );
}
