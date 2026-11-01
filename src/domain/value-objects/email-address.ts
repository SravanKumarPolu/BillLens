import type { Branded } from '@shared-types/index';

import { EmptyValueError, InvalidEntityError } from '../errors/index';

/**
 * Email address. Validated for format (NOT for deliverability — that
 * requires actually sending mail).
 *
 * Format check is intentionally simple: `<local>@<domain>.<tld>` with
 * reasonable character restrictions. Full RFC 5322 compliance is out of
 * scope for an offline-first mobile app.
 */
export type EmailAddress = Branded<string, 'EmailAddress'>;

// Pragmatic email regex — good enough for client-side validation.
// Server-side validation (Supabase Auth) is the source of truth.
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function asEmailAddress(value: string): EmailAddress {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyValueError('Email address must not be empty');
  }
  if (trimmed.length > 254) {
    throw new InvalidEntityError(
      `Email address too long (${trimmed.length} > 254 chars)`,
    );
  }
  if (!EMAIL_RE.test(trimmed)) {
    throw new InvalidEntityError(`Invalid email address: "${trimmed}"`);
  }
  // Normalize to lowercase to prevent case-sensitivity issues.
  return trimmed.toLowerCase() as EmailAddress;
}

export function isEmailAddress(value: unknown): value is EmailAddress {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}
