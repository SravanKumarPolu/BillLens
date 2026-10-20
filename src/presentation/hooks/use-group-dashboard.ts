/**
 * Group-dashboard data hook — loads the real content for the polished
 * group home screen.
 *
 * Reads through the services registry (use cases only — the presentation
 * → infrastructure boundary stays closed):
 *   - members          → `ListGroupMembersUseCase`
 *   - recent expenses  → `ListRecentExpensesForGroupUseCase`
 *   - transfers        → `GenerateSettlementSuggestionsUseCase` (the
 *                        multi-currency balance engine's greedy
 *                        simplification — never cross-currency)
 *
 * The user-scoped balance stays sourced from the group store (honest
 * zero until the identity adapters land — no fake "you owe" numbers).
 *
 * Reloads when the services graph becomes ready AFTER mount (the gate
 * initializes asynchronously) and whenever the screen regains focus —
 * returning from `/expenses/new` must show the just-saved expense.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ExpenseSummaryViewModel,
  MemberSummaryViewModel,
  SuggestedTransferViewModel,
} from '@presentation/view-models/groups';
import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

/** How many recent-expense cards the group home renders. */
export const RECENT_EXPENSE_LIMIT = 5;

export interface GroupDashboardData {
  readonly loading: boolean;
  readonly error: string | null;
  /** Group name from the repository (null until loaded). */
  readonly groupName: string | null;
  /** Group default currency from the repository (null until loaded). */
  readonly groupCurrencyCode: string | null;
  readonly members: readonly MemberSummaryViewModel[];
  readonly recentExpenses: readonly ExpenseSummaryViewModel[];
  readonly suggestedTransfers: readonly SuggestedTransferViewModel[];
  /** True when a load completed at least once (even if it failed). */
  readonly loadedOnce: boolean;
}

/** Format an ISO date-time as a compact "Mar 14" label. */
export function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = months[date.getUTCMonth()] ?? '';
  const day = date.getUTCDate();
  return `${month} ${day}`;
}

export function useGroupDashboardData(groupId: string): GroupDashboardData {
  const servicesReady = useAppServicesReady();
  const [members, setMembers] = useState<readonly MemberSummaryViewModel[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<readonly ExpenseSummaryViewModel[]>([]);
  const [suggestedTransfers, setSuggestedTransfers] = useState<
    readonly SuggestedTransferViewModel[]
  >([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupCurrencyCode, setGroupCurrencyCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  /** Monotonic load epoch — see the stale-response guard in `load`. */
  const epochRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) {
      // Gate still initializing — keep loading; the readiness
      // subscription re-triggers this effect once ready.
      return;
    }

    // Stale-response guard (Phase 4): when the groupId changes
    // mid-flight (navigating between groups), the older load must NOT
    // clobber the newer group's data. Each load owns an epoch and may
    // only commit while it is still the latest.
    const epoch = ++epochRef.current;
    const isStale = (): boolean => epochRef.current !== epoch;

    setLoading(true);
    try {
      // Members first — the transfers projection needs the id→name map.
      const groupInfo = await services.groups.listGroupMembers.execute(groupId);
      if (isStale()) return;
      const nameById = new Map(groupInfo.members.map((m) => [m.id, m.displayName]));
      setGroupName(groupInfo.groupName);
      setGroupCurrencyCode(groupInfo.currencyCode);

      const recent = await services.expenses.listRecentExpenses.execute({
        groupId,
        limit: RECENT_EXPENSE_LIMIT,
      });
      if (isStale()) return;

      const suggestions = await services.explanations.generateSettlementSuggestions.execute({
        groupId: groupId as never,
      });
      if (isStale()) return;

      setMembers(
        groupInfo.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          role: m.role,
          balanceMinor: 0,
          // Pre-identity: no member is linked to "the current user" on
          // this device yet — the flag stays false (honest default).
          isCurrentUser: false,
        })),
      );
      setRecentExpenses(
        recent.entries.map((e) => ({
          id: e.expenseId,
          description: e.title,
          amountMinor: e.amountMinor,
          currencyCode: e.currencyCode,
          dateLabel: formatDateLabel(e.expenseDate),
          payerName: e.payerName,
        })),
      );
      const transfers: SuggestedTransferViewModel[] = [];
      for (const currency of suggestions.suggestions) {
        for (const transfer of currency.transfers) {
          transfers.push({
            id: `${transfer.fromMemberId}-${transfer.toMemberId}-${currency.currencyCode}`,
            fromMemberId: transfer.fromMemberId as string,
            fromMemberName: nameById.get(transfer.fromMemberId as string) ?? 'Unknown member',
            toMemberId: transfer.toMemberId as string,
            toMemberName: nameById.get(transfer.toMemberId as string) ?? 'Unknown member',
            amountMinor: transfer.amountMinor,
            currencyCode: currency.currencyCode,
          });
        }
      }
      setSuggestedTransfers(transfers);
      setError(null);
    } catch (err) {
      if (isStale()) return; // superseded — the newer load owns state
      setError(err instanceof Error ? err.message : 'Could not load this group.');
    } finally {
      if (!isStale()) {
        setLoading(false);
        setLoadedOnce(true);
      }
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  // Re-load whenever the screen gains focus (e.g. returning from the
  // manual expense form or the settlement flow).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return {
    loading: loading && !loadedOnce,
    error,
    groupName,
    groupCurrencyCode,
    members,
    recentExpenses,
    suggestedTransfers,
    loadedOnce,
  };
}
