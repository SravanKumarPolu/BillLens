/**
 * Zustand store barrel.
 *
 * UI-state stores (current theme, navigation state, app runtime state,
 * current group, draft expense, receipt review, filters, modal state)
 * live here. Long-term durable data MUST live in SQLite, not Zustand —
 * Zustand is for ephemeral UI state only.
 */

export { useThemeStore } from './theme-store';
export type { ThemeStore } from './theme-store';

export { useNavigationStore } from './navigation-store';
export type { NavigationStore } from './navigation-store';

export { useAppState } from './app-state-store';
export type { AppStateStore } from './app-state-store';

export { useGuestStore } from './guest-store';
export type { GuestStore } from './guest-store';

export { useGroupStore } from './group-store';
export type { GroupStore, GroupSummary } from './group-store';

export {
  PROCESSING_STATUS_MESSAGES,
  useCaptureStore,
} from './capture-store';
export type { CaptureStore, ProcessingState, ProcessingStatus } from './capture-store';

export { useDraftStore } from './draft-store';
export type { DraftStore } from './draft-store';

export { getAuthStoreWriter, useAuthStore } from './auth-store';
export type { AuthStore } from './auth-store';
