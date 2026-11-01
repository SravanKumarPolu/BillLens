/**
 * /expenses/new — New expense (manual).
 *
 * Reads the optional `groupId` route param (the Group home screen's
 * "Add Expense" action appends it) and delegates to
 * {@link NewExpenseScreen}.
 *
 * Deep link: billlens://expenses/new?groupId=<uuid>
 *
 * Without a groupId the user lands on the groups list — the manual form
 * needs a group context (its members + default currency).
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

import { requireGroupExists } from '@presentation/navigation/route-guards';
import { NewExpenseScreen } from '@presentation/screens/expense/NewExpenseScreen';

export default function NewExpenseRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId || !requireGroupExists(groupId)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return <NewExpenseScreen groupId={groupId} />;
}
