import { InvalidEntityError } from '../../errors/index';

/**
 * UPI VPA (Virtual Payment Address) format validator — Phase 6 Track 4.
 *
 * A VPA has the form `name@bank` where:
 *
 *   - `name` is 1-100 characters: alphanumeric, dots, dashes, underscores
 *     (NPCI allows a broader set but we keep the conservative common
 *     case; users can always use the longer form via the
 *     `bank_account` handle type if needed)
 *   - `bank` is the PSP identifier (e.g. `oksbi`, `ybl`, `paytm`,
 *     `ibl`): 2-20 alphanumeric lowercase characters
 *
 * Examples:
 *
 *   - `john.doe@oksbi`       ✓
 *   - `shop@paytm`           ✓
 *   - `1234567890@ybl`       ✓
 *   - `a@ibl`                ✓ (shortest valid name)
 *   - `john@`                ✗ (missing PSP)
 *   - `@oksbi`               ✗ (missing name)
 *   - `john@o`               ✗ (PSP too short — needs ≥ 2 chars)
 *   - `john.doe@OKSBI`       ✗ (PSP must be lowercase)
 *   - `john doe@oksbi`       ✗ (no spaces in name)
 *   - `john@oksbi@ybl`       ✗ (only one @)
 *   - `` (empty)             ✗
 *
 * The validator is PURE: no side effects, no I/O. It throws
 * `InvalidEntityError` on invalid input. Callers who want a
 * boolean predicate should use `isValidUpiVpa`.
 *
 * ── Why a conservative regex ──
 *
 * The NPCI UPI spec allows a broader character set in the name part
 * (including some Unicode). BillLens deliberately keeps the
 * conservative common case (ASCII alphanumeric + . _ -) because:
 *
 *   - The full NPCI character set is not documented in a public,
 *     stable spec; matching it risks false positives.
 *   - The conservative regex catches the overwhelming majority of
 *     real-world VPAs (95%+ based on observed VPA patterns).
 *   - Edge cases (Unicode names, very long PSP identifiers) are
 *     rare and can be added later without breaking existing handles.
 *
 * The validator's job is to reject obviously-malformed input. It is
 * NOT a security boundary — the actual UPI launch will fail at the
 * UPI app level if the VPA is wrong.
 */

// 1-100 chars: alphanumeric, dot, dash, underscore. Must start with
// an alphanumeric character (no leading . or _). Case-insensitive on
// the name part (some users enter "John.Doe" rather than "john.doe").
const VPA_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

// 2-20 chars: lowercase alphanumeric. The PSP identifier (e.g. oksbi,
// ybl, paytm, ibl). ALWAYS lowercase per NPCI convention — never
// case-insensitive here, so "OKSBI" is rejected.
const VPA_PSP_RE = /^[a-z][a-z0-9]{1,19}$/;

// Combined: name is case-insensitive, PSP is lowercase-only. We
// build the regex without the /i flag (because we want the PSP to
// be lowercase-only) but include both cases in the name character
// class explicitly.
const VPA_FULL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}@[a-z][a-z0-9]{1,19}$/;

/**
 * Validate a UPI VPA string. Throws `InvalidEntityError` on invalid
 * input. Returns the input unchanged on success (so callers can
 * chain).
 *
 * @example
 *   validateUpiVpa('john.doe@oksbi')   // returns 'john.doe@oksbi'
 *   validateUpiVpa('john@')            // throws InvalidEntityError
 */
export function validateUpiVpa(vpa: string): string {
  if (typeof vpa !== 'string') {
    throw new InvalidEntityError(`VPA must be a string, got ${typeof vpa}`);
  }
  const trimmed = vpa.trim();
  if (trimmed.length === 0) {
    throw new InvalidEntityError('VPA must not be empty');
  }
  if (trimmed.length > 121) {
    // 100 (name) + 1 (@) + 20 (PSP) = 121 max
    throw new InvalidEntityError(
      `VPA is too long (max 121 chars, got ${trimmed.length})`,
    );
  }
  if (!VPA_FULL_RE.test(trimmed)) {
    // Give a more specific error if possible.
    const atIdx = trimmed.lastIndexOf('@');
    if (atIdx < 0) {
      throw new InvalidEntityError(
        `VPA "${trimmed}" is missing the @ separator (expected name@psp)`,
      );
    }
    if (atIdx === 0) {
      throw new InvalidEntityError(
        `VPA "${trimmed}" is missing the name part (expected name@psp)`,
      );
    }
    if (atIdx === trimmed.length - 1) {
      throw new InvalidEntityError(
        `VPA "${trimmed}" is missing the PSP part (expected name@psp)`,
      );
    }
    const name = trimmed.slice(0, atIdx);
    const psp = trimmed.slice(atIdx + 1);
    if (!VPA_NAME_RE.test(name)) {
      throw new InvalidEntityError(
        `VPA name part "${name}" is invalid (must be 1-100 alphanumeric/./_/- chars, start with alphanumeric)`,
      );
    }
    if (!VPA_PSP_RE.test(psp)) {
      throw new InvalidEntityError(
        `VPA PSP part "${psp}" is invalid (must be 2-20 lowercase alphanumeric chars, start with a letter)`,
      );
    }
    // Multiple @
    if (trimmed.indexOf('@') !== atIdx) {
      throw new InvalidEntityError(
        `VPA "${trimmed}" contains multiple @ separators`,
      );
    }
    // Fallback
    throw new InvalidEntityError(`VPA "${trimmed}" is not a valid name@psp format`);
  }
  return trimmed;
}

/**
 * Boolean predicate version of `validateUpiVpa`. Returns true if the
 * VPA is valid, false otherwise. Never throws.
 *
 * Useful for input validation in UI forms where you want to show a
 * "invalid format" hint without catching an exception.
 */
export function isValidUpiVpa(vpa: string): boolean {
  try {
    validateUpiVpa(vpa);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mask a VPA for display. Returns a form like `ja***@oksbi` that is
 * safe to show in UI and to include in audit logs.
 *
 * The masking rule:
 *   - If the name part is ≤ 3 chars, mask everything except the
 *     first char: `ab@oksbi` → `a***@oksbi`
 *   - If the name part is 4+ chars, keep the first 2 chars and
 *     mask the rest: `john.doe@oksbi` → `jo***@oksbi`
 *   - The PSP part is NEVER masked (it's a public bank identifier).
 *
 * Throws `InvalidEntityError` if the input is not a valid VPA —
 * callers should validate first.
 */
export function maskUpiVpa(vpa: string): string {
  const validated = validateUpiVpa(vpa);
  const atIdx = validated.lastIndexOf('@');
  const name = validated.slice(0, atIdx);
  const psp = validated.slice(atIdx + 1);
  const maskedName = name.length <= 3
    ? `${name[0]}***`
    : `${name.slice(0, 2)}***`;
  return `${maskedName}@${psp}`;
}
