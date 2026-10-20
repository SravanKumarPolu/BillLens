/**
 * /(tabs)/settings — Settings tab.
 * Thin route file: delegates to {@link SettingsScreen}.
 */

import { SettingsScreen } from '@presentation/screens/settings/SettingsScreen';

export default function SettingsTabRoute(): JSX.Element {
  return <SettingsScreen />;
}
