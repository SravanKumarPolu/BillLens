/**
 * /(tabs)/activity — Recent activity tab.
 * Thin route file: delegates to {@link ActivityScreen}.
 */

import { ActivityScreen } from '@presentation/screens/activity/ActivityScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function ActivityTabRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Activity"
        description="A unified timeline of expenses and settlements across your groups."
      />
      <ActivityScreen />
    </>
  );
}
