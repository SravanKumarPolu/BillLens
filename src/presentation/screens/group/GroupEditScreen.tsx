/**
 * Edit group — name, description, category, icon and guarded currency.
 *
 * Currency changes are rejected by the use case when expenses/settlements
 * exist; the field is disabled in that case rather than silently reinterpreting
 * historical amounts.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';

import type { Group, GroupCategory } from '@domain/entities/group';
import { GROUP_CATEGORIES } from '@domain/entities/group';
import { Button } from '@presentation/design-system/components/Button';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

const CATEGORY_LABELS: Record<GroupCategory, string> = {
  trip: 'Trip',
  home: 'Home',
  friends: 'Friends',
  office: 'Office',
  other: 'Other',
};

export default function GroupEditScreen(): ReactNode {
  const theme = useTheme();
  const { groupId = '' } = useLocalSearchParams<{ groupId?: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<GroupCategory>('other');
  const [icon, setIcon] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      try {
        const loaded = await services.groups.get.execute(groupId);
        const counts = await services.groups.deletionSummary.execute(groupId);
        setGroup(loaded);
        setName(loaded.name);
        setDescription(loaded.description ?? '');
        setCategory(loaded.category ?? 'other');
        setIcon(loaded.icon ?? '');
        setCurrency(loaded.currencyCode as string);
        setLocked(counts.expenses > 0 || counts.settlements > 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the group.');
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  const save = (): void => {
    if (group === null) return;
    const services = tryGetAppServices();
    if (services === null) return;
    setSaving(true);
    setError(null);
    void services.groups.update
      .execute({
        groupId,
        name,
        ...(description.trim().length > 0 ? { description } : {}),
        category,
        ...(icon.trim().length > 0 ? { icon: icon.trim() } : {}),
        currencyCode: currency.trim().toUpperCase(),
        expectedVersion: group.version as number,
        actorUserId: 'local-user',
      })
      .then(
        (updated) => {
          useGroupStore.getState().upsertGroup({
            ...(useGroupStore.getState().groups.find((entry) => entry.id === groupId) ?? {
              id: groupId,
              memberCount: 0,
              userBalanceMinor: 0,
              lastActivityLabel: '',
              archived: false,
              syncState: 'local',
              groupType: 'general',
              privacyDefault: 'local_only',
            }),
            id: groupId,
            name: updated.name,
            currencyCode: updated.currencyCode as string,
          } as never);
          router.back();
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not save the group.');
          setSaving(false);
        },
      );
  };

  if (loading) {
    return (
      <Screen safeArea>
        <ActivityIndicator style={{ marginTop: spacing.xl }} accessibilityLabel="Loading group" />
      </Screen>
    );
  }

  return (
    <Screen safeArea scrollable avoidKeyboard>
      <Stack gap="lg" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" accessibilityRole="header">
          Edit group
        </Text>
        <Text variant="caption" color="muted">
          Group name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          accessibilityLabel="Group name"
          maxLength={100}
          style={inputStyle(theme)}
        />

        <Text variant="caption" color="muted">
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          accessibilityLabel="Group description"
          maxLength={500}
          multiline
          style={{ ...inputStyle(theme), minHeight: 88, textAlignVertical: 'top' }}
        />

        <Text variant="caption" color="muted">
          Category
        </Text>
        <Row gap="xs" style={{ flexWrap: 'wrap' }}>
          {GROUP_CATEGORIES.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: category === value }}
              onPress={() => setCategory(value)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
                borderRadius: theme.borderRadius.full,
                borderWidth: 1,
                borderColor: category === value ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: category === value ? theme.colors.brandPrimary : theme.colors.surface,
              }}
            >
              <Text variant="caption" color={category === value ? 'onColor' : 'secondary'}>
                {CATEGORY_LABELS[value]}
              </Text>
            </Pressable>
          ))}
        </Row>

        <Text variant="caption" color="muted">
          Icon (optional emoji)
        </Text>
        <TextInput
          value={icon}
          onChangeText={setIcon}
          accessibilityLabel="Group icon"
          maxLength={4}
          style={inputStyle(theme)}
        />

        <Text variant="caption" color="muted">
          Currency
        </Text>
        <TextInput
          value={currency}
          onChangeText={setCurrency}
          editable={!locked}
          autoCapitalize="characters"
          maxLength={3}
          accessibilityLabel="Group currency"
          style={{ ...inputStyle(theme), opacity: locked ? 0.5 : 1 }}
        />
        {locked ? (
          <Text variant="caption" color="secondary">
            Currency is locked because this group already has expenses or settlements.
          </Text>
        ) : null}

        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          disabled={saving || name.trim().length === 0}
          accessibilityLabel="Save group changes"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Cancel group editing"
        />
      </Stack>
    </Screen>
  );
}

function inputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  } as const;
}
