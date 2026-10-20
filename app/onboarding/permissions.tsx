/**
 * /onboarding/permissions — explain permissions before requesting them.
 * Thin route file: delegates to {@link PermissionsScreen}.
 */

import { PermissionsScreen } from '@presentation/screens/onboarding/PermissionsScreen';

export default function PermissionsRoute(): JSX.Element {
  return <PermissionsScreen />;
}
