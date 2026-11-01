import { describe, expect, it } from '@jest/globals';

import { InvalidStateTransitionError } from '../../../errors/invalid-state-transition.error';
import {
  ALL_SETTLEMENT_STATUSES,
  TERMINAL_STATUSES,
  asSettlementStatus,
  assertValidTransition,
  contributesToCompletedBalance,
  isPendingStatus,
  isTerminalStatus,
  isValidSettlementStatus,
  isValidTransition,
  validNextStatuses,
  VALID_TRANSITIONS,
} from '../settlement-state-machine';

describe('SettlementStateMachine', () => {
  // ── Status type ────────────────────────────────────────────────────

  describe('ALL_SETTLEMENT_STATUSES', () => {
    it('contains exactly the eight spec-defined statuses', () => {
      expect(ALL_SETTLEMENT_STATUSES).toEqual([
        'draft',
        'requested',
        'pending_confirmation',
        'completed',
        'failed',
        'cancelled',
        'disputed',
        'reversed',
      ]);
    });

    it('has exactly 8 statuses', () => {
      expect(ALL_SETTLEMENT_STATUSES).toHaveLength(8);
    });
  });

  describe('asSettlementStatus', () => {
    it('returns the value for a valid status', () => {
      expect(asSettlementStatus('draft')).toBe('draft');
      expect(asSettlementStatus('completed')).toBe('completed');
      expect(asSettlementStatus('pending_confirmation')).toBe('pending_confirmation');
    });

    it('throws InvalidStateTransitionError for an unknown status', () => {
      expect(() => asSettlementStatus('pending')).toThrow(InvalidStateTransitionError);
      expect(() => asSettlementStatus('completedd')).toThrow(InvalidStateTransitionError);
      expect(() => asSettlementStatus('')).toThrow(InvalidStateTransitionError);
    });
  });

  describe('isValidSettlementStatus', () => {
    it('returns true for each valid status', () => {
      for (const s of ALL_SETTLEMENT_STATUSES) {
        expect(isValidSettlementStatus(s)).toBe(true);
      }
    });

    it('returns false for invalid strings', () => {
      expect(isValidSettlementStatus('pending')).toBe(false);
      expect(isValidSettlementStatus('')).toBe(false);
      expect(isValidSettlementStatus(null)).toBe(false);
      expect(isValidSettlementStatus(undefined)).toBe(false);
      expect(isValidSettlementStatus(42)).toBe(false);
    });
  });

  // ── Transition table ────────────────────────────────────────────────

  describe('VALID_TRANSITIONS', () => {
    it('contains the 13 spec-defined transitions', () => {
      // 11 from Prompt 52 + 2 dispute-resolution paths from Prompt 57
      expect(VALID_TRANSITIONS).toHaveLength(13);
    });

    it('includes all draft outgoing transitions', () => {
      const fromDraft = VALID_TRANSITIONS.filter(([f]) => f === 'draft');
      expect(fromDraft).toEqual([
        ['draft', 'requested'],
        ['draft', 'pending_confirmation'],
        ['draft', 'completed'],
      ]);
    });

    it('includes the completed → reversed transition (correction flow)', () => {
      expect(VALID_TRANSITIONS).toContainEqual(['completed', 'reversed']);
    });

    it('includes the failed → draft transition (retry)', () => {
      expect(VALID_TRANSITIONS).toContainEqual(['failed', 'draft']);
    });

    it('includes the disputed → completed/cancelled resolution paths', () => {
      expect(VALID_TRANSITIONS).toContainEqual(['disputed', 'completed']);
      expect(VALID_TRANSITIONS).toContainEqual(['disputed', 'cancelled']);
    });
  });

  // ── isValidTransition ──────────────────────────────────────────────

  describe('isValidTransition', () => {
    it('returns true for every whitelisted transition', () => {
      for (const [from, to] of VALID_TRANSITIONS) {
        expect(isValidTransition(from, to)).toBe(true);
      }
    });

    it('returns false for invalid transitions', () => {
      // Reverse transitions are not valid (reversed → completed is forbidden)
      expect(isValidTransition('reversed', 'completed')).toBe(false);
      expect(isValidTransition('cancelled', 'completed')).toBe(false);
      // Direct jumps that skip states
      expect(isValidTransition('draft', 'disputed')).toBe(false);
      expect(isValidTransition('requested', 'completed')).toBe(false);
      expect(isValidTransition('requested', 'failed')).toBe(false);
      expect(isValidTransition('failed', 'completed')).toBe(false);
      expect(isValidTransition('failed', 'pending_confirmation')).toBe(false);
      // No self-transitions
      expect(isValidTransition('draft', 'draft')).toBe(false);
      expect(isValidTransition('completed', 'completed')).toBe(false);
    });
  });

  // ── assertValidTransition ──────────────────────────────────────────

  describe('assertValidTransition', () => {
    it('does not throw for valid transitions', () => {
      for (const [from, to] of VALID_TRANSITIONS) {
        expect(() => assertValidTransition(from, to)).not.toThrow();
      }
    });

    it('throws InvalidStateTransitionError for invalid transitions', () => {
      expect(() => assertValidTransition('reversed', 'completed')).toThrow(InvalidStateTransitionError);
      expect(() => assertValidTransition('cancelled', 'completed')).toThrow(InvalidStateTransitionError);
      expect(() => assertValidTransition('draft', 'disputed')).toThrow(InvalidStateTransitionError);
      expect(() => assertValidTransition('completed', 'pending_confirmation')).toThrow(InvalidStateTransitionError);
    });

    it('preserves from and to in the error for diagnostics', () => {
      try {
        assertValidTransition('reversed', 'completed');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStateTransitionError);
        const e = err as InvalidStateTransitionError;
        expect(e.from).toBe('reversed');
        expect(e.to).toBe('completed');
        expect(e.code).toBe('INVALID_STATE_TRANSITION');
      }
    });
  });

  // ── validNextStatuses ─────────────────────────────────────────────

  describe('validNextStatuses', () => {
    it('returns the three valid next states from draft', () => {
      expect(validNextStatuses('draft')).toEqual([
        'requested',
        'pending_confirmation',
        'completed',
      ]);
    });

    it('returns the two valid next states from requested', () => {
      expect(validNextStatuses('requested')).toEqual([
        'pending_confirmation',
        'cancelled',
      ]);
    });

    it('returns the four valid next states from pending_confirmation', () => {
      expect(validNextStatuses('pending_confirmation')).toEqual([
        'completed',
        'failed',
        'cancelled',
        'disputed',
      ]);
    });

    it('returns reversed as the only valid next state from completed', () => {
      expect(validNextStatuses('completed')).toEqual(['reversed']);
    });

    it('returns draft as the only valid next state from failed', () => {
      expect(validNextStatuses('failed')).toEqual(['draft']);
    });

    it('returns the two resolution paths from disputed', () => {
      expect(validNextStatuses('disputed')).toEqual(['completed', 'cancelled']);
    });

    it('returns an empty array from terminal statuses', () => {
      expect(validNextStatuses('cancelled')).toEqual([]);
      expect(validNextStatuses('reversed')).toEqual([]);
    });
  });

  // ── Terminal status ───────────────────────────────────────────────

  describe('isTerminalStatus', () => {
    it('returns true for cancelled and reversed', () => {
      expect(isTerminalStatus('cancelled')).toBe(true);
      expect(isTerminalStatus('reversed')).toBe(true);
    });

    it('returns false for non-terminal statuses', () => {
      expect(isTerminalStatus('draft')).toBe(false);
      expect(isTerminalStatus('requested')).toBe(false);
      expect(isTerminalStatus('pending_confirmation')).toBe(false);
      // completed is NOT terminal because it can still be reversed
      expect(isTerminalStatus('completed')).toBe(false);
      expect(isTerminalStatus('failed')).toBe(false);
      expect(isTerminalStatus('disputed')).toBe(false);
    });
  });

  describe('TERMINAL_STATUSES', () => {
    it('contains exactly cancelled and reversed', () => {
      expect(TERMINAL_STATUSES).toEqual(['cancelled', 'reversed']);
    });
  });

  // ── Balance engine contract ───────────────────────────────────────

  describe('contributesToCompletedBalance', () => {
    it('returns true ONLY for completed', () => {
      expect(contributesToCompletedBalance('completed')).toBe(true);
    });

    it('returns false for every non-completed status', () => {
      const nonCompleted = ALL_SETTLEMENT_STATUSES.filter((s) => s !== 'completed');
      for (const s of nonCompleted) {
        expect(contributesToCompletedBalance(s)).toBe(false);
      }
    });

    it('returns false for pending_confirmation (the spec safety rule)', () => {
      // This is THE critical assertion for the spec rule:
      // "Pending settlements do not affect completed balances"
      expect(contributesToCompletedBalance('pending_confirmation')).toBe(false);
      expect(contributesToCompletedBalance('disputed')).toBe(false);
      expect(contributesToCompletedBalance('failed')).toBe(false);
      expect(contributesToCompletedBalance('cancelled')).toBe(false);
      expect(contributesToCompletedBalance('reversed')).toBe(false);
    });
  });

  describe('isPendingStatus', () => {
    it('returns true for pending_confirmation and requested', () => {
      expect(isPendingStatus('pending_confirmation')).toBe(true);
      expect(isPendingStatus('requested')).toBe(true);
    });

    it('returns false for other statuses', () => {
      expect(isPendingStatus('draft')).toBe(false);
      expect(isPendingStatus('completed')).toBe(false);
      expect(isPendingStatus('disputed')).toBe(false);
    });
  });
});
