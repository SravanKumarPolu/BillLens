/**
 * JoinGroupScreen — join an existing group via invite token (Prompt 16).
 *
 * Accepts an invite token or URL pasted by the user and validates its
 * shape (hex, ≥ 32 chars) through the view-model layer.
 *
 * IMPORTANT (v2.26.2): this build cannot actually join a remote group.
 * `JoinGroupUseCase` resolves invites through a LOCAL invite repository,
 * and no invite adapter is wired into the composition root; a remote
 * invite also only reaches this device through the encrypted relay, which
 * is not deployed. The screen therefore reports that joining is
 * unavailable instead of navigating back as if the join had succeeded.
 * The previous behaviour silently implied success.
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

const JOIN_UNAVAILABLE_NOTICE =
  'Joining another device\'s group needs the encrypted relay, which is not deployed in this build. The token format was checked on this device, but no group was joined. You can create a group here and add members locally.';

export function JoinGroupScreen(): JSX.Element {
  const [token, setToken] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const validation = useMemo(() => validateInviteToken(token), [token]);
  const showError = hasInteracted && !validation.isValid;

  return (
    <JoinGroupView
      token={token}
      validation={validation}
      showError={showError}
      notice={notice}
      onTokenChange={(next) => {
        setToken(next);
        setNotice(null);
        if (!hasInteracted) setHasInteracted(true);
      }}
      onJoin={() => {
        setHasInteracted(true);
        if (!validation.isValid) return;
        // Do not navigate: no membership was created.
        setNotice(JOIN_UNAVAILABLE_NOTICE);
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
  /** Honest outcome message when joining is unavailable on this build. */
  readonly notice?: string | null;
  readonly onTokenChange: (value: string) => void;
  readonly onJoin: () => void;
  readonly onCancel: () => void;
}

export function JoinGroupView({
  token,
  validation,
  showError,
  notice,
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
            {notice !== null && notice !== undefined && notice !== '' ? (
              <Text variant="caption" color="negative" accessibilityRole="alert">
                {notice}
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
                Ask the group creator for an invite link. Joining another device&apos;s group
                requires the encrypted relay; until it is deployed you can create a group and
                add members on this device.
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
