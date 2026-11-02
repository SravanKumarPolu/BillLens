/**
 * Pure utility functions shared across layers.
 *
 * Rules:
 * - No imports from React, React Native, Expo, Supabase, or SQLite.
 * - No side effects beyond what's documented.
 * - Each function must be independently testable.
 */

/**
 * Assert that a value is not null/undefined. Throws with a descriptive name
 * if the assertion fails.
 *
 * @example
 *   const user = assertDefined(maybeUser, 'user');
 */
export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be defined, got ${String(value)}`);
  }
  return value;
}

/**
 * Current time as an ISO 8601 string. Centralized so tests can mock a single
 * function instead of patching `Date` globally.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Clamp a number to the inclusive [min, max] range.
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error(`clamp: min (${min}) must be <= max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Type guard: is the value a non-null, non-undefined, non-empty string?
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Returns a deterministic hash of a string for use as a fingerprint.
 * Uses FNV-1a 32-bit. Not cryptographic — do NOT use for security.
 */
export function fingerprintString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}
