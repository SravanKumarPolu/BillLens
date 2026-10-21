/**
 * /drafts — the drafts inbox.
 *
 * Lists every captured draft still awaiting confirmation and opens the
 * existing review screen at /drafts/[draftId].
 *
 * Deep link: billlens://drafts
 */

import { DraftsInboxScreen } from '@presentation/screens/drafts/DraftsInboxScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function DraftsInboxRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Drafts"
        description="Captured receipts still waiting for confirmation."
        noindex
      />
      <DraftsInboxScreen />
    </>
  );
}
