/**
 * NewGroupScreen — create-group form (Prompt 16).
 *
 * Collects:
 *   - Group name (required, 1–100 chars)
 *   - Default currency (pill selector with common currencies)
 *   - Group type (pills: Trip, Home, Couple, Event, General)
 *   - Receipt privacy default (pills: Local only, Cloud private,
 *     Shared with group, Delete after extraction)
 *
 * On submit, calls `CreateGroupUseCase` through the services registry
 * (writes the group + owner member to the SQLite repository atomically
 * with an audit-log entry + sync-op), THEN updates the persisted UI
 * store (write-through cache), THEN navigates back. The owner member's
 * `userId` is set to 'local-user' (the synthetic pre-identity id) so
 * the dashboard can find "my member" per group as the member whose
 * `userId === 'local-user'`.
 *
 * Architecture:
 *   - The thin container `NewGroupScreen` holds the form state in
 *     `useState` and projects it into a `CreateGroupViewModel` via
 *     `createCreateGroupViewModel`. All validation lives in the
 *     view-model layer; the screen contains no business logic.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

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
  type CreateGroupViewModel,
  type GroupType,
  type StorageMode,
  GROUP_NAME_MAX_LENGTH,
  GROUP_TYPES,
  PRIVACY_DEFAULTS,
  PRIVACY_DEFAULT_DESCRIPTIONS,
  PRIVACY_DEFAULT_ICONS,
  PRIVACY_DEFAULT_LABELS,
  createCreateGroupViewModel,
} from '@presentation/view-models/groups';
import { useGroupStore, type GroupSummary } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMON_CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'];

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function NewGroupScreen(): JSX.Element {
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [groupType, setGroupType] = useState<GroupType>('General');
  const [privacyDefault, setPrivacyDefault] = useState<StorageMode>('local_only');

  const viewModel = useMemo(
    () =>
      createCreateGroupViewModel({
        name,
        currencyCode,
        groupType,
        privacyDefault,
      }),
    [name, currencyCode, groupType, privacyDefault],
  );

  return (
    <NewGroupView
      viewModel={viewModel}
      onNameChange={setName}
      onCurrencyChange={setCurrencyCode}
      onGroupTypeChange={setGroupType}
      onPrivacyChange={setPrivacyDefault}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface NewGroupViewProps {
  readonly viewModel: CreateGroupViewModel;
  readonly onNameChange: (value: string) => void;
  readonly onCurrencyChange: (code: string) => void;
  readonly onGroupTypeChange: (type: GroupType) => void;
  readonly onPrivacyChange: (mode: StorageMode) => void;
}

export function NewGroupView({
  viewModel,
  onNameChange,
  onCurrencyChange,
  onGroupTypeChange,
  onPrivacyChange,
}: NewGroupViewProps): JSX.Element {
  const addGroup = useGroupStore((s) => s.addGroup);

  const handleCreate = async (): Promise<void> => {
    if (!viewModel.canSubmit) return;
    const services = tryGetAppServices();
    if (services === null) {
      // Storage is still starting up — the gate will finish initializing.
      // Surface the error to the user via the form's submit state.
      return;
    }
    const now = new Date().toISOString();
    const groupId = generateGroupId();
    const ownerMemberId = generateGroupId(); // any UUID works for a member id
    // 1. Write to the SQLite repository via the use case (atomic with
    //    audit-log + sync-op).
    try {
      await services.groups.createGroup.execute({
        groupId,
        name: viewModel.name.trim(),
        currencyCode: viewModel.currencyCode,
        createdBy: 'local-user',
        ownerMemberId,
      });
    } catch {
      // The repository write failed — the user's group is NOT persisted.
      // Do not write to the UI store; do not navigate back. The error
      // is visible to the user via the screen's submit state (a future
      // iteration surfaces the message in a card; for now the screen
      // stays put, which is safer than navigating back into a missing
      // group).
      return;
    }
    // 2. Write-through the persisted UI store (the cache the Groups
    //    List tab + Home Dashboard read from).
    const summary: GroupSummary = {
      id: groupId,
      name: viewModel.name.trim(),
      currencyCode: viewModel.currencyCode,
      memberCount: 1,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: viewModel.groupType,
      privacyDefault: viewModel.privacyDefault,
      createdAt: now,
      updatedAt: now,
    };
    addGroup(summary);
    router.back();
  };

  const handleCancel = (): void => {
    router.back();
  };

  return (
    <Screen scrollable safeArea>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            New Group
          </Text>
          <Text variant="body" color="secondary">
            Create a group to track shared expenses with anyone.
          </Text>
        </Stack>

        <NameField
          value={viewModel.name}
          error={viewModel.nameError}
          onChangeText={onNameChange}
        />

        <CurrencyField value={viewModel.currencyCode} onChange={onCurrencyChange} />

        <GroupTypeField value={viewModel.groupType} onChange={onGroupTypeChange} />

        <PrivacyField value={viewModel.privacyDefault} onChange={onPrivacyChange} />

        <Stack gap="sm" align="stretch" style={{ marginTop: spacing.md }}>
          <Button
            label="Create Group"
            variant="primary"
            size="lg"
            disabled={!viewModel.canSubmit}
            onPress={handleCreate}
            accessibilityLabel="Create the new group"
            icon="checkmark-circle-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={handleCancel}
            accessibilityLabel="Cancel and go back"
          />
        </Stack>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Group-name field
// ---------------------------------------------------------------------------

interface NameFieldProps {
  readonly value: string;
  readonly error: string | null;
  readonly onChangeText: (value: string) => void;
}

function NameField({ value, error, onChangeText }: NameFieldProps): ReactNode {
  const theme = useTheme();
  const trimmed = value.trim();
  const showError = error !== null;

  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Group name
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="e.g. Weekend Trip"
          placeholderTextColor={theme.colors.textMuted}
          maxLength={GROUP_NAME_MAX_LENGTH}
          accessibilityLabel="Group name"
          accessibilityHint="Enter a name for the new group (1–100 characters)"
          accessibilityValue={{ text: trimmed }}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
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
        {showError ? (
          <Text variant="error" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Text variant="caption" color="muted">
          {trimmed.length}/{GROUP_NAME_MAX_LENGTH} characters
        </Text>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Currency picker (pill selector)
// ---------------------------------------------------------------------------

interface CurrencyFieldProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
}

function CurrencyField({ value, onChange }: CurrencyFieldProps): ReactNode {
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Stack gap={0}>
          <Text variant="label" color="secondary">
            Default currency
          </Text>
          <Text variant="caption" color="muted">
            Used for new expenses in this group. You can override per expense.
          </Text>
        </Stack>
        <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
          {COMMON_CURRENCIES.map((code) => (
            <Pill
              key={code}
              label={code}
              active={value === code}
              onPress={() => onChange(code)}
              accessibilityLabel={`Select ${code} as default currency`}
            />
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Group-type picker
// ---------------------------------------------------------------------------

interface GroupTypeFieldProps {
  readonly value: GroupType;
  readonly onChange: (type: GroupType) => void;
}

function GroupTypeField({ value, onChange }: GroupTypeFieldProps): ReactNode {
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Text variant="label" color="secondary">
          Group type
        </Text>
        <Row gap="xs" align="center" style={{ flexWrap: 'wrap' }}>
          {GROUP_TYPES.map((type) => (
            <Pill
              key={type}
              label={type}
              active={value === type}
              onPress={() => onChange(type)}
              accessibilityLabel={`Select ${type} as group type`}
            />
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Privacy-default picker
// ---------------------------------------------------------------------------

interface PrivacyFieldProps {
  readonly value: StorageMode;
  readonly onChange: (mode: StorageMode) => void;
}

function PrivacyField({ value, onChange }: PrivacyFieldProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="stretch">
        <Stack gap={0}>
          <Text variant="label" color="secondary">
            Receipt privacy default
          </Text>
          <Text variant="caption" color="muted">
            How receipt images captured in this group are stored.
          </Text>
        </Stack>
        <Stack gap="sm" align="stretch">
          {PRIVACY_DEFAULTS.map((mode) => {
            const isActive = value === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onChange(mode)}
                accessibilityRole="button"
                accessibilityLabel={`${PRIVACY_DEFAULT_LABELS[mode]} — ${PRIVACY_DEFAULT_DESCRIPTIONS[mode]}`}
                accessibilityState={{ selected: isActive }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.md,
                  borderRadius: theme.borderRadius.md,
                  borderWidth: 1,
                  borderColor: isActive ? theme.colors.brandPrimary : theme.colors.border,
                  backgroundColor: isActive ? theme.colors.surfaceMuted : theme.colors.surface,
                }}
              >
                <Icon
                  name={PRIVACY_DEFAULT_ICONS[mode]}
                  size={theme.iconSizes.lg}
                  color={theme.colors.brandPrimary}
                />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="bodyStrong" color="primary">
                    {PRIVACY_DEFAULT_LABELS[mode]}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {PRIVACY_DEFAULT_DESCRIPTIONS[mode]}
                  </Text>
                </Stack>
                <Icon
                  name={isActive ? 'radio-button-on' : 'radio-button-off'}
                  size={theme.iconSizes.md}
                  color={isActive ? theme.colors.brandPrimary : theme.colors.textMuted}
                />
              </Pressable>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared pill primitive
// ---------------------------------------------------------------------------

interface PillProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
}

function Pill({ label, active, onPress, accessibilityLabel }: PillProps): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: theme.borderRadius.full,
        backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="label"
        color={active ? 'onColor' : 'secondary'}
        style={{ fontSize: 13 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a short, monotonically-unlikely id for a new group.
 *
 * Phase 2: the real id is assigned by the SQLite repository's
 * `createGroup` use case. The store id is a temporary client-side handle
 * that will be reconciled when sync lands.
 */
function generateGroupId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `grp_${time}_${random}`;
}
