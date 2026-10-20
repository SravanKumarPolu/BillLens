/**
 * /onboarding/welcome — first onboarding screen.
 * Thin route file: delegates to {@link WelcomeScreen}.
 */

import { WelcomeScreen } from '@presentation/screens/onboarding/WelcomeScreen';

export default function WelcomeRoute(): JSX.Element {
  return <WelcomeScreen />;
}
