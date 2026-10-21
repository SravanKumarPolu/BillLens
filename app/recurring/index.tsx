/** /recurring — manage recurring expense templates. */

import RecurringListScreen from '@presentation/screens/recurring/RecurringExpensesScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function RecurringRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Recurring expenses" description="Repeating expenses and their next due dates." />
      <RecurringListScreen />
    </>
  );
}
