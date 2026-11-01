/**
 * Application-layer ports for invite-token cryptography.
 *
 * The application layer cannot import `expo-crypto` (architecture boundary),
 * so the create-invite use case depends on these two function-shaped ports.
 * The composition root (in the presentation layer) wires them to
 * `expo-crypto.randomBytes` / `expo-crypto.digestStringAsync` in production
 * and to deterministic functions in tests.
 *
 * SECURITY: the hash function MUST be non-reversible (SHA-256 or stronger).
 * The generator MUST use a cryptographically secure RNG (Node `crypto.randomBytes`,
 * `expo-crypto.randomBytes`, or a WebCrypto polyfill — never `Math.random`).
 *
 * Neither port has a default implementation here. The composition root in
 * the presentation layer is responsible for choosing the production-grade
 * implementation; tests inject deterministic stubs.
 */

export interface GenerateInviteToken {
  /**
   * @returns A 32-char hex string (128 bits of entropy).
   */
  (): string;
}

export interface HashInviteToken {
  /**
   * @param token Plain hex token.
   * @returns Non-reversible hash (e.g. base64(sha256(token))). The output
   *          MUST be deterministic for the same input so lookups succeed.
   */
  (token: string): string;
}
