import type { GroupId, InviteId, InviteToken, MemberId } from '@shared-types/index';

import { InvalidEntityError, VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type VersionNumber,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asInviteId(value: string): InviteId {
  return value as InviteId;
}

export function asInviteToken(value: string): InviteToken {
  return value as InviteToken;
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/**
 * The role a joining member will receive when they accept this invite.
 *
 * `member` is the default for single-use invites shared with friends.
 * `admin` is reserved for invites extended to co-organizers; only the
 * group owner can mint `admin` invites.
 */
export type IntendedRole = 'member' | 'admin';

/**
 * Supplementary invite fields used by Phase 3 Prompts 26–27.
 *
 * The original `GroupInvite` interface is read by Phase 1 code paths
 * (mappers, sync, balance engine). To avoid a breaking schema change,
 * the new fields live in this supplementary interface and the canonical
 * `GroupInvite` interface extends it. Storage-layer code (SQLite,
 * Supabase) MUST persist `tokenHash` and NOT the plain `token`; the
 * plain token is returned from the create-invite use case only for
 * immediate display/sharing and is never re-read from storage.
 *
 * CRITICAL: `tokenHash` is the lookup key for cloud-stored invites.
 * The plain `token` field remains on the entity ONLY to keep the
 * Phase 1 local-SQLite path working — it is considered deprecated
 * for any new cloud-side code.
 */
export interface GroupInviteMetadata {
  /** The role the joining member will receive. Defaults to `member`. */
  readonly intendedRole: IntendedRole;
  /**
   * Maximum number of times this invite may be used.
   * `undefined` is treated as 1 (single-use). Multi-use invites
   * are bounded by {@link MAX_INVITE_USES} (50).
   */
  readonly maxUses?: number;
  /** Number of times the invite has already been used. */
  readonly useCount: number;
  /**
   * Non-reversible hash of the invite token. Stored instead of the
   * plain token in cloud-stored invites so a database leak cannot
   * be reused to join a group.
   */
  readonly tokenHash: string;
}

export interface GroupInvite extends GroupInviteMetadata {
  readonly id: InviteId;
  readonly groupId: GroupId;
  /**
   * Plain token. Used by Phase 1 local-SQLite storage for lookups.
   * Cloud storage MUST use {@link GroupInviteMetadata.tokenHash}
   * instead — never persist the plain token server-side.
   */
  readonly token: InviteToken;
  readonly inviterMemberId: MemberId;
  readonly inviteeDisplayName?: string;
  readonly inviteeEmail?: string;
  readonly status: InviteStatus;
  readonly expiresAt: DateTime;
  readonly acceptedByMemberId?: MemberId;
  readonly acceptedAt?: DateTime;
  readonly revokedAt?: DateTime;
  readonly createdAt: DateTime;
  readonly version: VersionNumber;
}

export interface GroupInviteCreateInput {
  readonly id: InviteId;
  readonly groupId: GroupId;
  readonly token: string;
  readonly inviterMemberId: MemberId;
  readonly inviteeDisplayName?: string;
  readonly inviteeEmail?: string;
  readonly expiresInDays: number;
  /** Non-reversible hash of the token. Required for cloud-safe storage. */
  readonly tokenHash: string;
  /** Role the joining member will receive. Defaults to `member`. */
  readonly intendedRole?: IntendedRole;
  /** Max number of acceptances. `undefined` or `1` = single-use. Max 50. */
  readonly maxUses?: number;
  readonly now?: DateTime;
}

/**
 * Minimum length (in characters) of an invite token. 32 hex chars = 128 bits
 * of entropy, sufficient to resist brute-force guessing for the lifetime of
 * an invite (max 30 days).
 */
export const MIN_INVITE_TOKEN_LENGTH = 32;

/** Maximum number of times a single multi-use invite may be accepted. */
export const MAX_INVITE_USES = 50;

/** Default expiry (in days) when none is specified. */
export const DEFAULT_INVITE_EXPIRES_IN_DAYS = 7;

/**
 * Hex token regex. URL-safe base64 will also be accepted in Phase 2.
 *
 * Exported so the deep-link parser (application layer) can validate
 * pasted tokens against the same shape used by the entity factory.
 */
export const INVITE_TOKEN_REGEX = /^[a-f0-9]+$/i;

export function createGroupInvite(input: GroupInviteCreateInput): GroupInvite {
  if (!Number.isInteger(input.expiresInDays) || input.expiresInDays <= 0) {
    throw new InvalidEntityError(`expiresInDays must be a positive integer, got ${input.expiresInDays}`);
  }
  if (input.expiresInDays > 30) {
    throw new InvalidEntityError(`expiresInDays must be at most 30, got ${input.expiresInDays}`);
  }
  // Validate token entropy to resist brute-force guessing attacks.
  if (input.token.length < MIN_INVITE_TOKEN_LENGTH) {
    throw new InvalidEntityError(
      `Invite token must be at least ${MIN_INVITE_TOKEN_LENGTH} characters for security, got ${input.token.length}`,
    );
  }
  if (!INVITE_TOKEN_REGEX.test(input.token)) {
    throw new InvalidEntityError(
      'Invite token must be hexadecimal (URL-safe base64 also accepted in Phase 2)',
    );
  }
  if (!input.tokenHash || input.tokenHash.length === 0) {
    throw new InvalidEntityError('Invite tokenHash is required');
  }
  const intendedRole: IntendedRole = input.intendedRole ?? 'member';
  if (intendedRole !== 'member' && intendedRole !== 'admin') {
    throw new InvalidEntityError(
      `intendedRole must be 'member' or 'admin', got ${intendedRole}`,
    );
  }
  const maxUses = input.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new InvalidEntityError(`maxUses must be a positive integer, got ${maxUses}`);
  }
  if (maxUses > MAX_INVITE_USES) {
    throw new InvalidEntityError(`maxUses must be at most ${MAX_INVITE_USES}, got ${maxUses}`);
  }
  const now = input.now ?? nowDateTime();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
  return {
    id: input.id,
    groupId: input.groupId,
    token: asInviteToken(input.token),
    inviterMemberId: input.inviterMemberId,
    ...(input.inviteeDisplayName !== undefined ? { inviteeDisplayName: input.inviteeDisplayName } : {}),
    ...(input.inviteeEmail !== undefined ? { inviteeEmail: input.inviteeEmail } : {}),
    status: 'pending',
    expiresAt: asDateTime(expiresAt.toISOString()),
    createdAt: asDateTime(now),
    version: initialVersionNumber(),
    intendedRole,
    maxUses,
    useCount: 0,
    tokenHash: input.tokenHash,
  };
}

export interface GroupInviteIncrementUseInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Record one additional use of an invite. Bumps `useCount` and, when the
 * invite has been used `maxUses` times, transitions it to `accepted`.
 *
 * Single-use invites (`maxUses === 1`) immediately move to `accepted`
 * on first use. Multi-use invites remain `pending` until exhausted.
 */
export function incrementInviteUseCount(
  current: GroupInvite,
  input: GroupInviteIncrementUseInput,
): GroupInvite {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupInvite version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.status !== 'pending') {
    throw new Error(`Cannot use invite in status ${current.status}`);
  }
  const now = input.now ?? nowDateTime();
  if (current.expiresAt <= now) {
    throw new Error(`Invite ${current.id} has expired (expired at ${current.expiresAt})`);
  }
  const maxUses = current.maxUses ?? 1;
  if (current.useCount >= maxUses) {
    throw new Error(
      `Invite ${current.id} is exhausted (${current.useCount}/${maxUses} uses)`,
    );
  }
  const nextUseCount = current.useCount + 1;
  const exhausted = nextUseCount >= maxUses;
  return {
    ...current,
    useCount: nextUseCount,
    status: exhausted ? 'accepted' : 'pending',
    ...(exhausted ? { acceptedAt: asDateTime(now) } : {}),
    version: asVersionNumber(current.version + 1),
  };
}

