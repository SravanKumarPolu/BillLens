/**
 * usePendingDrafts — loads every draft that still needs the user's
 * attention, through the services registry.
 *
 * Mirrors the app-state poller's definition of "pending" exactly
 * (`needs_review` + `ready`) so the inbox count always matches the
 * dashboard badge. Reads ONLY the registry — never `@infrastructure/*`.
 *
 * Re-loads on services-ready and on screen focus, so confirming a draft
 * removes it from the inbox when the user comes back.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { ExpenseDraft } from '@domain/entities/expense-draft';
import {
  createDraftsInboxViewModel,
  type DraftsInboxViewModel,
} from '@presentation/view-models/drafts-inbox';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

/** Upper bound per status — matches the app-state counter's cap. */
const PAGE_LIMIT = 200;

export interface UsePendingDraftsResult extends DraftsInboxViewModel {
  readonly loading: boolean;
  readonly loadedOnce: boolean;
  readonly error: string | null;
  readonly retry: () => void;
  /** The raw drafts, for screens that need the entity rather than a row. */
  readonly drafts: readonly ExpenseDraft[];
}

type DraftsState = Omit<UsePendingDraftsResult, 'retry'>;

const EMPTY_VIEW_MODEL = createDraftsInboxViewModel([]);

const INITIAL: DraftsState = {
  ...EMPTY_VIEW_MODEL,
  loading: true,
  loadedOnce: false,
  error: null,
  drafts: [],
};

export function usePendingDrafts(): UsePendingDraftsResult {
  const servicesReady = useAppServicesReady();
  const [state, setState] = useState<DraftsState>(INITIAL);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) {
      // Services gate still initializing — the readiness subscription
      // re-runs this effect once the registry is populated.
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [needsReview, ready] = await Promise.all([
        services.repositories.drafts.listByStatus('needs_review', { limit: PAGE_LIMIT }),
        services.repositories.drafts.listByStatus('ready', { limit: PAGE_LIMIT }),
      ]);
      const drafts = [...needsReview.items, ...ready.items];
      setState({
        ...createDraftsInboxViewModel(drafts, new Date()),
        loading: false,
        loadedOnce: true,
        error: null,
        drafts,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        loadedOnce: true,
        error: err instanceof Error ? err.message : 'Could not load your drafts.',
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const retry = useCallback((): void => {
    void load();
  }, [load]);

  return { ...state, retry };
}
