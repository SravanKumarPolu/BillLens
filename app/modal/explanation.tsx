/**
 * /modal/explanation — Balance explanation modal.
 *
 * Reads the optional `memberId`, `memberName`, and `currencyCode` query
 * params and delegates to {@link BalanceExplanationScreen}.
 *
 * Phase 2: the route is reached with no parameters when opened from
 * development / placeholder entry points — the screen renders an
 * empty-state (settled) view in that case.
 *
 * Deep link: billlens://modal/explanation?memberId=<id>
 */

import { useLocalSearchParams } from 'expo-router';

import { BalanceExplanationScreen } from '@presentation/screens/balances/BalanceExplanationScreen';

export default function ExplanationModalRoute(): JSX.Element {
  const params = useLocalSearchParams<{
    memberId?: string;
    memberName?: string;
    currencyCode?: string;
  }>();

  return (
    <BalanceExplanationScreen
      memberId={params.memberId ?? 'unknown'}
      memberName={params.memberName ?? 'Member'}
      currencyCode={params.currencyCode ?? 'USD'}
    />
  );
}
