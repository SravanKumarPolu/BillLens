/**
 * DeleteAccountScreen — in-app account deletion (Phase 8, Prompt 77).
 *
 * Apple App Review Guideline 5.1.1(v) and the Google Play Account
 * Deletion policy require a working in-app deletion flow. This screen
 * implements the required UX:
 *
 *   1. Explain consequences BEFORE any destructive action:
 *        - what is deleted (cloud account + all synced data / local data)
 *        - what happens to group history (preserved for other members
 *          unless they also delete)
 *        - the recovery window (14 days) and how to cancel
 *   2. Require an explicit two-step confirmation (acknowledge toggle,
 *      then destructive button, then a system confirm dialog).
 *   3. Execute the deletion through an injected executor and show the
 *      outcome (scheduled with deadline, or immediate guest wipe).
 *
 * The executor is injected (prop) because the DI composition root is
 * not wired yet (see IMPLEMENTATION_STATUS.md "Known limitations").
 * The default executor surfaces an actionable error instead of
 * pretending deletion happened — the screen NEVER fakes success.
 *
 * Accessibility: every interactive element carries an accessibilityLabel,
 * the acknowledgement state change is announced, and touch targets meet
 * the 44pt minimum via the design-system Button.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeleteAccountOutcome =
  | { readonly kind: 'scheduled'; readonly recoveryDeadlineAt: string }
  | { readonly kind: 'guest_wipe_completed' }
  | { readonly kind: 'error'; readonly message: string };

export type DeleteAccountExecutor = () => Promise<DeleteAccountOutcome>;

// ---------------------------------------------------------------------------
// Static consequence copy (mirrors docs/legal/account-deletion-policy.md)
// ---------------------------------------------------------------------------

const WHAT_IS_DELETED = [
  'Your BillLens account and profile',
  'Your groups, expenses and settlements you synced to the cloud',
  'Receipt images and payment screenshots stored for you',
  'Notification settings, privacy preferences and reminders',
];

const WHAT_IS_PRESERVED = [
  'Expenses other members paid for stay visible to them — their records are not erased',
  'Audit records required for financial integrity and dispute resolution',
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export interface DeleteAccountScreenProps {
  /**
   * Executes the deletion. Injected by the composition root; when
   * omitted the screen shows a safe "not configured" error on press.
   */
  readonly onConfirmDelete?: DeleteAccountExecutor;
}

export function DeleteAccountScreen({
  onConfirmDelete,
}: DeleteAccountScreenProps): JSX.Element {
  const theme = useTheme();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DeleteAccountOutcome | null>(null);

  const runDeletion = async (): Promise<void> => {
    if (!onConfirmDelete) {
      setOutcome({
        kind: 'error',
        message:
          'Account deletion is not available right now. Please try again later or contact support.',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await onConfirmDelete();
      setOutcome(result);
      if (result.kind !== 'error') {
        // Deletion accepted — return to the entry screen after a beat.
        router.replace('/(tabs)/settings');
      }
    } finally {
      setBusy(false);
    }
  };

  const pressDelete = (): void => {
    Alert.alert(
      'Delete your account?',
      'This starts permanent deletion of your account and data after the 14-day recovery window. This cannot be undone after the window closes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, delete everything',
          style: 'destructive',
          onPress: () => {
            void runDeletion();
          },
        },
      ],
    );
  };

  return (
    <Screen scrollable>
      <Stack gap="lg" style={{ padding: spacing.lg }}>
        <Text variant="screenTitle">Delete account</Text>

        {outcome?.kind === 'scheduled' ? (
          <Card>
            <Stack gap="sm">
              <Row gap="sm" align="center">
                <Icon name="checkmark-circle" color={theme.colors.positive} />
                <Text variant="cardTitle">Deletion scheduled</Text>
              </Row>
              <Text variant="body">
                Your account will be permanently deleted on{' '}
                {outcome.recoveryDeadlineAt}. You can cancel any time before
                that date by signing in again.
              </Text>
            </Stack>
          </Card>
        ) : outcome?.kind === 'guest_wipe_completed' ? (
          <Card>
            <Stack gap="sm">
              <Row gap="sm" align="center">
                <Icon name="checkmark-circle" color={theme.colors.positive} />
                <Text variant="cardTitle">All local data deleted</Text>
              </Row>
              <Text variant="body">
                This device no longer stores any BillLens data. You were using
                guest mode, so there was no cloud account to delete.
              </Text>
            </Stack>
          </Card>
        ) : (
          <>
            {/* Consequences — what is deleted */}
            <Card>
              <Stack gap="sm">
                <Text variant="cardTitle">What will be deleted</Text>
                {WHAT_IS_DELETED.map((item) => (
                  <Row key={item} gap="sm" align="center">
                    <Icon name="trash" size={16} color={theme.colors.negative} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {item}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Card>

            {/* Consequences — what is preserved */}
            <Card>
              <Stack gap="sm">
                <Text variant="cardTitle">What is preserved</Text>
                {WHAT_IS_PRESERVED.map((item) => (
                  <Row key={item} gap="sm" align="center">
                    <Icon name="shield-checkmark" size={16} color={theme.colors.info} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {item}
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Card>

            {/* Recovery window */}
            <Card>
              <Stack gap="sm">
                <Text variant="cardTitle">Recovery window</Text>
                <Text variant="body">
                  Deletion is not immediate. You have 14 days to change your
                  mind — sign in again and cancel the request. After 14 days
                  the deletion is permanent and cannot be reversed.
                </Text>
              </Stack>
            </Card>

            {/* Explicit acknowledgement (two-step confirmation, step 1) */}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              accessibilityLabel="I understand this permanently deletes my account and data"
              onPress={() => setAcknowledged((v) => !v)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Row gap="sm" align="center">
                <Icon
                  name={acknowledged ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={acknowledged ? theme.colors.brandPrimary : theme.colors.textMuted}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  I understand this permanently deletes my account and my data.
                </Text>
              </Row>
            </Pressable>

            {outcome?.kind === 'error' ? (
              <Card>
                <Text variant="body" style={{ color: theme.colors.negative }}>
                  {outcome.message}
                </Text>
              </Card>
            ) : null}

            {/* Final destructive action (two-step confirmation, step 2) */}
            <Button
              label="Delete my account"
              variant="destructive"
              disabled={!acknowledged || busy}
              onPress={pressDelete}
              accessibilityLabel="Delete my account permanently"
            />
          </>
        )}
      </Stack>
    </Screen>
  );
}
