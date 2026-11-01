/** /settings/erase-data — guarded erase of all local user data. */

import EraseDataScreen from '@presentation/screens/settings/EraseDataScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function EraseDataRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Erase local data" description="Permanently remove all local BillLens data." />
      <EraseDataScreen />
    </>
  );
}
