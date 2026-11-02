/**
 * App-state store.
 *
 * Holds ephemeral runtime state that reflects the device / sync engine
 * status. NOT persisted — it is re-derived from the real world on every
 * app launch (NetInfo, sync queue length, draft store contents).
 *
 * Components that need to react to this state read it via the
 * `useAppState` hook. The values are written by:
 *   - `isOnline`            — a NetInfo subscription (wired up in
 *                              Prompt 14+ when the offline sync engine
 *                              lands). Until then it defaults to true.
 *   - `pendingSyncCount`    — `refreshSyncStatus()` (v2.5.0), which
 *                              reads the REAL queue counts from the
 *                              sync repository on an interval and on
 *                              connectivity changes.
 *   - `failedSyncCount`     — `refreshSyncStatus()` (v2.5.0): conflict
 *                              + permanently-failed ops. Previously
 *                              NOTHING ever wrote these fields, so
 *                              the UI showed "All synced" even when
 *                              ops awaited user review.
 *   - `remoteConflictCount` — `refreshSyncStatus()` (v2.6.0): the
 *                              unresolved DOWNLOAD conflicts (a remote
 *                              change raced a local edit). Surfaced
 *                              separately because the resolution is a
 *                              user decision, never an auto-merge.
 *   - `hasPendingDrafts`    — the draft repository observer.
 */

import { create } from 'zustand';

export interface AppStateStore {
  /** Whether the device currently has network connectivity. */
  readonly isOnline: boolean;
  setIsOnline: (value: boolean) => void;

  /** Number of mutations queued for sync. 0 when fully synced. */
  readonly pendingSyncCount: number;
  setPendingSyncCount: (value: number) => void;

  /** True if any queued mutation needs user attention (conflict / permanently failed). */
  readonly hasFailedSync: boolean;
  setHasFailedSync: (value: boolean) => void;

  /**
   * Number of operations awaiting USER REVIEW (conflict or
   * permanently failed) — v2.5.0. Distinct from `pendingSyncCount`:
   * conflating the two made unsynced/conflicted data render as
   * "all synced".
   */
  readonly failedSyncCount: number;
  setFailedSyncCount: (value: number) => void;

  /**
   * Unresolved DOWNLOAD-side conflicts (v2.6.0) — a remote change
   * arrived while a local edit was pending. Requires user review; the
   * record holds both versions for the diff UI.
   */
  readonly remoteConflictCount: number;
  setRemoteConflictCount: (value: number) => void;

  /** True if there are any expense drafts awaiting review. */
  readonly hasPendingDrafts: boolean;
  setHasPendingDrafts: (value: boolean) => void;

  /**
   * Number of persisted expense drafts awaiting review (needs_review or
   * ready status) — v2.5.0. Sourced from the REAL draft repository by
   * `refreshSyncStatus()`; previously nothing wrote it, so the home
   * dashboard's draft card piggybacked on the sync-queue count and
   * showed the wrong number.
   */
  readonly pendingDraftCount: number;
  setPendingDraftCount: (value: number) => void;

  /**
   * Re-read the sync queue counters from the (initialized) services
   * graph. No-op when services are not ready or the sync repository
   * is unavailable. Safe to call from a poll interval.
   */
  refreshSyncStatus: () => Promise<void>;
}

export const useAppState = create<AppStateStore>()((set) => ({
  isOnline: true,
  setIsOnline: (value) => set({ isOnline: value }),

  pendingSyncCount: 0,
  setPendingSyncCount: (value) => set({ pendingSyncCount: Math.max(0, value) }),

  hasFailedSync: false,
  setHasFailedSync: (value) => set({ hasFailedSync: value }),

  failedSyncCount: 0,
  setFailedSyncCount: (value) =>
    set({
      failedSyncCount: Math.max(0, value),
      hasFailedSync: Math.max(0, value) > 0,
    }),

  remoteConflictCount: 0,
  setRemoteConflictCount: (value) =>
    set({ remoteConflictCount: Math.max(0, value) }),

  hasPendingDrafts: false,
  setHasPendingDrafts: (value) => set({ hasPendingDrafts: value }),

  pendingDraftCount: 0,
  setPendingDraftCount: (value) =>
    set({
      pendingDraftCount: Math.max(0, value),
      hasPendingDrafts: Math.max(0, value) > 0,
    }),

  refreshSyncStatus: async () => {
    // Imported lazily to avoid a store-layer import cycle at module
    // load (services-registry → auth-store → …).
    const { tryGetAppServices } = await import('@store/services-registry');
    const services = tryGetAppServices();
    if (services === null) return;
    const updates: Partial<{
      pendingSyncCount: number;
      failedSyncCount: number;
      remoteConflictCount: number;
      pendingDraftCount: number;
    }> = {};
    try {
      const repository = services.sync?.repository;
      if (repository !== undefined && repository !== null) {
        const [pending, conflicts] = await Promise.all([
          repository.countPending(),
          repository.countConflicts(),
        ]);
        updates.pendingSyncCount = Math.max(0, pending);
        updates.failedSyncCount = Math.max(0, conflicts);
      }
      // v2.6.0: unresolved DOWNLOAD conflicts — the honest "needs your
      // decision" number for the sync status UI.
      const conflictRepo = services.sync?.conflicts;
      if (conflictRepo !== undefined && conflictRepo !== null) {
        const unresolved = await conflictRepo.listUnresolved(200);
        updates.remoteConflictCount = unresolved.length;
        // Any download conflict also means the sync is NOT clean —
        // surface it through the same hasFailedSync flag the UI uses.
        if (unresolved.length > 0) {
          updates.failedSyncCount = Math.max(
            updates.failedSyncCount ?? 0,
            (updates.failedSyncCount ?? 0) + unresolved.length,
          );
        }
      }
    } catch {
      // The queue read must never crash the poll.
    }
    try {
      const drafts = services.repositories?.drafts;
      if (drafts !== undefined && drafts !== null) {
        const [needsReview, ready] = await Promise.all([
          drafts.listByStatus('needs_review', { limit: 200 }),
          drafts.listByStatus('ready', { limit: 200 }),
        ]);
        updates.pendingDraftCount = needsReview.items.length + ready.items.length;
      }
    } catch {
      // Same for the draft count.
    }
    if (Object.keys(updates).length > 0) set(updates);
  },
}));
