/** /expenses/itemized/new?groupId= — item-first expense creation. */

import NewItemizedExpenseScreen from '@presentation/screens/expense/NewItemizedExpenseScreen';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { PageHead } from '@presentation/web/PageHead';

export default function NewItemizedExpenseRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  if (!params.groupId) return <Redirect href="/(tabs)/groups" />;
  return (
    <>
      <PageHead title="Itemized expense" description="Create an expense from individual bill items." />
      <NewItemizedExpenseScreen />
    </>
  );
}
