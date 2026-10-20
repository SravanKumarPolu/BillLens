/**
 * UPI-assisted settlement application layer — Phase 6 Track 4.
 *
 * Use cases that wrap the domain UPI modules (VPA validator,
 * deep-link builder, QR generator, payment-request sharing,
 * return-to-app handler).
 *
 * ── Safety invariant (enforced by construction) ──
 *
 * No use case in this layer marks a settlement as `completed`. The
 * return-handler use case advances to `pending_confirmation` (via
 * `RecordSettlementUseCase` from Track 1) when the user returns
 * from the UPI app; the receiver must then confirm explicitly via
 * `ConfirmSettlementUseCase` (Track 1).
 *
 * ── Privacy invariant ──
 *
 * The full VPA is decrypted from the encrypted store only at the
 * moment the deep link is built, held in memory for the duration of
 * the build, then discarded. The decrypted VPA is NOT logged, NOT
 * included in audit entries, NOT stored anywhere.
 */

export * from './save-upi-payment-handle.usecase';
export * from './generate-upi-deep-link.usecase';
export * from './generate-upi-qr.usecase';
export * from './share-payment-request.usecase';
export * from './handle-upi-return.usecase';
