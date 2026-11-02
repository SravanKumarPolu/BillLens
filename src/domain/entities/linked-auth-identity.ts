import type { UserId } from '@shared-types/index';

import type { AuthProviderType } from '../ports/authentication-provider.port';
import {
  type DateTime,
  type VersionNumber,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';

/**
 * LinkedAuthIdentity — a link between a BillLens profile (User) and an
 * external authentication provider (email OTP, Google, Apple).
 *
 * A single profile may have MULTIPLE linked identities — e.g. a user
 * who started with email OTP and later linked Google and Apple. The
 * user may sign in via any of the linked providers.
 *
 * CRITICAL INVARIANT: the link is keyed on `providerSubject`, NOT on
 * `providerEmail`. The provider subject is the stable, unique identifier
 * issued by the provider (e.g. Google's `sub` claim, Apple's `user`
 * identifier, or the Supabase user ID for email OTP). Email addresses
 * are mutable — using them as the link key would break when a user
 * changes their email.
 *
 * Apple's "Hide My Email" private relay addresses are stored in
 * `providerEmail` as-is; the `providerSubject` (Apple's stable user
 * identifier) is what we use for de-duplication.
 */

export interface LinkedAuthIdentity {
  readonly id: string;
  readonly profileId: UserId;
  readonly provider: AuthProviderType;
  /** Stable, unique identifier issued by the provider. */
  readonly providerSubject: string;
  /** May be a private relay email (Apple) or undefined (subject-only). */
  readonly providerEmail?: string;
  readonly createdAt: DateTime;
  readonly lastUsedAt: DateTime;
  readonly version: VersionNumber;
}

export interface LinkedAuthIdentityCreateInput {
  readonly id: string;
  readonly profileId: UserId;
  readonly provider: AuthProviderType;
  readonly providerSubject: string;
  readonly providerEmail?: string;
  readonly now?: DateTime;
}

export function createLinkedAuthIdentity(
  input: LinkedAuthIdentityCreateInput,
): LinkedAuthIdentity {
  if (!input.providerSubject || input.providerSubject.trim().length === 0) {
    throw new Error('providerSubject must not be empty');
  }
  if (!input.profileId) {
    throw new Error('profileId must not be empty');
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    profileId: input.profileId,
    provider: input.provider,
    providerSubject: input.providerSubject,
    ...(input.providerEmail !== undefined
      ? { providerEmail: input.providerEmail }
      : {}),
    createdAt: asDateTime(now),
    lastUsedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface LinkedAuthIdentityTouchInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Mark the identity as having been used at the current time (e.g. the
 * user just signed in via this provider). Bumps the version for
 * optimistic concurrency.
 */
export function touchLinkedAuthIdentity(
  current: LinkedAuthIdentity,
  input: LinkedAuthIdentityTouchInput,
): LinkedAuthIdentity {
  if (current.version !== input.expectedVersion) {
    throw new Error(
      `LinkedAuthIdentity version conflict: expected ${input.expectedVersion}, got ${current.version}`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    lastUsedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}
