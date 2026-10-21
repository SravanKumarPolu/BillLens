/** /recurring/new?expenseId= — turn an expense into a repeating series. */

import { NewRecurringExpenseScreen } from '@presentation/screens/recurring/RecurringExpensesScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function NewRecurringRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Repeat expense" description="Create a recurring expense from an existing one." />
      <NewRecurringExpenseScreen />
    </>
  );
}
