/**
 * /expenses/edit/[expenseId] — edit an existing expense.
 *
 * Resolves the expense's group before rendering the shared expense form,
 * so the form can load members and prefill every allocation.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { spacing } from '@presentation/design-system/tokens';
import { NewExpenseScreen } from '@presentation/screens/expense/NewExpenseScreen';
import { PageHead } from '@presentation/web/PageHead';
import { tryGetAppServices } from '@store/services-registry';

export default function EditExpenseRoute(): ReactNode {
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const expenseId = params.expenseId ?? '';
  const [groupId, setGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) {
        if (!cancelled) setError('Storage is still starting. Try again in a moment.');
        return;
      }
      const expense = await services.repositories.expenses.findById(expenseId as never);
      if (cancelled) return;
      if (expense === null || expense.deletedAt !== undefined) {
        setError('This expense could not be found.');
        return;
      }
      setGroupId(expense.groupId as string);
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (error !== null) {
    return (
      <>
        <PageHead title="Edit expense" noindex />
        <Screen safeArea scrollable>
          <Stack gap="lg" style={{ padding: spacing.xl }}>
            <Card elevation="sm" padding="lg" accessibilityRole="alert">
              <Text variant="body" color="primary">
                {error}
              </Text>
            </Card>
            <Button label="Go back" variant="ghost" onPress={() => router.back()} />
          </Stack>
        </Screen>
      </>
    );
  }

  if (groupId === null) {
    return (
      <>
        <PageHead title="Edit expense" noindex />
        <Screen safeArea scrollable>
          <Stack gap="lg" style={{ padding: spacing.xl }}>
            <Text variant="body" color="secondary">
              Loading this expense…
            </Text>
          </Stack>
        </Screen>
      </>
    );
  }

  return (
    <>
      <PageHead title="Edit expense" noindex />
      <NewExpenseScreen groupId={groupId} expenseId={expenseId} />
    </>
  );
}
