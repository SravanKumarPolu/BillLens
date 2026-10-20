/**
 * API versioning strategy — active / deprecated / sunset / retired.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * The BillLens public API follows a strict deprecation policy:
 *
 *   1. **active** — the version is fully supported. No special headers.
 *   2. **deprecated** — the version still works, but every response
 *      includes a `Deprecation: true` header and a `Sunset: <date>`
 *      header announcing the future retirement date. Clients should
 *      migrate.
 *   3. **sunset** — the version returns `299 Too Many Requests` (the
 *      official "miscellaneous persistent warning" status) plus the
 *      `Sunset` header. Requests still succeed, but the warning makes
 *      it impossible to miss.
 *   4. **retired** — the version returns `410 Gone` with a `Link`
 *      header pointing to the upgrade guide. Requests to retired
 *      versions are NOT processed.
 *
 * The lifecycle is enforced by the API gateway BEFORE routing to a
 * controller — this module only computes the headers and status.
 *
 * This module is PURE: it computes decisions from inputs; no I/O.
 *
 * See `docs/api-developer-platform.md`.
 */

import type { ApiVersion } from './api-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VersionStatus = 'active' | 'deprecated' | 'sunset' | 'retired';

export interface VersionLifecycle {
  readonly version: ApiVersion;
  readonly status: VersionStatus;
  readonly releasedAt: string;
  readonly deprecatedAt?: string;
  /**
   * When this date is reached, the gateway starts emitting a `Sunset`
   * HTTP header and returns `299` status. The API still works.
   */
  readonly sunsetAt?: string;
  /**
   * When this date is reached, the gateway returns `410 Gone` for all
   * requests to this version.
   */
  readonly retiredAt?: string;
  /** Stable URL of the upgrade guide. Returned in the `Link` header. */
  readonly upgradeGuideUrl?: string;
}

// ---------------------------------------------------------------------------
// Lifecycle registry
// ---------------------------------------------------------------------------

/**
 * Canonical version lifecycle registry.
 *
 * v1 was released 2026-01-01, deprecated 2026-07-01, sunsets 2026-12-01,
 * retires 2027-01-01. v2 was released 2026-07-01 and is currently active.
 *
 * Tests use `now` values in the future to exercise each phase.
 */
export const VERSION_LIFECYCLES: Readonly<Record<ApiVersion, VersionLifecycle>> =
  Object.freeze({
    v1: Object.freeze({
      version: 'v1',
      status: 'deprecated',
      releasedAt: '2026-01-01T00:00:00.000Z',
      deprecatedAt: '2026-07-01T00:00:00.000Z',
      sunsetAt: '2026-12-01T00:00:00.000Z',
      retiredAt: '2027-01-01T00:00:00.000Z',
      upgradeGuideUrl: 'https://developers.billlens.app/docs/migrating-to-v2',
    }),
    v2: Object.freeze({
      version: 'v2',
      status: 'active',
      releasedAt: '2026-07-01T00:00:00.000Z',
      upgradeGuideUrl: 'https://developers.billlens.app/docs/v2',
    }),
  });

// ---------------------------------------------------------------------------
// Status computation
// ---------------------------------------------------------------------------

/**
 * Returns the current status of `version` as of `now`.
 *
 * If the lifecycle registry declares a fixed `status`, that status is
 * honoured ONLY when the corresponding lifecycle date has been reached.
 * For example, v1's `status` is `deprecated`, but if `now` is before
 * `releasedAt`, the function still returns `active` (a version cannot
 * be deprecated before it is released).
 *
 * If `now` is after `retiredAt`, the function returns `retired`.
 * If `now` is after `sunsetAt` (but before `retiredAt`), returns `sunset`.
 * If `now` is after `deprecatedAt` (but before `sunsetAt`), returns `deprecated`.
 * Otherwise returns `active`.
 */
