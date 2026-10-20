/**
 * /(tabs)/ — Home dashboard tab.
 * Thin route file: delegates to {@link HomeDashboardScreen}.
 */

import { HomeDashboardScreen } from '@presentation/screens/home/HomeDashboardScreen';

export default function HomeTabRoute(): JSX.Element {
  return <HomeDashboardScreen />;
}
