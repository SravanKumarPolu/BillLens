import { InvalidEntityError } from '../../errors/index';

/**
 * UPI return-to-app handler — Phase 6 Track 4.
 *
 * ── The safety contract (spec rule, Prompt 56) ──
 *
 *   "BillLens may know:
 *     - User returned to app
 *     - A callback was received
 *     - External app failed to open
 *     - User cancelled inside BillLens
 *
 *    BillLens may not know with certainty:
 *     - Payment succeeded
 *     - Payee received money
 *     - Amount was unchanged
 *     - Payment was not later reversed
 *
 *    unless a verified payment integration provides that evidence."
 *
 * This module captures what BillLens CAN know after the user returns
 * from a UPI app launch, and produces a `UpiReturnResult` that the
 * caller (the use case) uses to drive the next state transition.
 *
 * ── CRITICAL INVARIANT ──
 *
 * This module NEVER returns `payment_completed`. The two possible
 * outcomes are:
 *
 *   - `returned_pending_confirmation`: the user returned; BillLens
 *     has no evidence of payment success; create a
 *     `pending_confirmation` settlement (the receiver must confirm
 *     explicitly).
 *   - `cancelled`: the user explicitly cancelled before launching
 *     the UPI app, or the UPI app failed to open.
 *
 * There is no third option. The settlement state machine (Track 1)
 * enforces the rest: `pending_confirmation → completed` requires
 * `ConfirmSettlementUseCase` invoked by the receiver. The payer
 * cannot self-confirm.
 *
 * ── Privacy ──
 *
 * The handler does NOT receive or process the UPI callback data (if
 * any). UPI callback payloads vary by app and are NOT trustworthy —
 * they can be spoofed. The handler trusts only the platform's
 * "user returned to the app" signal, plus the user's own statement
 * of what happened. The user can attach a payment reference or a
 * screenshot as evidence (Track 4's RecordSettlementUseCase with
 * `paymentReferenceHash` / `evidenceHash`), but evidence does NOT
 * prove completion — only the receiver's explicit confirmation does.
 */

// ---------------------------------------------------------------------------
// Return result types
// ---------------------------------------------------------------------------

/**
 * Discriminated result of a UPI return.
 *
 *   - `returned_pending_confirmation` — user returned from UPI app.
 *     BillLens has no evidence of payment; the caller should create
 *     or update a settlement to `pending_confirmation` status.
 *
 *   - `cancelled` — user explicitly cancelled before launching the
 *     UPI app, or the platform reported the UPI app failed to open.
 *     The caller should leave the settlement in its previous state
 *     (typically `draft`) and not advance to `pending_confirmation`.
 *
 * There is NO `payment_completed` variant. The handler NEVER claims
 * payment success — by construction.
 */
