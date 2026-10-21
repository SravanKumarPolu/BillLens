/**
 * Secure group invitations.
 *
 * An invitation is a high-entropy bearer token plus metadata. It contains
 * **no group key** and no member data: possession only authorises a
 * joining device to register and be added to the relay group. Group keys
 * are then wrapped to that device's X25519 public key (see
 * `group-key.ts`) — never placed in a URL, QR code or chat message.
 *
 * The relay/inviter stores only the SHA-256 hash of the token, so a
 * leaked invitation database cannot be replayed.
 */

import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

import { toHex, utf8ToBytes } from './encoding';

export const DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface GroupInvitation {
  readonly invitationId: string;
  readonly groupId: string;
  readonly inviterDeviceId: string;
  /** Bearer secret; share only with the invitee. */
  readonly token: string;
  /** Stored on the relay instead of the token. */
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export function hashInvitationToken(token: string): string {
  return toHex(sha256(utf8ToBytes(`billlens/invite/v1:${token}`)));
}

export function createInvitation(input: {
  readonly groupId: string;
  readonly inviterDeviceId: string;
  readonly now?: Date;
  readonly ttlMs?: number;
  readonly invitationId?: string;
}): GroupInvitation {
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? DEFAULT_INVITATION_TTL_MS;
  const token = toHex(randomBytes(32));
  const invitationId = input.invitationId ?? toHex(randomBytes(16));

  return {
    invitationId,
    groupId: input.groupId,
    inviterDeviceId: input.inviterDeviceId,
    token,
    tokenHash: hashInvitationToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
  };
}

/** Constant-time-ish comparison of the presented token against the hash. */
export function verifyInvitationToken(token: string, expectedHash: string): boolean {
  const actual = hashInvitationToken(token);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

/** Throws when an invitation is expired or already consumed. */
export function assertInvitationUsable(
  invitation: Pick<GroupInvitation, 'expiresAt'> & { readonly consumedAt?: string },
  now: Date = new Date(),
): void {
  if (invitation.consumedAt !== undefined) {
    throw new Error('Invitation has already been used.');
  }
  const expires = Date.parse(invitation.expiresAt);
  if (!Number.isFinite(expires) || now.getTime() >= expires) {
    throw new Error('Invitation has expired.');
  }
}
