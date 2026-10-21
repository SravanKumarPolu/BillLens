/** /settings/backup — encrypted local backup and restore. */

import BackupScreen from '@presentation/screens/settings/BackupScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function BackupRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Backup and restore" description="Encrypted local backups for BillLens." />
      <BackupScreen />
    </>
  );
}
