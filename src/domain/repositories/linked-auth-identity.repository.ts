import type { UserId } from '@shared-types/index';

import type { LinkedAuthIdentity } from '../entities/linked-auth-identity';
import type { AuthProviderType } from '../ports/authentication-provider.port';

import type { DeleteMetadata, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the {@link LinkedAuthIdentity} entity.
 *
 * Stores the links between a BillLens profile (User) and the external
 * authentication providers (email OTP, Google, Apple) the user has
 * connected.
 *
 * CRITICAL INVARIANT: queries that match a provider identity MUST use
 * `providerSubject` (the stable provider-issued identifier), NOT
 * `providerEmail`. Email addresses are mutable; the subject is not.
 * Implementations of `findByProviderSubject` and `findLinked` MUST
 * enforce this rule.
 *
 * A single profile may have multiple linked identities (one per
 * provider). Conversely, a single (provider, providerSubject) tuple
 * may be linked to AT MOST ONE profile — linking the same provider
 * subject to two profiles is a security violation (account
 * enumeration) and is rejected by `save`.
 */
export interface LinkedAuthIdentityRepository {
  /** Find a linked identity by its primary key. */
  findById(id: string): Promise<LinkedAuthIdentity | null>;

  /**
   * Find a linked identity by (provider, providerSubject).
   *
   * This is the canonical lookup for sign-in: given a provider subject
   * returned by the OAuth flow, determine which profile it is linked
   * to. Returns null if no link exists (the provider identity is new).
   *
   * SECURITY: implementations MUST match on `providerSubject`, never
   * on `providerEmail`.
   */
  findByProviderSubject(
    provider: AuthProviderType,
    providerSubject: string,
  ): Promise<LinkedAuthIdentity | null>;

  /**
   * List all identities linked to a profile. Used by the "linked
   * providers" UI and by the unlink flow (to count how many
   * providers remain).
   */
  listByProfile(profileId: UserId): Promise<readonly LinkedAuthIdentity[]>;

  /**
   * Count how many identities are linked to a profile. Used by the
   * unlink flow to block unlinking the user's only auth method.
   */
  countByProfile(profileId: UserId): Promise<number>;

  /**
   * Save (insert or update) a linked identity.
   *
   * Idempotent: if the (provider, providerSubject) tuple already
   * exists for the same profileId, the call is a no-op (returns the
   * existing record). If the tuple exists for a DIFFERENT profileId,
   * implementations MUST throw — that would mean one provider
   * identity is linked to two BillLens profiles.
   */
  save(identity: LinkedAuthIdentity): Promise<LinkedAuthIdentity>;

  /**
   * Soft-delete (unlink) a linked identity.
   */
  softDelete(id: string, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
