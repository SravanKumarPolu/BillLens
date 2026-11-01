/**
 * Base class for all BillLens domain errors.
 *
 * Domain errors are thrown by value-object constructors, entity factories,
 * and domain services when an invariant is violated. They are NOT thrown
 * for infrastructure failures (use `InfrastructureError` in
 * `src/infrastructure/`) or for UI/validation issues (use Zod in
 * presentation).
 *
 * Each domain error carries a stable `code` so callers can switch on it
 * without parsing message strings. The `code` is part of the public API:
 *   - It is referenced in tests.
 *   - It is referenced in audit logs.
 *   - It MUST NOT change once shipped.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly layer = 'domain' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
    // Restore prototype chain — required for `instanceof` to work on
    // subclasses of Error in TypeScript targeting ES2015+.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
