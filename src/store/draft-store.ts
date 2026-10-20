/**
 * Draft store.
 *
 * Holds the currently-open `ExpenseDraft` for review on the
 * `/drafts/[draftId]` screen. Persisted to AsyncStorage so that the
 * user's in-progress edits survive an app kill / relaunch — losing a
 * half-edited receipt draft is a worst-case UX for BillLens.
 *
 * The store is a UI-state cache only — the durable record lives in
 * SQLite (see `src/infrastructure/sqlite/schema.ts`). On launch, the
 * application layer reconciles the persisted draft here with the
 * SQLite copy via the draft repository (Phase 2 stub today).
 *
 * `hasUnsavedChanges` mirrors the navigation-store flag of the same
 * name so the draft route can warn before navigating away. Keeping a
 * second copy here avoids a circular import (navigation-store would
 * otherwise need to depend on the draft-store to set the flag).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ExpenseDraft } from '@domain/entities/expense-draft';

const DRAFT_STORAGE_KEY = 'billlens.draft-state';

export interface DraftStore {
  /** The draft the user is currently reviewing, or null when none is open. */
  readonly currentDraft: ExpenseDraft | null;
  /** Replace the current draft. Pass null to clear it. */
  setCurrentDraft: (draft: ExpenseDraft | null) => void;
  /**
   * Patch a single top-level field on the current draft.
   *
   * The patch is shallow — only the named field is overwritten. When
   * `currentDraft` is null, this is a no-op. The patch also marks the
   * store as having unsaved changes so the route guard warns before
   * navigating away.
   *
   * Note: for nested fields (line items, charges, issues), the caller
   * must construct the new array and pass it as the value for the
   * top-level field name.
   */
  updateField: (field: string, value: unknown) => void;
  /** True while the user has edits that have not been flushed to SQLite. */
  readonly hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  /** Reset the store to its initial state — used by re-onboarding / qa. */
  reset: () => void;
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set) => ({
      currentDraft: null,
      setCurrentDraft: (draft) =>
        set({ currentDraft: draft, hasUnsavedChanges: false }),

      updateField: (field, value) =>
        set((state) => {
          if (state.currentDraft === null) return {};
          // Shallow-merge the patched field onto the current draft. The
          // domain `ExpenseDraft` is readonly; we treat the store copy
          // as a UI-state projection and rebuild it on every edit so
          // downstream selectors see a new reference.
          const next: ExpenseDraft = {
            ...state.currentDraft,
            [field]: value,
          } as ExpenseDraft;
          return { currentDraft: next, hasUnsavedChanges: true };
        }),

      hasUnsavedChanges: false,
      setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),

      reset: () => set({ currentDraft: null, hasUnsavedChanges: false }),
    }),
    {
      name: DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
