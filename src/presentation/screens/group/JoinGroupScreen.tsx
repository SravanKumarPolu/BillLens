/**
 * JoinGroupScreen — join an existing group via invite token (Prompt 16).
 *
 * Accepts an invite token or URL pasted by the user. Validates the
 * token format (hex, ≥ 32 chars) using the view-model layer. On
 * success, navigates back; on failure, shows an inline error.
 *
 * Phase 2: there is no real join-group use case yet, so the screen
 * validates the token shape only — it does not actually create a
 * group membership. The success path is wired so a later prompt can
 * replace `router.back()` with a navigation to the joined group's
 * home route.
 *
 * Architecture:
 *   - The thin container `JoinGroupScreen` holds the input string in
 *     `useState` and projects it into an `InviteTokenValidation`
 *     result via `validateInviteToken`. All validation lives in the
 *     view-model layer.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { TextInput } from 'react-native';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  type InviteTokenValidation,
  MIN_INVITE_TOKEN_LENGTH,
  validateInviteToken,
} from '@presentation/view-models/groups';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function JoinGroupScreen(): JSX.Element {
  const [token, setToken] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  const validation = useMemo(() => validateInviteToken(token), [token]);
  const showError = hasInteracted && !validation.isValid;

  return (
    <JoinGroupView
      token={token}
      validation={validation}
      showError={showError}
      onTokenChange={(next) => {
        setToken(next);
        if (!hasInteracted) setHasInteracted(true);
      }}
      onJoin={() => {
        setHasInteracted(true);
        if (validation.isValid) {
          // Phase 2: no real join use case yet — go back to the list.
          // A later prompt will navigate to the joined group's home.
          router.back();
        }
      }}
      onCancel={() => router.back()}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface JoinGroupViewProps {
  readonly token: string;
  readonly validation: InviteTokenValidation;
  readonly showError: boolean;
  readonly onTokenChange: (value: string) => void;
  readonly onJoin: () => void;
  readonly onCancel: () => void;
}

export function JoinGroupView({
  token,
  validation,
  showError,
  onTokenChange,
  onJoin,
  onCancel,
}: JoinGroupViewProps): JSX.Element {
  const theme = useTheme();
  const canJoin = validation.isValid;

  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Join Group
          </Text>
          <Text variant="body" color="secondary">
            Paste an invite link or token to join a group.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Text variant="label" color="secondary">
              Invite token or link
            </Text>
            <TextInput
              value={token}
              onChangeText={onTokenChange}
              placeholder="e.g. https://billlens.app/join?token=…"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Invite token or link"
              accessibilityHint="Paste an invite link or the raw token from the group creator"
              accessibilityValue={{ text: token }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              multiline
              style={[
                theme.typography.input,
                {
                  color: theme.colors.textPrimary,
                  borderWidth: 1,
                  borderColor: showError ? theme.colors.negative : theme.colors.border,
                  borderRadius: theme.borderRadius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  minHeight: 64,
                },
              ]}
            />
            {showError && validation.error ? (
              <Text variant="error" color="negative" accessibilityRole="alert">
                {validation.error}
              </Text>
            ) : null}
            <Text variant="caption" color="muted">
              Tokens are at least {MIN_INVITE_TOKEN_LENGTH} hex characters.
            </Text>
          </Stack>
        </Card>

        <Card elevation="none" padding="md" accessibilityRole="text">
          <Row gap="sm" align="flex-start">
            <Icon
              name="information-circle-outline"
              size={theme.iconSizes.md}
              color={theme.colors.info}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="caption" color="secondary">
                Ask the group creator for an invite link.
              </Text>
            </Stack>
          </Row>
        </Card>

        <Stack gap="sm" align="stretch" style={{ marginTop: spacing.md }}>
          <Button
            label="Join"
            variant="primary"
            size="lg"
            disabled={!canJoin}
            onPress={onJoin}
            accessibilityLabel="Join the group"
            icon="log-in-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel="Cancel and go back"
          />
        </Stack>
      </Stack>
    </Screen>
  );
}
