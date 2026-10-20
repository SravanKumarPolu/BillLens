/**
 * use-home-dashboard-data — loads the dashboard's REAL financial data
 * across all groups via the services registry.
 *
 * Reliability contract (Phase 4):
 *
 *   - ZERO vs UNAVAILABLE: empty counts + empty `userBalances` mean
 *     "zero" ONLY while `degradedGroupIds` is empty and `error` is
 *     null. When a per-group query fails the group id lands in
 *     `degradedGroupIds` (and, for balance queries, in
 *     `balancesUnavailableGroupIds`) — the UI must then render
 *     "some data could not be loaded" instead of an authoritative
 *     "all settled up".
 *   - PARTIAL FAILURE IS NOT SILENT: every per-group `catch` records
 *     which group failed; healthy groups still contribute their data.
 *   - STALE-RESPONSE GUARD: each load captures an epoch; results from
 *     a superseded load (group list changed mid-flight, or a retry
 *     started) are discarded instead of clobbering fresh state.
 *   - RETRY: `retry()` re-runs the load; safe to call at any time.
 *   - REFRESH ON CHANGE: re-runs when services become ready, when the
 *     screen regains focus (returning after recording an expense /
 *     settlement), and when the persisted group list changes.
 *
 * Surfaced dimensions:
 *
 *   - `pendingConfirmationCount` — settlements in `pending_confirmation`
 *     across all groups.
 *   - `groupsWithOutstandingBalancesCount` / `suggestedTransferCount` —
 *     groups with ≥1 suggested transfer, and the transfer total.
 *   - `firstGroupWithPendingConfirmations` — deep-link target for the
 *     pending-action card.
 *   - `userBalances` — the current user's net balance per currency,
 *     summed across groups (empty pre-identity when no member has
 *     `userId === 'local-user'`).
 *
 * Architecture:
 *   - Reads ONLY from the services registry + the persisted group
 *     store. No `@infrastructure/*` imports.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CurrencyBalanceEntry } from '@presentation/view-models/home-dashboard';
import { useGroupStore } from '@store/group-store';
import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

/** A group that has at least one pending-confirmation settlement. */
export interface PendingConfirmationGroupEntry {
  readonly groupId: string;
  readonly groupName: string;
  readonly count: number;
}

/** A group that has at least one suggested settlement. */
export interface OutstandingBalancesGroupEntry {
  readonly groupId: string;
  readonly groupName: string;
  readonly suggestedTransferCount: number;
  /** Total volume across the group's suggested transfers, per currency. */
  readonly currencyTotals: readonly CurrencyBalanceEntry[];
}

export interface HomeDashboardData {
  readonly loading: boolean;
  readonly loadedOnce: boolean;
  readonly error: string | null;

  /** Total settlements in `pending_confirmation` across all groups. */
  readonly pendingConfirmationCount: number;
  /** One entry per group that has ≥1 pending confirmation. */
  readonly pendingConfirmationGroups: readonly PendingConfirmationGroupEntry[];

  /** Total suggested settlements across all groups. */
  readonly suggestedTransferCount: number;
  /** One entry per group that has ≥1 suggested settlement. */
  readonly outstandingBalancesGroups: readonly OutstandingBalancesGroupEntry[];

  /** The first group (by recency) that has pending confirmations — for the deep-link CTA. */
  readonly firstPendingGroup: PendingConfirmationGroupEntry | null;

  /**
   * The current user's net balance per currency, summed across all
   * groups. Positive = the user is owed; negative = the user owes.
   * Empty when no group has a member whose `userId === 'local-user'`
   * (the synthetic pre-identity id set by CreateGroupUseCase on the
   * owner member).
   *
   * ⚠️ NOT authoritative while `balancesUnavailableGroupIds` is
   * non-empty or `error` is set — treat as partial data.
   */
  readonly userBalances: readonly CurrencyBalanceEntry[];

  /**
   * Groups where at least one dashboard query threw (Phase 4: the old
   * hook swallowed these silently, making "unavailable" look like
   * "zero"). Empty ⇒ the loaded numbers are authoritative.
   */
  readonly degradedGroupIds: readonly string[];

