/**
 * /settlements/preview — Settlement preview.
 *
 * Reads the `fromMemberId`, `toMemberId`, `amountMinor`,
 * `currencyCode`, and `groupId` query params and delegates to
 * {@link SettlementPreviewScreen}.
 *
 * Deep link: billlens://settlements/preview?fromMemberId=<id>&toMemberId=<id>&amountMinor=<n>&currencyCode=<code>&groupId=<id>
 *
 * The `groupId` param is required for the screen to load the group's
 * members + balances via the services registry (so the screen can
 * resolve real member names and project the before/after balances).
 */

import { useLocalSearchParams } from 'expo-router';

import { SettlementPreviewScreen } from '@presentation/screens/settlements/SettlementPreviewScreen';

export default function SettlementPreviewRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    fromMemberId?: string;
    toMemberId?: string;
    amountMinor?: string;
    currencyCode?: string;
    groupId?: string;
  }>();

  const amountMinor = Number.parseInt(params.amountMinor ?? '0', 10);
  const safeAmount = Number.isFinite(amountMinor) ? Math.max(0, amountMinor) : 0;

  return (
    <SettlementPreviewScreen
      fromMemberId={params.fromMemberId ?? 'unknown'}
      toMemberId={params.toMemberId ?? 'unknown'}
      amountMinor={safeAmount}
      currencyCode={params.currencyCode ?? 'USD'}
      groupId={params.groupId}
    />
  );
}
