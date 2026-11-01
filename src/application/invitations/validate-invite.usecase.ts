/**
 * ValidateInviteUseCase — Phase 3 Prompt 26.
 *
 * Given a plain invite token (as pasted by the user or extracted from a
 * deep link), determine whether the invite is still usable and, if so,
 * return a public-facing preview of the group the user is about to join.
 *
 * CRITICAL: this use case never exposes financial data — no balances,
 * no expense history, no member contact info beyond display names.
 * The caller decides whether to proceed to {@link JoinGroupUseCase}
 * based on the returned preview.
 *
 * Lookup strategy:
 *   1. Hash the plain token via the injected hasher port.
 *   2. Look up the invite by `tokenHash` (cloud-safe — no plain token
 *      ever leaves the client after this point).
 *   3. If not found, also try the legacy `findByToken` path for
 *      backwards compatibility with locally-saved Phase 1 invites
 *      that may not yet have a populated `tokenHash` column.
 *   4. Evaluate status, expiry, and useCount.
 *   5. Load the group + active members + inviter for the preview.
 *
 * The returned `kind` discriminates between the success and each
 * failure mode so the UI can render the right message.
 */

import { isGroupActive, type Group } from '@domain/entities/group';
import {
  type GroupInvite,
  isInviteExpired,
  isInviteExhausted,
} from '@domain/entities/group-invite';
import type { GroupMember } from '@domain/entities/group-member';
import type { GroupInviteRepository } from '@domain/repositories/group-invite.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';

import type { HashInviteToken } from './invite-token-port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface ValidateInviteInput {
  readonly plainToken: string;
  /** Optional override for the current time (used in tests). Defaults to now. */
  readonly now?: string;
}

export interface InviteGroupPreview {
  readonly groupId: string;
  readonly groupName: string;
  readonly currencyCode: string;
  readonly memberCount: number;
  /** Display name of the member who extended the invite. */
  readonly inviterName: string | null;
  /** The role the joining user will receive on accept. */
  readonly intendedRole: 'member' | 'admin';
  /** Whether the invite allows multiple acceptances. */
  readonly maxUses: number;
  /** ISO date when the invite expires. */
  readonly expiresAt: string;
}

export type ValidateInviteResult =
  | { readonly kind: 'valid'; readonly invite: GroupInvite; readonly preview: InviteGroupPreview }
  | { readonly kind: 'invalid_token' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'already_accepted'; readonly invite: GroupInvite }
  | { readonly kind: 'exhausted'; readonly invite: GroupInvite }
  | { readonly kind: 'group_not_found' }
  | { readonly kind: 'group_archived' };

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ValidateInviteUseCase {
  constructor(
    private readonly inviteRepo: GroupInviteRepository,
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly hashToken: HashInviteToken,
  ) {}

  async execute(input: ValidateInviteInput): Promise<ValidateInviteResult> {
    if (!input.plainToken || input.plainToken.length < 32) {
      return { kind: 'invalid_token' };
    }

    // 1. Hash and look up the invite by hash (cloud-safe path).
    const tokenHash = this.hashToken(input.plainToken);
    let invite: GroupInvite | null = null;
    try {
      invite = await this.inviteRepo.findByTokenHash(tokenHash);
    } catch {
      // Repository may not implement hash lookup yet (Phase 1 local SQLite
      // path). Fall through to the legacy plain-token lookup.
      invite = null;
    }

    // 2. Legacy fallback: look up by plain token (Phase 1 compatibility).
    if (!invite) {
      try {
        invite = await this.inviteRepo.findByToken(
          input.plainToken as GroupInvite['token'],
        );
      } catch {
        invite = null;
      }
    }

    if (!invite) {
      return { kind: 'invalid_token' };
    }

    // 3. Status evaluation.
    if (invite.status === 'revoked') {
      return { kind: 'revoked' };
    }
    if (isInviteExpired(invite, input.now as never)) {
      return { kind: 'expired' };
    }
    if (invite.status === 'accepted') {
      // For multi-use invites, `accepted` means exhausted; for single-use
      // invites, `accepted` means already used by someone.
      if (isInviteExhausted(invite)) {
        return { kind: 'exhausted', invite };
      }
      // Defensive: single-use invite marked accepted but useCount 0 —
      // treat as already_accepted (someone consumed the status transition).
      return { kind: 'already_accepted', invite };
    }
    if (isInviteExhausted(invite)) {
      return { kind: 'exhausted', invite };
    }

    // 4. Group preview.
    const group: Group | null = await this.groupRepo.findById(invite.groupId);
    if (!group) {
      return { kind: 'group_not_found' };
    }
    if (!isGroupActive(group)) {
      return { kind: 'group_archived' };
    }

    const activeMembers: readonly GroupMember[] = await this.memberRepo.listActiveByGroup(
      invite.groupId,
    );
    const inviter = activeMembers.find((m) => m.id === invite!.inviterMemberId);
    // If the inviter has left the group, fall back to historical lookup
    // so the user still sees a name rather than a null. This does NOT
    // expose any data the user could not already derive from the invite.
    const inviterName = inviter
      ? (inviter.displayName as string)
      : ((await this.memberRepo.findById(invite.inviterMemberId))?.displayName as string) ?? null;

    const preview: InviteGroupPreview = {
      groupId: invite.groupId as string,
      groupName: group.name,
      currencyCode: group.currencyCode as string,
      memberCount: activeMembers.length,
      inviterName,
      intendedRole: invite.intendedRole,
      maxUses: invite.maxUses ?? 1,
      expiresAt: invite.expiresAt as string,
    };

    return { kind: 'valid', invite, preview };
  }
}
