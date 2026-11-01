/**
 * /expenses/[expenseId] — Expense detail.
 *
 * Reads the `expenseId` route param and delegates to
 * {@link ExpenseDetailScreen}.
 *
 * Deep link: billlens://expenses/<id>
 */

import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailScreen } from '@presentation/screens/expense/ExpenseDetailScreen';

export default function ExpenseDetailRoute(): JSX.Element {
  const params = useLocalSearchParams<{ expenseId?: string }>();
  const expenseId = params.expenseId ?? '';
  return <ExpenseDetailScreen expenseId={expenseId} />;
}
