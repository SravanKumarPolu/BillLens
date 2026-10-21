/** /search — cross-group expense search (offline, SQLite-backed). */

import ExpenseSearchScreen from '@presentation/screens/search/ExpenseSearchScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function SearchRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Search expenses"
        description="Find any expense across your groups by title, note, group or date."
      />
      <ExpenseSearchScreen />
    </>
  );
}