export type UpiReturnResult =
  | { readonly kind: 'returned_pending_confirmation' }
  | { readonly kind: 'cancelled'; readonly reason: string };

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface UpiReturnInput {
  /**
   * What the platform reported happened. The platform (React Native
   * `Linking.addEventListener('url', ...)` or the iOS/Android
   * app-link callback) tells us:
   *
   *   - 'returned_to_app': the user came back to BillLens (we do not
   *     know if they completed the payment in the UPI app).
   *   - 'app_failed_to_open': the platform could not open the UPI
   *     deep link (no UPI app installed, or the user dismissed the
   *     "open with..." dialog).
   *   - 'user_cancelled_in_billels': the user cancelled the launch
   *     inside BillLens (tapped "Cancel" before the UPI app opened).
   */
  readonly platformSignal:
    | 'returned_to_app'
    | 'app_failed_to_open'
    | 'user_cancelled_in_billels';
  /**
   * Optional: what the user told BillLens happened, when prompted by
   * the "ask what happened" UI. The user can choose:
   *
   *   - 'paid': the user claims they paid in the UPI app. BillLens
   *     still does NOT mark as completed — the receiver must confirm.
   *   - 'did_not_pay': the user did not pay (changed mind, UPI app
   *     crashed, etc.). BillLens leaves the settlement in draft.
   *   - 'unknown': the user is not sure. BillLens still creates a
   *     `pending_confirmation` settlement so the receiver can reach
   *     out.
   *
   * If `platformSignal` is `'returned_to_app'` and `userStatement`
   * is undefined, the default is to create a
   * `pending_confirmation` settlement — the safer default.
   */
  readonly userStatement?: 'paid' | 'did_not_pay' | 'unknown';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Process a UPI return signal and produce the next action.
 *
 * This function is PURE: it does not mutate any settlement, does not
 * write to the database, does not perform any I/O. It takes the
 * platform signal and the user's statement and produces a
 * `UpiReturnResult` that the caller (the use case) uses to drive
 * the state machine.
 *
 * The function NEVER returns `payment_completed`. By construction,
 * the only way a settlement becomes `completed` is via the
 * `ConfirmSettlementUseCase` invoked by the receiver.
 *
 * @example
 *   // User returned from UPI app, claims they paid.
 *   const result = handleUpiReturn({
 *     platformSignal: 'returned_to_app',
 *     userStatement: 'paid',
 *   });
 *   // → { kind: 'returned_pending_confirmation' }
 *   // (the caller creates a pending_confirmation settlement)
 *
 *   // User cancelled inside BillLens before launching the UPI app.
 *   const result = handleUpiReturn({
 *     platformSignal: 'user_cancelled_in_billels',
 *   });
 *   // → { kind: 'cancelled', reason: 'User cancelled before launching UPI' }
 */
export function handleUpiReturn(input: UpiReturnInput): UpiReturnResult {
  // ── Validate input ──
  if (
    input.platformSignal !== 'returned_to_app' &&
    input.platformSignal !== 'app_failed_to_open' &&
    input.platformSignal !== 'user_cancelled_in_billels'
  ) {
    throw new InvalidEntityError(
      `handleUpiReturn: invalid platformSignal "${input.platformSignal}"`,
    );
  }
  if (
    input.userStatement !== undefined &&
    input.userStatement !== 'paid' &&
    input.userStatement !== 'did_not_pay' &&
    input.userStatement !== 'unknown'
  ) {
    throw new InvalidEntityError(
      `handleUpiReturn: invalid userStatement "${input.userStatement}"`,
    );
  }

  // ── Branch on platformSignal ──
  switch (input.platformSignal) {
    case 'user_cancelled_in_billels':
      // The user never left BillLens. No UPI app was launched. No
      // payment could have happened. Leave the settlement alone.
      return {
        kind: 'cancelled',
        reason: 'User cancelled before launching UPI',
      };

    case 'app_failed_to_open':
      // The platform could not open the UPI deep link. No UPI app
      // installed, or the user dismissed the "open with..." dialog.
      // No payment could have happened.
      return {
        kind: 'cancelled',
        reason: 'UPI app failed to open (no UPI app installed or dismissed)',
      };

    case 'returned_to_app': {
      // The user came back to BillLens. We do NOT know if they paid.
      // The user's statement helps us decide what to do next, but
      // it does NOT prove anything.
      //
      // The default (when userStatement is undefined) is to create
      // a pending_confirmation settlement — the safer default.
      if (input.userStatement === 'did_not_pay') {
        return {
          kind: 'cancelled',
          reason: 'User reported they did not pay',
        };
      }
      // For 'paid' and 'unknown' (and the undefined default), create
      // a pending_confirmation settlement. The receiver must confirm.
      return { kind: 'returned_pending_confirmation' };
    }

    default: {
      // TypeScript exhaustiveness check — should be unreachable.
      const _exhaustive: never = input.platformSignal;
      throw new InvalidEntityError(
        `handleUpiReturn: unhandled platformSignal "${_exhaustive}"`,
      );
    }
  }
}
