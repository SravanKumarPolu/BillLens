/**
 * Supabase auth event names (isolated so tests/domain code never import
 * supabase-js types). Mirrors @supabase/supabase-js AuthChangeEvent.
 */
export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'MFA_CHALLENGE_ANSWERED'
  | string;
