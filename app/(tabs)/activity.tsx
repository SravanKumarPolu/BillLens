/**
 * /(tabs)/activity — Recent activity tab.
 * Thin route file: delegates to {@link ActivityScreen}.
 */

import { ActivityScreen } from '@presentation/screens/activity/ActivityScreen';

export default function ActivityTabRoute(): JSX.Element {
  return <ActivityScreen />;
}
