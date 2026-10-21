/** /expenses/items/[expenseId] — item-level split editor. */

import { useLocalSearchParams } from 'expo-router';

import ItemEditorScreen from '@presentation/screens/expense/ItemEditorScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function ItemEditorRoute(): JSX.Element {
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  return (
    <>
      <PageHead title="Edit items" description="Split an expense by individual items." />
      <ItemEditorScreen key={expenseId ?? 'missing'} />
    </>
  );
}
