/**
 * Deep link parser for `billlens://group/join/{token}` URLs.
 *
 * Phase 3 Prompt 26.
 *
 * The app registers a single custom scheme (`billlens://`) and uses path-
 * based routing. The only deep link that ships in Phase 3 is the group
 * join link, which carries a hex invite token in the URL path.
 *
 * SECURITY: this parser deliberately does NOT extract query parameters
 * other than the token. Private group data (member lists, balances,
 * expense history) is NEVER encoded in the deep link — only the token
 * is. The receiver resolves group metadata by calling the validate-invite
 * use case after parsing.
 *
 * The parser is pure: it does not perform any network or DB lookups.
 * Callers feed the resulting token (if any) into the validate-invite use
 * case to determine whether the invite is still usable.
 */

import { INVITE_TOKEN_REGEX, MIN_INVITE_TOKEN_LENGTH } from '@domain/entities/group-invite';

export const DEEP_LINK_SCHEME = 'billlens';
export const DEEP_LINK_JOIN_HOST = 'group';
export const DEEP_LINK_JOIN_PATH_SEGMENT = 'join';

/**
 * Result of attempting to parse a deep link.
 *
 *   - `ok`       → a valid token was extracted.
 *   - `not_a_join_link` → URL is well-formed but not a group-join link.
 *   - `invalid_url` → URL could not be parsed at all.
 *   - `invalid_token` → URL is a join link but the token segment is
 *      malformed (too short, non-hex, empty, etc.).
 */
export type DeepLinkParseResult =
  | { readonly kind: 'ok'; readonly token: string }
  | { readonly kind: 'not_a_join_link' }
  | { readonly kind: 'invalid_url' }
  | { readonly kind: 'invalid_token'; readonly reason: string };

/**
 * Build a deep link URL for an invite token.
 *
 *   buildJoinDeepLink('abcd1234…') → 'billlens://group/join/abcd1234…'
 *
 * The resulting URL can be encoded as a QR code or shared via any
 * out-of-band channel. The receiver parses it with {@link parseJoinDeepLink}.
 */
export function buildJoinDeepLink(token: string): string {
  if (!token) {
    throw new Error('buildJoinDeepLink: token must not be empty');
  }
  return `${DEEP_LINK_SCHEME}://${DEEP_LINK_JOIN_HOST}/${DEEP_LINK_JOIN_PATH_SEGMENT}/${token}`;
}

/**
 * Parse a deep link URL and extract the invite token, if present.
 *
 * Accepted shapes:
 *
 *   - `billlens://group/join/{token}`
 *   - `billlens:///group/join/{token}`  (three slashes — some platforms emit these)
 *   - `https://billlens.app/join/{token}`      (fallback for non-registered platforms)
 *   - `https://billlens.app/join?token={token}`
 *   - `billlens://group/join/{token}?referrer=qr`  (query stripped)
 *
 * The parser never throws. On any failure it returns one of the
 * non-`ok` discriminated variants so the caller can render an
 * appropriate UI without a try/catch.
 */
export function parseJoinDeepLink(raw: string): DeepLinkParseResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { kind: 'invalid_url' };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: 'invalid_url' };
  }

  // Custom-scheme form: billlens://group/join/{token}
  const customSchemeMatch = trimmed.match(
    new RegExp(
      `^${DEEP_LINK_SCHEME}:/+${DEEP_LINK_JOIN_HOST}/${DEEP_LINK_JOIN_PATH_SEGMENT}/([^/?#]+)`,
      'i',
    ),
  );
  if (customSchemeMatch && customSchemeMatch[1]) {
    return validateToken(customSchemeMatch[1]);
  }

  // HTTPS fallback form: https://billlens.app/join/{token}
  const httpsPathMatch = trimmed.match(
    /^https?:\/\/billlens\.app\/join\/([^/?#]+)/i,
  );
  if (httpsPathMatch && httpsPathMatch[1]) {
    return validateToken(httpsPathMatch[1]);
  }

  // HTTPS query form: https://billlens.app/join?token=...
  const httpsQueryMatch = trimmed.match(/[?&]token=([^&#]+)/i);
  if (httpsQueryMatch && httpsQueryMatch[1]) {
    try {
      const decoded = decodeURIComponent(httpsQueryMatch[1]);
      return validateToken(decoded);
    } catch {
      return validateToken(httpsQueryMatch[1]);
    }
  }

  // Raw bare token (no scheme): accept only if it matches the hex token regex
  // AND no scheme separator (`://`) is present. This is the "paste a token"
  // fallback for users who don't have a full URL.
  if (!trimmed.includes('://') && INVITE_TOKEN_REGEX.test(trimmed)) {
    return validateToken(trimmed);
  }

  // Any other URL is well-formed but not a join link (could be a different
  // app route in future). Let the caller decide what to do.
  if (trimmed.includes('://') || trimmed.startsWith('http')) {
    return { kind: 'not_a_join_link' };
  }

  return { kind: 'invalid_url' };
}

function validateToken(token: string): DeepLinkParseResult {
  if (token.length === 0) {
    return { kind: 'invalid_token', reason: 'Token segment is empty' };
  }
  if (token.length < MIN_INVITE_TOKEN_LENGTH) {
    return {
      kind: 'invalid_token',
      reason: `Token must be at least ${MIN_INVITE_TOKEN_LENGTH} hex characters`,
    };
  }
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return {
      kind: 'invalid_token',
      reason: 'Token must be hexadecimal characters (a-f, 0-9)',
    };
  }
  return { kind: 'ok', token };
}
