/**
 * /settlements/[settlementId] — Settlement detail.
 *
 * Reads the `settlementId` route param and delegates to
 * {@link SettlementDetailScreen}.
 *
 * Deep link: billlens://settlements/<id>
 */

import { useLocalSearchParams } from 'expo-router';

import { SettlementDetailScreen } from '@presentation/screens/settlement/SettlementDetailScreen';

export default function SettlementDetailRoute(): JSX.Element {
  const params = useLocalSearchParams<{ settlementId?: string }>();
  return <SettlementDetailScreen settlementId={params.settlementId ?? ''} />;
}
