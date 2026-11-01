/**
 * UPI-assisted settlement service layer — Phase 6 Track 4.
 *
 * Pure modules: VPA validator, deep-link builder, QR-code generator,
 * payment-request sharing, and the return-to-app handler.
 *
 * ── Safety invariant (enforced by construction) ──
 *
 * No function in this module marks a settlement as `completed`.
 * The return-to-app handler returns either
 * `returned_pending_confirmation` (caller creates / advances to
 * `pending_confirmation`) or `cancelled` (caller leaves the
 * settlement alone). The only path to `completed` is via the
 * `ConfirmSettlementUseCase`, which the receiver invokes explicitly
 * (Phase 6 Track 1).
 *
 * ── Privacy invariant ──
 *
 * The deep-link URI contains the full payee VPA in plaintext
 * (required by the UPI spec for routing), but:
 *   - The URI is NOT logged (analytics redactor strips `upi://` URIs).
 *   - The QR code contains ONLY the URI (no metadata, no group data,
 *     no access tokens).
 *   - The shareable message contains the MASKED VPA, not the full
 *     VPA, except inside the UPI URI itself which is required.
 */

export * from './upi-vpa-validator';
export * from './upi-deep-link-builder';
export * from './upi-qr-generator';
export * from './payment-request-sharing';
export * from './upi-return-handler';
