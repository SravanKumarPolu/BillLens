/**
 * Root redirect.
 *
 * Reads the persisted `onboardingComplete` flag from the navigation
 * store and redirects:
 *   - false → /onboarding/welcome
 *   - true  → /(tabs)            (the main app)
 *
 * The route file itself renders no UI — it returns a `<Redirect />`
 * from expo-router. The redirect is synchronous (the store is hydrated
 * by zustand/persist on app launch before this route mounts).
 */

import { Redirect } from 'expo-router';

import { requireOnboardingComplete } from '@presentation/navigation/route-guards';

export default function RootIndexRoute(): JSX.Element {
  const onboardingComplete = requireOnboardingComplete();
  return <Redirect href={onboardingComplete ? '/(tabs)' : '/onboarding/welcome'} />;
}
