import { DomainError } from './domain-error';

/**
 * Thrown when an expense split configuration is invalid.
 *
 * Covers:
 *  - Empty participants list
 *  - Duplicate members in participants
 *  - Split amounts don't sum to expense total (under- or over-allocation)
 *  - Percentage total ≠ 100% (≠ 10,000 basis points)
 *  - Basis points total ≠ 10,000
 *  - Share units ≤ 0
 *  - Unknown split type
 *  - Item-level splits with missing item references
 */
export class InvalidSplitError extends DomainError {
  readonly code = 'INVALID_SPLIT';
}