export interface GroupInviteAcceptInput {
  readonly acceptingMemberId: MemberId;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function acceptGroupInvite(
  current: GroupInvite,
  input: GroupInviteAcceptInput,
): GroupInvite {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupInvite version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.status !== 'pending') {
    throw new Error(`Cannot accept invite in status ${current.status}`);
  }
  const now = input.now ?? nowDateTime();
  if (current.expiresAt <= now) {
    throw new Error(`Invite ${current.id} has expired (expired at ${current.expiresAt})`);
  }
  return {
    ...current,
    status: 'accepted',
    acceptedByMemberId: input.acceptingMemberId,
    acceptedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface GroupInviteRevokeInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function revokeGroupInvite(
  current: GroupInvite,
  input: GroupInviteRevokeInput,
): GroupInvite {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupInvite version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.status !== 'pending') {
    throw new Error(`Cannot revoke invite in status ${current.status}`);
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'revoked',
    revokedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export function isInviteExpired(invite: GroupInvite, asOf: DateTime = nowDateTime()): boolean {
  return invite.expiresAt <= asOf;
}

/** True when the invite has been used up to its `maxUses` limit. */
export function isInviteExhausted(invite: GroupInvite): boolean {
  const maxUses = invite.maxUses ?? 1;
  return invite.useCount >= maxUses;
}

export function isInviteUsable(invite: GroupInvite, asOf: DateTime = nowDateTime()): boolean {
  return (
    invite.status === 'pending' &&
    !isInviteExpired(invite, asOf) &&
    !isInviteExhausted(invite)
  );
}
