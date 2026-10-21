/** Invitation tokens: bearer secret, no key material, expiry. */

import { describe, expect, it } from '@jest/globals';

import {
  assertInvitationUsable,
  createInvitation,
  hashInvitationToken,
  verifyInvitationToken,
} from '@domain/sync-crypto/invitation';
import { generateGroupKey } from '@domain/sync-crypto';

const NOW = new Date('2026-10-21T10:00:00.000Z');

describe('group invitations', () => {
  it('creates a token whose hash verifies and which carries no key', () => {
    const groupKey = generateGroupKey(new Uint8Array(32).fill(77));
    const invite = createInvitation({
      groupId: 'g1',
      inviterDeviceId: 'device_a',
      now: NOW,
      invitationId: 'inv_1',
    });

    expect(invite.token).toHaveLength(64);
    expect(verifyInvitationToken(invite.token, invite.tokenHash)).toBe(true);
    expect(verifyInvitationToken(`${invite.token.slice(0, -2)}00`, invite.tokenHash)).toBe(false);
    expect(invite.tokenHash).toBe(hashInvitationToken(invite.token));

    // The URL-safe payload must not leak the group key or a raw key id.
    const serialised = JSON.stringify(invite);
    expect(serialised).not.toContain(Buffer.from(groupKey.key).toString('hex'));
    expect(serialised).not.toContain(groupKey.keyId);
  });

  it('expires and cannot be reused', () => {
    const invite = createInvitation({
      groupId: 'g1',
      inviterDeviceId: 'device_a',
      now: NOW,
      ttlMs: 60_000,
    });
    expect(() => assertInvitationUsable(invite, NOW)).not.toThrow();
    expect(() => assertInvitationUsable(invite, new Date(NOW.getTime() + 60_001))).toThrow(
      /expired/,
    );
    expect(() =>
      assertInvitationUsable(
        { ...invite, consumedAt: new Date(NOW.getTime() + 1).toISOString() },
        NOW,
      ),
    ).toThrow(/already been used/);
  });
});
