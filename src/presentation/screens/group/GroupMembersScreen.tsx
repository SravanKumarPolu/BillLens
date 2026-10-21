/**
 * Group members — add, rename and deactivate.
 *
 * Removal never deletes historical allocations: members are deactivated via
 * `leftAt`, so old splits/settlements keep valid references.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, TextInput } from 'react-native';

import type { GroupMember } from '@domain/entities/group-member';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { tryGetAppServices } from '@store/services-registry';

export default function GroupMembersScreen(): ReactNode {
  const theme = useTheme();
  const { groupId = '' } = useLocalSearchParams<{ groupId?: string }>();
  const [members, setMembers] = useState<readonly GroupMember[]>([]);
  const [groupName, setGroupName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    try {
      const result = await services.groups.listGroupMembers.execute(groupId);
      setGroupName(result.groupName);
      const group = await services.groups.get.execute(groupId);
      setCurrency(group.currencyCode as string);
      const nextBalances: Record<string, number> = {};
      for (const member of result.members) {
        const balance = await services.balances.getMemberBalance.execute({
          groupId: groupId as never,
          memberId: member.id as never,
        });
        nextBalances[member.id] = balance.balances[0]?.netBalanceMinor ?? 0;
      }
      setBalances(nextBalances);
      setMembers(
        result.members.map(
          (member) =>
            ({
              id: member.id,
              groupId,
              displayName: member.displayName,
              role: member.role,
              joinedAt: '',
              updatedAt: '',
              version: 1,
              userId: undefined,
            }) as unknown as GroupMember,
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load members.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = (): void => {
    const services = tryGetAppServices();
    if (services === null || newName.trim().length === 0) return;
    setBusy(true);
    void services.groups.addMember
      .execute({ groupId, displayName: newName.trim(), actorUserId: 'local-user' })
      .then(
        () => {
          setNewName('');
          setBusy(false);
          void load();
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not add the member.');
          setBusy(false);
        },
      );
  };

  const saveRename = (): void => {
    const services = tryGetAppServices();
    if (services === null || editing === null) return;
    setBusy(true);
    void services.groups.renameMember
      .execute({ memberId: editing.id, displayName: editing.name })
      .then(
        () => {
          setEditing(null);
          setBusy(false);
          void load();
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not rename the member.');
          setBusy(false);
        },
      );
  };

  const remove = (member: GroupMember): void => {
    Alert.alert(
      `Deactivate ${member.displayName}?`,
      'Their historical expenses and balances stay intact. They will no longer be selectable for new expenses.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: (): void => {
            const services = tryGetAppServices();
            if (services === null) return;
            void services.groups.removeMember.execute({ memberId: member.id as string }).then(
              () => void load(),
              (err: unknown) =>
                setError(err instanceof Error ? err.message : 'Could not remove the member.'),
            );
          },
        },
      ],
    );
  };

  return (
    <Screen safeArea scrollable>
      <Stack gap="md" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" accessibilityRole="header">
          {groupName || 'Members'}
        </Text>
        <Text variant="caption" color="secondary">
          Deactivation preserves financial history. Renaming does not change any split.
        </Text>

        {loading ? <ActivityIndicator accessibilityLabel="Loading members" /> : null}
        {error !== null ? (
          <Text variant="caption" color="negative" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {members.map((member) => (
          <Card key={member.id}>
            <Stack gap="sm">
              <Row gap="sm" align="center">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{member.displayName}</Text>
                  <Text variant="caption" color="muted">
                    {member.role} · {((balances[member.id as string] ?? 0) / 100).toFixed(2)}{' '}
                    {currency}
                  </Text>
                </Stack>
                <Button
                  label="Rename"
                  variant="ghost"
                  size="sm"
                  onPress={() => setEditing({ id: member.id as string, name: member.displayName })}
                  accessibilityLabel={`Rename ${member.displayName}`}
                />
                {member.role !== 'owner' ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    onPress={() => remove(member)}
                    accessibilityLabel={`Deactivate ${member.displayName}`}
                  />
                ) : null}
              </Row>
              {editing?.id === member.id ? (
                <Row gap="sm">
                  <TextInput
                    value={editing.name}
                    onChangeText={(name) => setEditing({ id: editing.id, name })}
                    accessibilityLabel="New member name"
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.borderRadius.md,
                      paddingHorizontal: spacing.md,
                      minHeight: 42,
                      color: theme.colors.textPrimary,
                      backgroundColor: theme.colors.surface,
                    }}
                  />
                  <Button
                    label="Save"
                    size="sm"
                    onPress={saveRename}
                    disabled={busy || editing.name.trim().length === 0}
                    accessibilityLabel="Save member name"
                  />
                </Row>
              ) : null}
            </Stack>
          </Card>
        ))}

        <Card>
          <Stack gap="sm">
            <Text variant="cardTitle">Add member</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Name"
              accessibilityLabel="New member name"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.borderRadius.md,
                paddingHorizontal: spacing.md,
                minHeight: 46,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surface,
              }}
            />
            <Button
              label={busy ? 'Adding…' : 'Add member'}
              onPress={add}
              disabled={busy || newName.trim().length === 0}
              accessibilityLabel="Add group member"
            />
          </Stack>
        </Card>

        <Button
          label="Back to group"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Back to group"
        />
      </Stack>
    </Screen>
  );
}
