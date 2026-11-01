/**
 * FindLinkCandidatesUseCase — Phase 3 Prompt 28.
 *
 * Given a (group, member) pair, find other members in the same group who
 * are likely to be the same real-world person. Used by the UI to surface
 * "Are these the same person?" prompts before linking identities.
 *
 * Matching heuristics (evaluated in order; first match wins for the
 * candidate's `score`):
 *
 *   1. Same display name (case-insensitive, trimmed).
 *      Score: 1.0 (strongest).
 *   2. Display names share a token (whitespace-split, length ≥ 3).
 *      Score: 0.5.
 *   3. Target member has no `userId` AND the source member has a `userId`
 *      (i.e. the source is a real profile that could "absorb" the placeholder).
 *      Score: 0.3.
 *
 * The use case NEVER returns members from other groups. Cross-group linking
 * is explicitly rejected by `LinkMembershipToProfileUseCase`.
 *
 * The use case NEVER returns members whose `leftAt` is set — they are not
 * active candidates. Historical members are surfaced by the join-group use
 * case's `link_existing_membership` flow instead.
 */

import { isMemberActive } from '@domain/entities/group-member';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupId, MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface FindLinkCandidatesInput {
  readonly groupId: GroupId;
  readonly memberId: MemberId;
}

export interface LinkCandidate {
  readonly memberId: MemberId;
  readonly displayName: string;
  readonly hasUserId: boolean;
  /** 0..1 match score; higher = more likely the same person. */
  readonly score: number;
  readonly reason: 'same_name' | 'shared_token' | 'placeholder_target';
}

export interface FindLinkCandidatesOutput {
  readonly candidates: readonly LinkCandidate[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class FindLinkCandidatesUseCase {
  constructor(private readonly memberRepo: GroupMemberRepository) {}

  async execute(
    input: FindLinkCandidatesInput,
  ): Promise<FindLinkCandidatesOutput> {
    const source = await this.memberRepo.findById(input.memberId);
    if (!source) {
      return { candidates: [] };
    }
    if (source.groupId !== input.groupId) {
      // Cross-group lookup is not allowed.
      return { candidates: [] };
    }

    const allActive = await this.memberRepo.listActiveByGroup(input.groupId);
    const sourceName = (source.displayName as string).trim().toLowerCase();
    const sourceTokens = new Set(
      sourceName.split(/\s+/).filter((t) => t.length >= 3),
    );

    const candidates: LinkCandidate[] = [];
    for (const m of allActive) {
      if (m.id === source.id) continue;
      if (!isMemberActive(m)) continue;

      const candidateName = (m.displayName as string).trim().toLowerCase();
      const candidateTokens = new Set(
        candidateName.split(/\s+/).filter((t) => t.length >= 3),
      );

      let score = 0;
      let reason: LinkCandidate['reason'] | null = null;

      if (candidateName === sourceName && sourceName.length > 0) {
        score = 1;
        reason = 'same_name';
      } else {
        // Shared token (intersection of length-≥3 tokens).
        let shared = 0;
        for (const t of candidateTokens) {
          if (sourceTokens.has(t)) shared += 1;
        }
        if (shared > 0) {
          score = 0.5;
          reason = 'shared_token';
        }
      }

      // Placeholder-target heuristic: source has a userId, candidate does not.
      // Useful when a real-profile member wants to absorb a placeholder.
      if (reason === null) {
        if (source.userId !== undefined && m.userId === undefined) {
          score = 0.3;
          reason = 'placeholder_target';
        }
      }

      if (reason !== null && score > 0) {
        candidates.push({
          memberId: m.id,
          displayName: m.displayName as string,
          hasUserId: m.userId !== undefined,
          score,
          reason,
        });
      }
    }

    // Sort highest score first; stable for equal scores by member id.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.memberId as string).localeCompare(b.memberId as string);
    });

    return { candidates };
  }
}
