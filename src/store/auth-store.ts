/**
 * Auth state store.
 *
 * Holds the current `AuthState` (per `AuthenticationProvider`) and the
 * cloud user ID, if any. NOT persisted — auth state must be re-evaluated
 * on every app launch by calling `AuthService.restoreSession()`.
 *
 * Persisting auth state would be unsafe because:
 *   - The access token is short-lived; a persisted "authenticated" state
 *     would be stale on the next launch.
 *   - The refresh token is stored in SecureStore (encrypted); Zustand
 *     uses AsyncStorage (unencrypted) and must NOT hold tokens.
 *
 * The store exposes a plain `setAuthState` / `setUserId` API that the
 * application-layer `AuthService` consumes via the `AuthStateWriter`
 * port (defined in `auth-service.ts`). This keeps the architecture
 * boundary intact: the application layer never imports `@store/*`.
 */

import { create } from 'zustand';

import type { AuthState } from '@domain/ports/authentication-provider.port';

export interface AuthStore {
  /** Current auth state machine value. Re-derived on every launch. */
  readonly authState: AuthState;
  /** Cloud user ID when `authState` is `authenticated` or `offline_authenticated`. */
  readonly userId: string | null;
  /** Replace the auth state. Called by `AuthService`. */
  setAuthState: (state: AuthState) => void;
  /** Replace the user ID. Called by `AuthService`. */
  setUserId: (id: string | null) => void;
  /** Reset to initial state. Used by tests and re-onboarding flows. */
  reset: () => void;
}

const INITIAL_STATE: Pick<AuthStore, 'authState' | 'userId'> = {
  authState: 'initialising',
  userId: null,
};

export const useAuthStore = create<AuthStore>()((set) => ({
  ...INITIAL_STATE,
  setAuthState: (state) => set({ authState: state }),
  setUserId: (id) => set({ userId: id }),
  reset: () => set(INITIAL_STATE),
}));

/**
 * Adapter that exposes the Zustand store's setState methods as an
 * `AuthStateWriter` for the application-layer AuthService.
 *
 * The application layer cannot import `@store/*` (architecture boundary),
 * so it depends on the `AuthStateWriter` port instead. This function
 * returns an object that satisfies that port, backed by the real Zustand
 * store. The composition root (presentation layer) wires the AuthService
 * with this adapter at app launch.
 */
export function getAuthStoreWriter(): {
  setAuthState: (state: AuthState) => void;
  setUserId: (id: string | null) => void;
} {
  return {
    setAuthState: (state) => {
      useAuthStore.getState().setAuthState(state);
    },
    setUserId: (id) => {
      useAuthStore.getState().setUserId(id);
    },
  };
}
