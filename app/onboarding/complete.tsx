/**
 * /onboarding/complete — finish onboarding and enter the app.
 * Thin route file: delegates to {@link CompleteScreen}.
 */

import { CompleteScreen } from '@presentation/screens/onboarding/CompleteScreen';

export default function OnboardingCompleteRoute(): JSX.Element {
  return <CompleteScreen />;
}
