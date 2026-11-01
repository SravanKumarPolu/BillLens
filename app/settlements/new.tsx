/**
 * /settlements/new — New settlement.
 *
 * Reads the optional `groupId` query param (so the settlement can be
 * scoped to a group) and delegates to {@link NewSettlementScreen}.
 */

import { useLocalSearchParams } from 'expo-router';

import { NewSettlementScreen } from '@presentation/screens/settlement/NewSettlementScreen';

export default function NewSettlementRoute(): JSX.Element {
  const params = useLocalSearchParams<{ groupId?: string }>();
  return <NewSettlementScreen groupId={params.groupId} />;
}