export function getVersionStatus(
  version: ApiVersion,
  now: string,
): VersionStatus {
  const lifecycle = VERSION_LIFECYCLES[version];
  if (!lifecycle) {
    throw new Error(`Unknown API version: ${version}`);
  }
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error('now must be a valid ISO date-time');
  }

  if (lifecycle.retiredAt !== undefined && nowMs >= Date.parse(lifecycle.retiredAt)) {
    return 'retired';
  }
  if (lifecycle.sunsetAt !== undefined && nowMs >= Date.parse(lifecycle.sunsetAt)) {
    return 'sunset';
  }
  if (
    lifecycle.deprecatedAt !== undefined &&
    nowMs >= Date.parse(lifecycle.deprecatedAt)
  ) {
    return 'deprecated';
  }
  return 'active';
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Returns the HTTP headers the gateway should attach to every response
 * for the given version.
 *
 *   - active → `{}` (no special headers)
 *   - deprecated → `{ Deprecation: 'true', Sunset: '<RFC1123 date>' }`
 *   - sunset → `{ Deprecation: 'true', Sunset: '<RFC1123 date>',
 *                 Link: '<upgradeGuideUrl>; rel="deprecation"' }`
 *   - retired → `{ Link: '<upgradeGuideUrl>; rel="deprecation"' }`
 *
 * The `Sunset` header is formatted per RFC 7231 (RFC 1123 date format).
 * Tests inject a fixed `formatDate` function so the output is stable.
 */
export function getDeprecationHeaders(
  version: ApiVersion,
  now: string,
  formatDate?: (iso: string) => string,
): Readonly<Record<string, string>> {
  const status = getVersionStatus(version, now);
  const lifecycle = VERSION_LIFECYCLES[version];
  const fmt = formatDate ?? defaultRfc1123Formatter;

  if (status === 'active') {
    return Object.freeze({});
  }
  const headers: Record<string, string> = {};

  if (status === 'deprecated' || status === 'sunset') {
    headers['Deprecation'] = 'true';
    if (lifecycle.retiredAt !== undefined) {
      headers['Sunset'] = fmt(lifecycle.retiredAt);
    }
  }

  if (status === 'sunset' || status === 'retired') {
    if (lifecycle.upgradeGuideUrl !== undefined) {
      headers['Link'] = `${lifecycle.upgradeGuideUrl}; rel="deprecation"`;
    }
  }

  return Object.freeze(headers);
}

/**
 * Default RFC 1123 date formatter — uses `Date.toUTCString()` which
 * produces the correct format for the `Sunset` header.
 *
 *   'Thu, 01 Jan 2027 00:00:00 GMT'
 */
function defaultRfc1123Formatter(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return d.toUTCString();
}

// ---------------------------------------------------------------------------
// Usability
// ---------------------------------------------------------------------------

/**
 * Returns true when the version can still process requests.
 *
 *   - active → true
 *   - deprecated → true (with warning headers)
 *   - sunset → true (with 299 + warning headers)
 *   - retired → false (gateway returns 410 Gone)
 */
export function isVersionUsable(version: ApiVersion, now: string): boolean {
  const status = getVersionStatus(version, now);
  return status !== 'retired';
}

/**
 * Returns the HTTP status code the gateway should use for a request to
 * the given version.
 *
 *   - active → 200 (or whatever the controller returns)
 *   - deprecated → 200 (with Deprecation/Sunset headers)
 *   - sunset → 299 Too Many Requests (the official "miscellaneous
 *              persistent warning" status — the request still succeeds)
 *   - retired → 410 Gone
 *
 * NOTE: The 299 status is unusual but it is the IANA-registered way to
 * signal a successful response with a deprecation warning. Some clients
 * (notably older versions of axios) treat any non-2xx as an error —
 * for those clients, the gateway can be configured to return 200 with
 * the deprecation headers only.
 */
export function getVersionResponseStatus(
  version: ApiVersion,
  now: string,
): number {
  const status = getVersionStatus(version, now);
  switch (status) {
    case 'active':
    case 'deprecated':
      return 200;
    case 'sunset':
      return 299;
    case 'retired':
      return 410;
  }
}
