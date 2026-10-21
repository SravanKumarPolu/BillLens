/**
 * /settings/data — export, retention review, and safe local deletion.
 */

import { DataStorageScreen } from '@presentation/screens/settings/DataStorageScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function DataStorageRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Data & storage"
        description="Export your local records, review retention, and remove old local groups safely."
        noindex
      />
      <DataStorageScreen />
    </>
  );
}
