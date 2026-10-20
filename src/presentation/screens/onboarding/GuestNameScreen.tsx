/**
 * GuestNameScreen — second onboarding step (Prompt 14).
 *
 * Lets the user pick a display name. The name is persisted to the guest
 * store (a real `GuestIdentity` entity is materialised by an application
 * use case in a later prompt; until then this screen just collects and
 * stores the name).
 *
 * Validation:
 *   - Reject empty / whitespace-only names.
 *   - Reject names longer than the domain maximum (80 chars).
 *   - Show an inline error message when invalid.
 *
 * The "Continue" button is disabled while the input is invalid.
 *
 * The raw `TextInput` from react-native is allowed here — the design
 * system does not yet export a themed TextInput. It is styled with
 * design-system tokens so it stays visually consistent.
 */

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGuestStore } from '@store/guest-store';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

const MAX_NAME_LENGTH = 80;

function validateName(raw: string): { readonly isValid: boolean; readonly error: string | null } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Please enter a display name.' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      isValid: false,
      error: `Display name must be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }
  return { isValid: true, error: null };
}

export function GuestNameScreen(): JSX.Element {
  const theme = useTheme();
  const setDisplayName = useGuestStore((s) => s.setDisplayName);
  const [name, setName] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const servicesReady = useAppServicesReady();
  const identityCreatedRef = useRef(false);

  // v2.4.0: materialise the DURABLE guest identity (SQLite + SecureStore
  // device secret) as soon as the name is valid and services are ready —
  // previously the name only reached the zustand store and every capture/
  // expense wrote under the synthetic 'local-user' with no identity at
  // all. Idempotent: the use case refuses a second identity, and this
  // effect guards itself against double-fires.
  const trimmed = name.trim();
  useEffect(() => {
    if (!servicesReady || identityCreatedRef.current) return;
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return;
    const services = tryGetAppServices();
    const identity = services?.identity ?? null;
    if (identity === null) return;
    identityCreatedRef.current = true;
    void (async () => {
      try {
        await identity.createGuestIdentity.execute({ displayName: trimmed });
      } catch (error) {
        // "Identity already exists" is fine (re-onboarding, hot reload);
        // anything else surfaces via the sync/diagnostics surfaces — the
        // guest store still holds the name for the UI.
        if (error instanceof Error && !/already exists/i.test(error.message)) {
          identityCreatedRef.current = false; // allow retry on next edit
        }
      }
    })();
  }, [servicesReady, trimmed]);

  const validation = validateName(name);
  const showError = hasInteracted && !validation.isValid;
  const canContinue = validation.isValid;

  const handleChange = (next: string): void => {
    setName(next);
    if (!hasInteracted) setHasInteracted(true);
  };

  const handleContinue = (): void => {
    if (!canContinue) {
      setHasInteracted(true);
      return;
    }
    setDisplayName(trimmed);
    router.push('/onboarding/permissions');
  };

  const handleSubmit = (): void => {
    setHasInteracted(true);
    handleContinue();
  };

  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="sm" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            What should we call you?
          </Text>
          <Text variant="body" color="secondary">
            This name appears in shared groups. You can change it later.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Text variant="label" color="secondary">
              Display name
            </Text>
            <TextInput
              value={name}
              onChangeText={handleChange}
              onSubmitEditing={handleSubmit}
              placeholder="e.g. Priya"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={MAX_NAME_LENGTH}
              accessibilityLabel="Display name"
              accessibilityHint="Enter the name others will see on shared expenses"
              accessibilityValue={{ text: trimmed }}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              style={[
                theme.typography.input,
                {
                  color: theme.colors.textPrimary,
                  borderWidth: 1,
                  borderColor: showError ? theme.colors.negative : theme.colors.border,
                  borderRadius: theme.borderRadius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  minHeight: 48,
                },
              ]}
            />
            {showError && validation.error ? (
              <Text variant="error" color="negative" accessibilityRole="alert">
                {validation.error}
              </Text>
            ) : null}
            <Text variant="caption" color="muted">
              {trimmed.length}/{MAX_NAME_LENGTH} characters
            </Text>
          </Stack>
        </Card>

        <Button
          label="Continue"
          variant="primary"
          size="lg"
          disabled={!canContinue}
          onPress={handleContinue}
          accessibilityLabel="Continue to the permissions step"
          accessibilityState={{ disabled: !canContinue }}
        />
      </Stack>
    </Screen>
  );
}
