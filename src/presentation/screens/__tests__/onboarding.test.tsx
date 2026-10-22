/**
 * Onboarding flow tests (Prompt 14).
 *
 * Uses `@testing-library/react-native` to render the onboarding screens
 * in isolation. `expo-router` is mocked so the screens can call
 * `router.push` / `router.replace` without a real navigation host.
 *
 * Coverage:
 *   - WelcomeScreen renders the tagline and the four feature bullets.
 *   - GuestNameScreen rejects empty / whitespace-only names.
 *   - The complete flow sets `onboardingComplete=true` in the
 *     navigation store when "Enter BillLens" is tapped.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';


import { CompleteScreen } from '@presentation/screens/onboarding/CompleteScreen';
import { GuestNameScreen } from '@presentation/screens/onboarding/GuestNameScreen';
import { WelcomeScreen } from '@presentation/screens/onboarding/WelcomeScreen';
import { useGuestStore } from '@store/guest-store';
import { useNavigationStore } from '@store/navigation-store';

// Mock expo-router. The factory may only reference variables whose
// names start with `mock` (jest hoists `jest.mock()` above imports, so
// any other variable would be uninitialized at the time the factory
// runs).
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    replace: (...args: readonly unknown[]) => mockRouterReplace(...args),
  },
}));

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  // The default `useTheme()` returns `lightTheme` when no ThemeProvider
  // is mounted, so we don't need to wrap in ThemeProvider here.
  return render(ui);
}

describe('WelcomeScreen', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    useGuestStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  it('renders the BillLens wordmark and tagline', () => {
    const { getByText } = renderWithProviders(<WelcomeScreen />);

    expect(getByText('BillLens')).toBeTruthy();
    expect(getByText('Scan receipts. Split clearly. Know exactly who owes what.')).toBeTruthy();
  });

  it('renders all four feature bullets', () => {
    const { getByText } = renderWithProviders(<WelcomeScreen />);

    expect(getByText('No account required')).toBeTruthy();
    expect(getByText('Works offline')).toBeTruthy();
    expect(getByText('Cloud backup later')).toBeTruthy();
    expect(getByText('Always reviewable')).toBeTruthy();
  });

  it('navigates to /onboarding/guest-name when "Get Started" is pressed', () => {
    const { getByLabelText } = renderWithProviders(<WelcomeScreen />);

    fireEvent.press(getByLabelText('Get started with BillLens onboarding'));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith('/onboarding/guest-name');
  });

  it('does not expose an unrouted sign-in control', () => {
    const { queryByLabelText } = renderWithProviders(<WelcomeScreen />);
    expect(queryByLabelText('Sign in with an existing account')).toBeNull();
  });
});

describe('GuestNameScreen', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    useGuestStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  it('shows an error when the submitted name is empty', () => {
    const { getByLabelText, queryByText } = renderWithProviders(<GuestNameScreen />);

    // Submit an empty name — the screen rejects it and shows the error.
    fireEvent(getByLabelText('Display name'), 'submitEditing');

    expect(queryByText('Please enter a display name.')).not.toBeNull();
  });

  it('shows an error when the submitted name is whitespace-only', () => {
    const { getByLabelText, getByText } = renderWithProviders(<GuestNameScreen />);

    fireEvent.changeText(getByLabelText('Display name'), '   ');
    // Trigger validation by interacting with continue.
    fireEvent.press(getByLabelText('Continue to the permissions step'));

    expect(getByText('Please enter a display name.')).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('keeps the Continue button disabled when the name is empty', () => {
    const { getByLabelText } = renderWithProviders(<GuestNameScreen />);

    const continueButton = getByLabelText('Continue to the permissions step');
    // Pressing a disabled Pressable is a no-op — verify no navigation.
    fireEvent.press(continueButton);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('saves the display name and navigates when "Continue" is pressed with a valid name', () => {
    const { getByLabelText } = renderWithProviders(<GuestNameScreen />);

    fireEvent.changeText(getByLabelText('Display name'), 'Priya');
    fireEvent.press(getByLabelText('Continue to the permissions step'));

    expect(useGuestStore.getState().displayName).toBe('Priya');
    expect(mockRouterPush).toHaveBeenCalledWith('/onboarding/permissions');
  });
});

describe('CompleteScreen', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    useGuestStore.getState().reset();
    useNavigationStore.setState({ onboardingComplete: false, hasUnsavedDraftChanges: false });
  });

  it('renders the success title and summary', () => {
    useGuestStore.getState().setDisplayName('Priya');
    const { getByText } = renderWithProviders(<CompleteScreen />);

    expect(getByText("You're all set!")).toBeTruthy();
    expect(getByText(/Priya/)).toBeTruthy();
  });

  it('falls back to "Guest" when no display name is set', () => {
    const { getByText } = renderWithProviders(<CompleteScreen />);
    expect(getByText(/Guest/)).toBeTruthy();
  });

  it('sets onboardingComplete=true and navigates to /(tabs) when "Enter BillLens" is pressed', () => {
    useGuestStore.getState().setDisplayName('Priya');
    const { getByLabelText } = renderWithProviders(<CompleteScreen />);

    expect(useNavigationStore.getState().onboardingComplete).toBe(false);

    fireEvent.press(getByLabelText('Finish onboarding and enter the app'));

    expect(useNavigationStore.getState().onboardingComplete).toBe(true);
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
