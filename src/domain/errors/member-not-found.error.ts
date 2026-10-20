import { DomainError } from './domain-error';

/**
 * Thrown when a group member ID is referenced (in a split, payer, or
 * settlement) but does not exist in the group's current member roster.
 */
export class MemberNotFoundError extends DomainError {
  readonly code = 'MEMBER_NOT_FOUND';

  constructor(
    message: string,
    readonly memberId?: string,
    readonly groupId?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
