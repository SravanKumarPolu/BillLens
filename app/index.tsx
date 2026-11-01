/**
 * Root redirect.
 *
 * Reads the persisted `onboardingComplete` flag from the navigation
 * store and redirects:
 *   - false → /onboarding/welcome
 *   - true  → /(tabs)            (the main app)
 *
 * The route renders a loading indicator until the persisted store has
 * hydrated, then returns an expo-router `<Redirect />`.
 */

import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useRequireOnboardingComplete } from '@presentation/navigation/route-guards';

export default function RootIndexRoute(): JSX.Element {
  const onboardingComplete = useRequireOnboardingComplete();
  if (onboardingComplete === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Loading onboarding status" />
      </View>
    );
  }

  return <Redirect href={onboardingComplete ? '/(tabs)' : '/onboarding/welcome'} />;
}
