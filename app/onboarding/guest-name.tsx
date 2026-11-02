/**
 * /onboarding/guest-name — pick a display name.
 * Thin route file: delegates to {@link GuestNameScreen}.
 */

import { GuestNameScreen } from '@presentation/screens/onboarding/GuestNameScreen';

export default function GuestNameRoute(): JSX.Element {
  return <GuestNameScreen />;
}
