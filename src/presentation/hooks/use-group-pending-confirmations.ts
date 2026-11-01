/**
 * use-group-pending-confirmations — loads the settlements awaiting
 * the receiver's confirmation for a single group, plus exposes
 * confirm + dispute callbacks that call the matching use cases
 * through the services registry.
 *
 * Backs the "Pending confirmations" section of the Group Balances
 * screen. Closing the receiver-side loop: when the dashboard surfaces
 * "N settlements awaiting confirmation" and deep-links the user
 * here, they see the actual settlements and can confirm or dispute
 * each one with a single tap.
 *
 * Architecture:
 *   - Reads ONLY from the services registry (`@store/services-registry`)
 *     — never imports `@infrastructure/*`.
 *   - Input/output TYPES are imported from `@application/settlements`
 *     (presentation is allowed to import application-layer types).
 *   - Re-loads on services-ready and on screen focus (a freshly
 *     recorded settlement must appear immediately).
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { Settlement, SettlementDisputeReason } from '@domain/entities/settlement';
import { reconcileOutstandingReminder } from '@presentation/notifications/outstanding-reminders';
import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

/** One pending-confirmation row in the Group Balances "Pending" section. */
export interface PendingConfirmationEntry {
  readonly settlementId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly method: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface UseGroupPendingConfirmationsResult {
  readonly loading: boolean;
  readonly loadedOnce: boolean;
  readonly error: string | null;
  readonly entries: readonly PendingConfirmationEntry[];
  /** Refresh the pending-confirmation list (call after a confirm/dispute). */
  readonly reload: () => Promise<void>;
  /** Confirm a settlement. Throws on failure; caller surfaces the error. */
  readonly confirm: (settlementId: string, expectedVersion: number, confirmedByMemberId: string) => Promise<void>;
  /** Dispute a settlement. Throws on failure; caller surfaces the error. */
  readonly dispute: (
    settlementId: string,
    expectedVersion: number,
    reason: SettlementDisputeReason,
    note?: string,
  ) => Promise<void>;
  /** True while a confirm/dispute is in flight (disables the buttons). */
  readonly acting: boolean;
  /** Error from the most recent confirm/dispute, or null. */
  readonly actionError: string | null;
}

/** Page size — the receiver inbox rarely has more than a handful. */
const PAGE_SIZE = 50;

/**
 * Load pending-confirmation settlements for a group, plus expose the
 * confirm + dispute callbacks.
 *
 * @param groupId — the group to load. When empty, returns the initial
 *   empty state without throwing.
 * @param nameById — member-id → display-name map (typically supplied
 *   by `useGroupMembers` so this hook does not duplicate the member
 *   fetch). When omitted, names fall back to "Unknown member".
 */
export function useGroupPendingConfirmations(
  groupId: string | undefined | null,
  nameById?: ReadonlyMap<string, string>,
): UseGroupPendingConfirmationsResult {
  const servicesReady = useAppServicesReady();
  const [state, setState] = useState<Omit<UseGroupPendingConfirmationsResult, 'reload' | 'confirm' | 'dispute'>>({
    loading: true,
    loadedOnce: false,
    error: null,
    entries: [],
    acting: false,
    actionError: null,
  });

  const load = useCallback(async (): Promise<void> => {
    if (groupId === undefined || groupId === null || groupId.length === 0) {
      setState((prev) => ({ ...prev, loading: false, loadedOnce: true, entries: [], error: null }));
      return;
    }
    const services = tryGetAppServices();
    if (services === null) {
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await services.settlements.listPendingConfirmations.execute({
        groupId: groupId as never,
        pagination: { limit: PAGE_SIZE },
      });
      const entries: PendingConfirmationEntry[] = result.items.map((s: Settlement) => ({
        settlementId: s.id as string,
        fromMemberId: s.fromMemberId as string,
        toMemberId: s.toMemberId as string,
        fromMemberName: nameById?.get(s.fromMemberId as string) ?? 'Unknown member',
        toMemberName: nameById?.get(s.toMemberId as string) ?? 'Unknown member',
        amountMinor: s.amountMinor,
        currencyCode: s.currencyCode as string,
        method: s.method.toUpperCase(),
        note: s.note ?? null,
        createdAt: s.createdAt as string,
      }));
      setState((prev) => ({
        ...prev,
        loading: false,
        loadedOnce: true,
        entries,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        loadedOnce: true,
        entries: [],
        error: err instanceof Error ? err.message : 'Could not load pending settlements.',
      }));
    }
  }, [groupId, nameById]);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirm = useCallback(
    async (settlementId: string, expectedVersion: number, confirmedByMemberId: string): Promise<void> => {
      const services = tryGetAppServices();
      if (services === null) {
        throw new Error('Storage is not ready yet. Try again in a moment.');
      }
      setState((prev) => ({ ...prev, acting: true, actionError: null }));
      try {
        await services.settlements.confirmSettlement.execute({
          settlementId: settlementId as never,
          expectedVersion,
          confirmedByMemberId: confirmedByMemberId as never,
        });
        // A completed settlement changes the balances: refresh the local
        // reminder now so a settled book cancels today rather than at the
        // next app launch.
        void reconcileOutstandingReminder();
        // Reload the list — the just-confirmed settlement should drop out
        // of `pending_confirmation` status and move the group's balances.
        await load();
        setState((prev) => ({ ...prev, acting: false }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not confirm the settlement.';
        setState((prev) => ({ ...prev, acting: false, actionError: message }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [load],
  );

  const dispute = useCallback(
    async (
      settlementId: string,
      expectedVersion: number,
      reason: SettlementDisputeReason,
      note?: string,
    ): Promise<void> => {
      const services = tryGetAppServices();
      if (services === null) {
        throw new Error('Storage is not ready yet. Try again in a moment.');
      }
      setState((prev) => ({ ...prev, acting: true, actionError: null }));
      try {
        await services.settlements.disputeSettlement.execute({
          settlementId: settlementId as never,
          expectedVersion,
          reason,
          ...(note !== undefined && note.trim().length > 0 ? { note: note.trim() } : {}),
        });
        void reconcileOutstandingReminder();
        await load();
        setState((prev) => ({ ...prev, acting: false }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not dispute the settlement.';
        setState((prev) => ({ ...prev, acting: false, actionError: message }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [load],
  );

  return { ...state, reload: load, confirm, dispute };
}
