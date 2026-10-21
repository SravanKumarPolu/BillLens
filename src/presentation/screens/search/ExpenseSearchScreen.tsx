/**
 * Expense search — cross-group, offline, SQLite-backed.
 *
 * Filters: free text (title/note), group, and a date window. Results are
 * paginated by the use case (20 per page); the first page is enough for the
 * screen and "Load more" appends. No full-history load into JS.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import type { Expense } from '@domain/entities/expense';
import { AmountText } from '@presentation/design-system/components/AmountText';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { todayDateOnly } from '@presentation/view-models/expense-form';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices } from '@store/services-registry';

type DatePreset = 'any' | '30d' | 'month';

interface Hit {
  readonly expense: Expense;
  readonly groupName: string;
}

const DATE_PRESETS: readonly { value: DatePreset; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
];

function dateWindow(preset: DatePreset): { fromDate?: string; toDate?: string } {
  if (preset === 'any') return {};
  const today = new Date();
  if (preset === '30d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return { fromDate: todayDateOnly(from), toDate: todayDateOnly(today) };
  }
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { fromDate: todayDateOnly(first), toDate: todayDateOnly(today) };
}

export default function ExpenseSearchScreen(): ReactNode {
  const theme = useTheme();
  const groups = useGroupStore((state) => state.groups);
  const [text, setText] = useState('');
  const [groupId, setGroupId] = useState<string>('all');
  const [preset, setPreset] = useState<DatePreset>('any');
  const [hits, setHits] = useState<readonly Hit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const runSearch = useCallback(
    async (offset: number): Promise<void> => {
      const services = tryGetAppServices();
      if (services === null) {
        setError('Local data is still starting. Try again in a moment.');
        return;
      }
      const ids = groups
        .filter((group) => groupId === 'all' || group.id === groupId)
        .map((group) => group.id as never);
      if (ids.length === 0) {
        setHits([]);
        setHasMore(false);
        setLoading(false);
        return;
      }

      const current = ++requestId.current;
      const isPage = offset > 0;
      if (isPage) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await services.expenses.searchExpenses.execute({
          groupIds: ids,
          ...(text.trim().length > 0 ? { text: text.trim() } : {}),
          ...dateWindow(preset),
          limit: 20,
          offset,
        });
        if (current !== requestId.current) return;
        setHits((previous) => (isPage ? [...previous, ...result.hits] : result.hits));
        setHasMore(result.hasMore);
      } catch (err) {
        if (current !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        if (current === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [groups, groupId, preset, text],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch]);

  const renderItem = useCallback(
    ({ item }: { item: Hit }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.expense.title}, ${item.groupName}`}
        onPress={() => router.push(`/expenses/${item.expense.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card>
          <Row gap="md" align="center">
            <Stack gap={2} style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {item.expense.title}
              </Text>
              <Text variant="caption" color="muted" numberOfLines={1}>
                {item.groupName} · {item.expense.expenseDate.slice(0, 10)}
              </Text>
            </Stack>
            <AmountText
              amountMinor={item.expense.amountMinor}
              currencyCode={item.expense.currencyCode}
              variant="amountSmall"
            />
          </Row>
        </Card>
      </Pressable>
    ),
    [],
  );

  return (
    <Screen safeArea>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <Row
          gap="sm"
          align="center"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: spacing.md,
            minHeight: 48,
          }}
        >
          <Icon name="search-outline" size={theme.iconSizes.md} color={theme.colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Search expenses"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Search expenses"
            accessibilityRole="search"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: theme.colors.textPrimary, minHeight: 46 }}
          />
          {text.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setText('')}
              hitSlop={8}
            >
              <Icon name="close-circle" size={theme.iconSizes.md} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </Row>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}
        >
          <FilterChip
            label="All groups"
            selected={groupId === 'all'}
            onPress={() => setGroupId('all')}
          />
          {groups.map((group) => (
            <FilterChip
              key={group.id}
              label={group.name}
              selected={groupId === group.id}
              onPress={() => setGroupId(group.id)}
            />
          ))}
        </ScrollView>

        <Row gap="sm" style={{ paddingBottom: spacing.md }}>
          {DATE_PRESETS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={preset === option.value}
              onPress={() => setPreset(option.value)}
            />
          ))}
        </Row>

        {error !== null ? (
          <Text variant="caption" color="negative" style={{ paddingBottom: spacing.sm }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator accessibilityLabel="Searching expenses" />
        ) : (
          <FlatList
            data={hits}
            keyExtractor={(item) => item.expense.id}
            renderItem={renderItem}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasMore && !loadingMore) void runSearch(hits.length);
            }}
            ListEmptyComponent={
              <Stack gap="sm" align="center" style={{ paddingTop: spacing.xl }}>
                <Text variant="body" color="muted">
                  No expenses match these filters.
                </Text>
              </Stack>
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.md }} /> : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}): JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: theme.borderRadius.full,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surface,
        minHeight: 36,
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" color={selected ? 'onColor' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}
