import { describe, expect, it } from '@jest/globals';

import { InvalidEntityError } from '../../../errors';
import { handleUpiReturn } from '../upi-return-handler';

/**
 * The return-to-app handler is the most safety-critical piece of the
 * UPI flow. These tests assert the spec's #1 safety rule:
 *
 *   "BillLens must never claim 'Payment completed' only because a
 *    UPI deep link was opened, a QR code was displayed, a payment
 *    screenshot was attached, the user left BillLens and returned,
 *    or a payment reference was manually entered."
 *
 * The handler NEVER returns a "payment_completed" variant. The two
 * possible outcomes are:
 *
 *   - returned_pending_confirmation — create a pending_confirmation
 *     settlement; receiver must confirm explicitly.
 *   - cancelled — leave the settlement alone.
 */
describe('UPI return-to-app handler — safety invariant', () => {
  it('NEVER produces a "payment_completed" variant (the safety rule)', () => {
    // Run through every input combination and verify the result kind
    // is never anything that implies payment success.
    const platformSignals = [
      'returned_to_app',
      'app_failed_to_open',
      'user_cancelled_in_billels',
    ] as const;
    const userStatements = [undefined, 'paid', 'did_not_pay', 'unknown'] as const;

    for (const ps of platformSignals) {
      for (const us of userStatements) {
        const result = handleUpiReturn({
          platformSignal: ps,
          ...(us !== undefined ? { userStatement: us } : {}),
        });
        // The only valid kinds are these two.
        expect(
          result.kind === 'returned_pending_confirmation' ||
            result.kind === 'cancelled',
        ).toBe(true);
        // There is no 'payment_completed' / 'paid' / 'success' variant.
        expect(result.kind).not.toContain('paid');
        expect(result.kind).not.toContain('success');
        expect(result.kind).not.toContain('completed');
      }
    }
  });
});

describe('UPI return-to-app handler — branch coverage', () => {
  // ── user_cancelled_in_billels ─────────────────────────────────

  describe('platformSignal = user_cancelled_in_billels', () => {
    it('returns cancelled regardless of userStatement', () => {
      const r1 = handleUpiReturn({ platformSignal: 'user_cancelled_in_billels' });
      const r2 = handleUpiReturn({
        platformSignal: 'user_cancelled_in_billels',
        userStatement: 'paid', // even if the user claims paid, we cancel
      });
      expect(r1.kind).toBe('cancelled');
      expect(r2.kind).toBe('cancelled');
      if (r1.kind === 'cancelled') {
        expect(r1.reason).toContain('User cancelled');
      }
    });
  });

  // ── app_failed_to_open ────────────────────────────────────────

  describe('platformSignal = app_failed_to_open', () => {
    it('returns cancelled with reason about app not opening', () => {
      const r = handleUpiReturn({ platformSignal: 'app_failed_to_open' });
      expect(r.kind).toBe('cancelled');
      if (r.kind === 'cancelled') {
        expect(r.reason).toContain('failed to open');
      }
    });

    it('returns cancelled even if the user claims paid', () => {
      const r = handleUpiReturn({
        platformSignal: 'app_failed_to_open',
        userStatement: 'paid',
      });
      // The app never opened, so the user could not have paid. We
      // treat their "paid" statement as incorrect.
      expect(r.kind).toBe('cancelled');
    });
  });

  // ── returned_to_app ──────────────────────────────────────────

  describe('platformSignal = returned_to_app', () => {
    it('returns pending_confirmation by default (userStatement undefined)', () => {
      const r = handleUpiReturn({ platformSignal: 'returned_to_app' });
      expect(r.kind).toBe('returned_pending_confirmation');
    });

    it('returns pending_confirmation when user says paid (does NOT auto-complete)', () => {
      // THIS IS THE KEY SAFETY TEST: the user claims they paid, but
      // BillLens does NOT mark the settlement as completed. It only
      // advances to pending_confirmation — the receiver must confirm.
      const r = handleUpiReturn({
        platformSignal: 'returned_to_app',
        userStatement: 'paid',
      });
      expect(r.kind).toBe('returned_pending_confirmation');
      expect(r.kind).not.toBe('completed');
      expect(r.kind).not.toBe('payment_completed');
    });

    it('returns pending_confirmation when user says unknown', () => {
      const r = handleUpiReturn({
        platformSignal: 'returned_to_app',
        userStatement: 'unknown',
      });
      expect(r.kind).toBe('returned_pending_confirmation');
    });

    it('returns cancelled when user says did_not_pay', () => {
      const r = handleUpiReturn({
        platformSignal: 'returned_to_app',
        userStatement: 'did_not_pay',
      });
      expect(r.kind).toBe('cancelled');
      if (r.kind === 'cancelled') {
        expect(r.reason).toContain('did not pay');
      }
    });
  });
});

describe('UPI return-to-app handler — input validation', () => {
  it('rejects an invalid platformSignal', () => {
    expect(() =>
      handleUpiReturn({ platformSignal: 'weird_signal' as never }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects an invalid userStatement', () => {
    expect(() =>
      handleUpiReturn({
        platformSignal: 'returned_to_app',
        userStatement: 'maybe' as never,
      }),
    ).toThrow(InvalidEntityError);
  });
});
