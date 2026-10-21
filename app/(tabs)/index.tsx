/**
 * /(tabs)/ — Home dashboard tab.
 * Thin route file: delegates to {@link HomeDashboardScreen}.
 */

import { HomeDashboardScreen } from '@presentation/screens/home/HomeDashboardScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function HomeTabRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Home"
        description="Your shared-expense dashboard: balances owed and owing, pending actions, and recent groups."
      />
      <HomeDashboardScreen />
    </>
  );
}
