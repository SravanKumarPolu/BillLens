/**
 * /(tabs)/settings — Settings tab.
 * Thin route file: delegates to {@link SettingsScreen}.
 */

import { SettingsScreen } from '@presentation/screens/settings/SettingsScreen';
import { PageHead } from '@presentation/web/PageHead';

export default function SettingsTabRoute(): JSX.Element {
  return (
    <>
      <PageHead
        title="Settings"
        description="Sync, privacy, feedback and account controls."
        noindex
      />
      <SettingsScreen />
    </>
  );
}
