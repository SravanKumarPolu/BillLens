import type { AuthSession } from './authentication-provider.port';

/**
 * SessionStorage port — declared in the domain layer, implemented by
 * infrastructure (concrete `SessionStorage` class in
 * `src/infrastructure/security/session-storage.ts`).
 *
 * The application-layer `AuthService` depends on this port (rather than
 * the concrete class) so the architecture-boundary rule
 * ("application must not import infrastructure") is preserved.
 *
 * Responsibilities:
 *   - Persist the access/refresh tokens + userId to SecureStore.
 *   - Load a cached session for restore-on-launch.
 *   - Clear tokens on sign-out (without touching local data).
 *
 * NOTE: the loaded session has `expiresAt: 0` and `provider: 'email'`
 * placeholders — the caller must refresh the session to populate the
 * real values. This avoids storing derived/mutable fields.
 */
export interface SessionStoragePort {
  saveSession(session: AuthSession): Promise<void>;
  loadSession(): Promise<AuthSession | null>;
  clearSession(): Promise<void>;
}
