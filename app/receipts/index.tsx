/** /receipts — persisted receipt history. */

import ReceiptHistoryScreen from '@presentation/screens/receipts/ReceiptHistoryScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function ReceiptsRoute(): JSX.Element {
  return (
    <>
      <PageHead title="Receipts" description="Receipt history stored on this device." />
      <ReceiptHistoryScreen />
    </>
  );
}