  /**
   * Groups where the BALANCE query specifically failed — `userBalances`
   * must not be presented as an authoritative "all settled up" while
   * this is non-empty.
   */
  readonly balancesUnavailableGroupIds: readonly string[];
}

const INITIAL: HomeDashboardData = {
  loading: true,
  loadedOnce: false,
  error: null,
  pendingConfirmationCount: 0,
  pendingConfirmationGroups: [],
  suggestedTransferCount: 0,
  outstandingBalancesGroups: [],
  firstPendingGroup: null,
  userBalances: [],
  degradedGroupIds: [],
  balancesUnavailableGroupIds: [],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Page size used when listing pending confirmations per group. */
const PENDING_PAGE_SIZE = 50;

/**
 * Load the dashboard's real financial data across all persisted groups.
 *
 * Re-runs when:
 *   - the services registry becomes ready (initial mount before the
 *     gate has finished initializing);
 *   - the screen regains focus (returning from a sibling must refresh
 *     the counts);
 *   - the persisted group list changes (creating / leaving a group
 *     must re-aggregate the dashboard);
 *   - `retry()` is called (manual retry from the degraded/error UI).
 *
 * Per-user balances:
 *   For each group, calls `services.balances.getGroupBalances` (the
 *   multi-currency balance engine) and finds "my member" as the
 *   member whose `userId === 'local-user'` (the synthetic pre-identity
 *   id set by `CreateGroupUseCase` when the user created the group).
 *   Sums that member's `netBalanceMinor` per currency across all
 *   groups → the dashboard's real "You are owed / You owe" cards.
 */
export function useHomeDashboardData(): HomeDashboardData & { readonly retry: () => void } {
  const servicesReady = useAppServicesReady();
  const groups = useGroupStore((s) => s.groups);
  const [state, setState] = useState<HomeDashboardData>(INITIAL);

  // ── Stale-response guard ──────────────────────────────────────────
  // Monotonic epoch: every load captures the current value and may
  // only commit state while it still owns the latest epoch. A load
  // superseded by a newer one (group list changed mid-flight, or a
  // retry fired) discards its results instead of clobbering.
  const epochRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) {
      // Gate still initializing — keep loading; the readiness
      // subscription re-triggers this effect once ready.
      return;
    }

    const epoch = ++epochRef.current;
    const isStale = (): boolean => epochRef.current !== epoch;
    // All commits go through functional setState with an in-updater
    // staleness check: returning `prev` unchanged makes React bail out
    // (no re-render) when a superseded load tries to commit.
    const commit = (next: HomeDashboardData): void => {
      setState((prev) => (isStale() ? prev : next));
    };

    // Stale-while-revalidate: keep the PREVIOUS data visible during a
    // refresh (functional updater — no stale closure over `state`).
    setState((prev) =>
      isStale() ? prev : { ...prev, loading: true, error: null },
    );

    try {
      const activeGroups = groups.filter((g) => !g.archived);

      const pendingConfirmationGroups: PendingConfirmationGroupEntry[] = [];
      const outstandingBalancesGroups: OutstandingBalancesGroupEntry[] = [];
      const userBalancesPerCurrency = new Map<string, number>();
      const degradedGroupIds = new Set<string>();
      const balancesUnavailable = new Set<string>();
      let pendingConfirmationCount = 0;
      let suggestedTransferCount = 0;

      for (const group of activeGroups) {
        // Pending-confirmation settlements for this group.
        try {
          const pending = await services.settlements.listPendingConfirmations.execute({
            groupId: group.id as never,
            pagination: { limit: PENDING_PAGE_SIZE },
          });
          if (pending.items.length > 0) {
            pendingConfirmationGroups.push({
              groupId: group.id,
              groupName: group.name,
              count: pending.items.length,
            });
            pendingConfirmationCount += pending.items.length;
          }
        } catch {
          // A single group's failure must not abort the dashboard load —
          // but it is NO LONGER SILENT (Phase 4): record the group so
          // the UI can distinguish "zero" from "unavailable".
          degradedGroupIds.add(group.id);
        }

        // Suggested settlements for this group (the multi-currency
        // balance engine's greedy simplification) — and the group's
        // total suggested volume per currency.
        try {
          const suggestions = await services.explanations.generateSettlementSuggestions.execute({
            groupId: group.id as never,
          });
          let groupSuggestedTransferCount = 0;
          const currencyTotals: CurrencyBalanceEntry[] = [];
          for (const currency of suggestions.suggestions) {
            groupSuggestedTransferCount += currency.transfers.length;
            suggestedTransferCount += currency.transfers.length;
            for (const transfer of currency.transfers) {
              const existing = currencyTotals.find(
                (c) => c.currencyCode === currency.currencyCode,
              );
              if (existing === undefined) {
                currencyTotals.push({
                  currencyCode: currency.currencyCode,
                  amountMinor: transfer.amountMinor,
                });
              } else {
                const idx = currencyTotals.indexOf(existing);
                currencyTotals[idx] = {
                  currencyCode: existing.currencyCode,
                  amountMinor: existing.amountMinor + transfer.amountMinor,
                };
              }
            }
          }
          if (groupSuggestedTransferCount > 0) {
            outstandingBalancesGroups.push({
              groupId: group.id,
              groupName: group.name,
              suggestedTransferCount: groupSuggestedTransferCount,
              currencyTotals,
            });
          }
        } catch {
          degradedGroupIds.add(group.id);
        }

        // Per-user balances: load the balance engine result + the
        // member list, find "my member" (the registered user — pre-
        // identity, only the owner member has userId set, by
        // CreateGroupUseCase), sum their netBalanceMinor per currency.
        try {
          const [balanceResult, memberList] = await Promise.all([
            services.balances.getGroupBalances.execute({
              groupId: group.id as never,
            }),
            services.groups.listGroupMembers.execute(group.id),
          ]);
          if (!balanceResult.notFound) {
            // Find "my member" — pre-identity, the only member with
            // `isRegisteredUser: true` is the owner (userId='local-user').
            const myMember = memberList.members.find((m) => m.isRegisteredUser);
            if (myMember !== undefined) {
              for (const currencyResult of balanceResult.results) {
                const myMemberBalance = currencyResult.memberCurrencyBalances.find(
                  (m) => (m.memberId as string) === myMember.id,
                );
                if (myMemberBalance !== undefined) {
                  const existing = userBalancesPerCurrency.get(currencyResult.currencyCode as string) ?? 0;
                  userBalancesPerCurrency.set(
                    currencyResult.currencyCode as string,
                    existing + (myMemberBalance.netBalanceMinor as number),
                  );
                }
              }
            }
          }
        } catch {
          degradedGroupIds.add(group.id);
          balancesUnavailable.add(group.id);
        }
      }

      // Pick the first group (by recency in the store) that has
      // pending confirmations, so the pending-action card can deep-link
      // the user straight to that group's balances screen.
      const firstPendingGroup =
        pendingConfirmationGroups.length > 0 ? pendingConfirmationGroups[0]! : null;

      // Build the per-currency user-balance entries for the dashboard.
      const userBalances: readonly CurrencyBalanceEntry[] = Array.from(
        userBalancesPerCurrency.entries(),
      ).map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor }));

      commit({
        loading: false,
        loadedOnce: true,
        error: null,
        pendingConfirmationCount,
        pendingConfirmationGroups,
        suggestedTransferCount,
        outstandingBalancesGroups,
        firstPendingGroup,
        userBalances,
        degradedGroupIds: Array.from(degradedGroupIds),
        balancesUnavailableGroupIds: Array.from(balancesUnavailable),
      });
    } catch (err) {
      // TOTAL failure (not per-group): surface the error; counts above
      // stay as loaded or zero — the UI shows the error state, never
      // "all settled up".
      commit({
        loading: false,
        loadedOnce: true,
        error: err instanceof Error ? err.message : 'Could not load your dashboard.',
        pendingConfirmationCount: 0,
        pendingConfirmationGroups: [],
        suggestedTransferCount: 0,
        outstandingBalancesGroups: [],
        firstPendingGroup: null,
        userBalances: [],
        degradedGroupIds: [],
        balancesUnavailableGroupIds: [],
      });
    }
  }, [groups]);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Manual retry — safe at any time; supersedes in-flight loads. */
  const retry = useCallback((): void => {
    void load();
  }, [load]);

  return { ...state, retry };
}
