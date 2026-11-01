/**
 * Screen — base screen wrapper.
 *
 * Responsibilities:
 *   - Paint the background from the theme (default `colors.background`).
 *   - Optionally respect device safe-area insets (`safeArea`).
 *   - Optionally make content scrollable (`scrollable`).
 *   - Optionally avoid the software keyboard (`avoidKeyboard`, v2.5.0):
 *     form screens with TextInputs (Add Expense, Settlement, Draft
 *     review, Onboarding name, Join group) previously had the focused
 *     input covered by the keyboard on iOS — `KeyboardAvoidingView`
 *     lifts the content above it. `keyboardShouldPersistTaps` keeps the
 *     dismiss-and-tap behaviour on scrollable screens.
 *
 * The screen does NOT impose horizontal padding — screens decide their own
 * gutters via `Stack`/`Row`/`Card`. This keeps the wrapper composable.
 */

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

export interface ScreenProps {
  readonly children: ReactNode;
  readonly scrollable?: boolean;
  readonly safeArea?: boolean;
  /** Lift content above the software keyboard (form screens). */
  readonly avoidKeyboard?: boolean;
  /** Override the background colour. Defaults to `theme.colors.background`. */
  readonly backgroundColor?: string;
}

export function Screen({
  children,
  scrollable = false,
  safeArea = true,
  avoidKeyboard = false,
  backgroundColor,
}: ScreenProps): JSX.Element {
  const theme = useTheme();
  const bg = backgroundColor ?? theme.colors.background;

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      // Phase 6 keyboard handling: taps on buttons/inputs while the
      // keyboard is open must register (dismiss+tap in one gesture)
      // instead of requiring a second press — critical for the money
      // entry forms rendered inside scrollable screens.
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  // v2.5.0: `behavior` per platform — padding on iOS (matches the
  // safe-area layout), height on Android (the system resizes the window
  // when `android:windowSoftInputMode=adjustResize`; `height` is the
  // reliable no-op-safe mode inside RN).
  const contentWithKeyboard = avoidKeyboard ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={0}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  if (safeArea) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
        {contentWithKeyboard}
      </SafeAreaView>
    );
  }

  return <View style={{ flex: 1, backgroundColor: bg }}>{contentWithKeyboard}</View>;
}
