/**
 * GroupSettingsScreen — per-group settings (Prompt 16).
 *
 * Renders:
 *   - Group name (editable, inline save).
 *   - Currency (display only for Phase 2 — the design system does not
 *     ship a currency picker yet).
 *   - Members list with roles.
 *   - Privacy preferences summary.
 *   - Danger zone: Archive group, Leave group.
 *
 * Phase 2: members and privacy edits are read-only — they will be
 * wired up to the SQLite repositories in a later prompt. The
 * editable-name field and the archive/leave actions are live and
 * update the group store.
 *
 * Architecture:
 *   - The thin container reads `useGroupStore` and builds a
 *     `GroupDetailViewModel` (without financial data) for the
 *     member-row projection.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';

import { Avatar } from '@presentation/design-system/components/Avatar';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupMembers } from '@presentation/hooks/use-group-members';
import {
  GROUP_NAME_MAX_LENGTH,
  PRIVACY_DEFAULT_DESCRIPTIONS,
  PRIVACY_DEFAULT_ICONS,
  PRIVACY_DEFAULT_LABELS,
  validateGroupName,
} from '@presentation/view-models/groups';
import { useGroupStore, type GroupSummary } from '@store/group-store';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface GroupSettingsScreenProps {
  readonly groupId: string;
}

export function GroupSettingsScreen({ groupId }: GroupSettingsScreenProps): JSX.Element {
  const group = useGroupStore((s) => s.groups.find((g) => g.id === groupId));
  const renameGroup = useGroupStore((s) => s.renameGroup);
  const archiveGroup = useGroupStore((s) => s.archiveGroup);
  const unarchiveGroup = useGroupStore((s) => s.unarchiveGroup);
  const leaveGroup = useGroupStore((s) => s.leaveGroup);
  const groupMembers = useGroupMembers(groupId);

  const [name, setName] = useState(group?.name ?? '');
  useEffect(() => {
    setName(group?.name ?? '');
  }, [group?.name]);

  const validation = validateGroupName(name);
  const isDirty = name.trim() !== (group?.name ?? '');

  const handleSaveName = (): void => {
    if (!validation.isValid) return;
    if (!isDirty) return;
    renameGroup(groupId, name);
  };

  const handleArchive = (): void => {
    archiveGroup(groupId);
    router.back();
  };

  const handleUnarchive = (): void => {
    unarchiveGroup(groupId);
  };

  const handleLeave = (): void => {
    leaveGroup(groupId);
    router.replace('/(tabs)/groups');
  };

  return (
    <GroupSettingsView
      group={group}
      name={name}
      nameError={validation.error}
      isDirty={isDirty}
      canSave={validation.isValid && isDirty}
      onNameChange={setName}
      onSaveName={handleSaveName}
      onArchive={handleArchive}
      onUnarchive={handleUnarchive}
      onLeave={handleLeave}
      onBack={() => router.back()}
      members={groupMembers.members}
      membersLoading={groupMembers.loading}
      membersLoadError={groupMembers.error}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface GroupSettingsViewProps {
  readonly group: GroupSummary | undefined;
  readonly name: string;
  readonly nameError: string | null;
  readonly isDirty: boolean;
  readonly canSave: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onSaveName: () => void;
  readonly onArchive: () => void;
  readonly onUnarchive: () => void;
  readonly onLeave: () => void;
  readonly onBack: () => void;
  readonly members: readonly { id: string; displayName: string; role: 'owner' | 'admin' | 'member'; isCurrentUser: boolean }[];
  readonly membersLoading: boolean;
  readonly membersLoadError: string | null;
}

export function GroupSettingsView({
  group,
  name,
  nameError,
  isDirty,
  canSave,
  onNameChange,
  onSaveName,
  onArchive,
  onUnarchive,
  onLeave,
  onBack,
  members,
  membersLoading,
  membersLoadError,
}: GroupSettingsViewProps): JSX.Element {
  const theme = useTheme();
  const trimmed = name.trim();
  const showNameError = nameError !== null && isDirty;

  return (
    <Screen scrollable safeArea avoidKeyboard>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Row gap="sm" align="center">
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            onPress={onBack}
            accessibilityLabel="Go back to the group home"
            icon="chevron-back-outline"
          />
        </Row>

        <Text variant="screenTitle" color="primary" accessibilityRole="header">
          Group settings
        </Text>

        {/* Group name */}
        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Text variant="label" color="secondary">
              Group name
            </Text>
            <TextInput
              value={name}
              onChangeText={onNameChange}
              placeholder="Group name"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={GROUP_NAME_MAX_LENGTH}
              accessibilityLabel="Edit group name"
              accessibilityHint="1–100 characters"
              accessibilityValue={{ text: trimmed }}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              style={[
                theme.typography.input,
                {
                  color: theme.colors.textPrimary,
                  borderWidth: 1,
                  borderColor: showNameError ? theme.colors.negative : theme.colors.border,
                  borderRadius: theme.borderRadius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  minHeight: 48,
                },
              ]}
            />
            {showNameError && nameError ? (
              <Text variant="error" color="negative" accessibilityRole="alert">
                {nameError}
              </Text>
            ) : null}
            <Text variant="caption" color="muted">
              {trimmed.length}/{GROUP_NAME_MAX_LENGTH} characters
            </Text>
            <Button
              label="Save name"
              variant="primary"
              size="sm"
              disabled={!canSave}
              onPress={onSaveName}
              accessibilityLabel="Save the new group name"
              icon="checkmark-outline"
            />
          </Stack>
        </Card>

        {/* Currency (display only) */}
        <Card elevation="sm" padding="lg">
          <Stack gap="xs" align="stretch">
            <Text variant="label" color="secondary">
              Default currency
            </Text>
            <Row gap="sm" align="center">
              <Icon name="cash-outline" size={theme.iconSizes.md} color={theme.colors.textSecondary} />
              <Text variant="bodyStrong" color="primary">
                {group?.currencyCode ?? 'USD'}
              </Text>
            </Row>
            <Text variant="caption" color="muted">
              Currency is set when the group is created and cannot be changed.
            </Text>
          </Stack>
        </Card>

        {/* Members */}
        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Stack gap={0}>
              <Text variant="label" color="secondary">
                Members
              </Text>
              <Text variant="caption" color="muted">
                {members.length} {members.length === 1 ? 'person is' : 'people are'} in this group.
              </Text>
            </Stack>
            {membersLoading ? (
              <Row gap="md" align="center">
                <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
                <Text variant="caption" color="secondary">
                  Loading members…
                </Text>
              </Row>
            ) : membersLoadError !== null ? (
              <Text variant="caption" color="critical">
                {membersLoadError}
              </Text>
            ) : members.length === 0 ? (
              <Text variant="caption" color="muted">
                No members have joined yet.
              </Text>
            ) : (
              <Stack gap="sm" align="stretch">
                {members.map((m) => (
                  <Row key={m.id} gap="md" align="center">
                    <Avatar name={m.displayName} size="md" />
                    <Stack gap={0} style={{ flex: 1 }}>
                      <Text variant="bodyStrong" color="primary">
                        {m.displayName}
                        {m.isCurrentUser ? ' (you)' : ''}
                      </Text>
                      <Text variant="caption" color="muted">
                        {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                      </Text>
                    </Stack>
                    {m.role === 'owner' ? (
                      <Icon name="star" size={theme.iconSizes.sm} color={theme.colors.warning} />
                    ) : null}
                  </Row>
                ))}
              </Stack>
            )}
            <Text variant="caption" color="muted">
              Invite links and member-role management land with the identity adapters.
            </Text>
          </Stack>
        </Card>

        {/* Privacy preferences summary */}
        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Text variant="label" color="secondary">
              Receipt privacy default
            </Text>
            <Row gap="sm" align="center">
              <Icon
                name={PRIVACY_DEFAULT_ICONS[group?.privacyDefault ?? 'local_only']}
                size={theme.iconSizes.md}
                color={theme.colors.brandPrimary}
              />
              <Stack gap={0} style={{ flex: 1 }}>
                <Text variant="bodyStrong" color="primary">
                  {PRIVACY_DEFAULT_LABELS[group?.privacyDefault ?? 'local_only']}
                </Text>
                <Text variant="caption" color="muted">
                  {PRIVACY_DEFAULT_DESCRIPTIONS[group?.privacyDefault ?? 'local_only']}
                </Text>
              </Stack>
            </Row>
            <Text variant="caption" color="muted">
              Set when the group was created. Editing is not yet available in Phase 2.
            </Text>
          </Stack>
        </Card>

        {/* Danger zone */}
        <Card
          elevation="sm"
          padding="lg"
          style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
        >
          <Stack gap="md" align="stretch">
            <Text variant="label" color="negative">
              Danger zone
            </Text>
            {group?.archived ? (
              <PressableAction
                icon="archive-outline"
                label="Unarchive group"
                description="Restore this group to the active list."
                onPress={onUnarchive}
                accessibilityLabel="Unarchive this group"
              />
            ) : (
              <PressableAction
                icon="archive-outline"
                label="Archive group"
                description="Hide this group from the active list. Your data is preserved."
                onPress={onArchive}
                accessibilityLabel="Archive this group"
              />
            )}
            <PressableAction
              icon="log-out-outline"
              label="Leave group"
              description="Remove yourself from this group. You will lose access to its data."
              onPress={onLeave}
              accessibilityLabel="Leave this group permanently"
              destructive
            />
          </Stack>
        </Card>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Pressable action row
// ---------------------------------------------------------------------------

interface PressableActionProps {
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly destructive?: boolean;
}

function PressableAction({
  icon,
  label,
  description,
  onPress,
  accessibilityLabel,
  destructive = false,
}: PressableActionProps): ReactNode {
  const theme = useTheme();
  const accent = destructive ? theme.colors.negative : theme.colors.brandPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={description}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        minHeight: 48,
      })}
    >
      <Icon name={icon} size={theme.iconSizes.lg} color={accent} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={destructive ? 'negative' : 'primary'}>
          {label}
        </Text>
        <Text variant="caption" color="secondary">
          {description}
        </Text>
      </Stack>
      <Icon name="chevron-forward" size={theme.iconSizes.md} color={theme.colors.textMuted} />
    </Pressable>
  );
}
