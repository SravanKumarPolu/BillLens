/** /groups/delete/[groupId] — guarded permanent deletion. */

import GroupDeleteScreen from '@presentation/screens/group/GroupDeleteScreen';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { PageHead } from '@presentation/web/PageHead';

export default function GroupDeleteRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  if (!params.groupId) return <Redirect href="/(tabs)/groups" />;
  return (
    <>
      <PageHead title="Delete group" description="Permanently delete a group and its financial records." />
      <GroupDeleteScreen />
    </>
  );
}
