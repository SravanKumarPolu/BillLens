/**
 * API versioning tests.
 *
 * Phase 10 Prompt 94.
 */

import { describe, expect, it } from '@jest/globals';

import {
  VERSION_LIFECYCLES,
  getDeprecationHeaders,
  getVersionResponseStatus,
  getVersionStatus,
  isVersionUsable,
} from '../api-versioning';

describe('getVersionStatus', () => {
  it('returns "active" for v1 before deprecatedAt', () => {
    expect(getVersionStatus('v1', '2026-03-01T00:00:00.000Z')).toBe('active');
  });

  it('returns "deprecated" for v1 after deprecatedAt, before sunsetAt', () => {
    expect(getVersionStatus('v1', '2026-09-01T00:00:00.000Z')).toBe('deprecated');
  });

  it('returns "sunset" for v1 after sunsetAt, before retiredAt', () => {
    expect(getVersionStatus('v1', '2026-12-15T00:00:00.000Z')).toBe('sunset');
  });

  it('returns "retired" for v1 after retiredAt', () => {
    expect(getVersionStatus('v1', '2027-06-01T00:00:00.000Z')).toBe('retired');
  });

  it('returns "active" for v2 (currently active)', () => {
    expect(getVersionStatus('v2', '2026-09-01T00:00:00.000Z')).toBe('active');
  });

  it('returns "deprecated" at the exact deprecatedAt instant', () => {
    expect(getVersionStatus('v1', '2026-07-01T00:00:00.000Z')).toBe('deprecated');
  });

  it('returns "sunset" at the exact sunsetAt instant', () => {
    expect(getVersionStatus('v1', '2026-12-01T00:00:00.000Z')).toBe('sunset');
  });

  it('returns "retired" at the exact retiredAt instant', () => {
    expect(getVersionStatus('v1', '2027-01-01T00:00:00.000Z')).toBe('retired');
  });

  it('throws on an invalid now', () => {
    expect(() => getVersionStatus('v1', 'not-a-date')).toThrow(
      'now must be a valid ISO date-time',
    );
  });
});

describe('isVersionUsable', () => {
  it('returns true for active version', () => {
    expect(isVersionUsable('v2', '2026-09-01T00:00:00.000Z')).toBe(true);
  });

  it('returns true for deprecated version', () => {
    expect(isVersionUsable('v1', '2026-09-01T00:00:00.000Z')).toBe(true);
  });

  it('returns true for sunset version (still works, with 299)', () => {
    expect(isVersionUsable('v1', '2026-12-15T00:00:00.000Z')).toBe(true);
  });

  it('returns false for retired version (410 Gone)', () => {
    expect(isVersionUsable('v1', '2027-06-01T00:00:00.000Z')).toBe(false);
  });
});

describe('getDeprecationHeaders', () => {
  it('returns no headers for an active version', () => {
    const headers = getDeprecationHeaders('v2', '2026-09-01T00:00:00.000Z');
    expect(headers).toEqual({});
  });

  it('returns Deprecation + Sunset headers for a deprecated version', () => {
    const headers = getDeprecationHeaders('v1', '2026-09-01T00:00:00.000Z');
    expect(headers['Deprecation']).toBe('true');
    expect(headers['Sunset']).toBeDefined();
    expect(headers['Link']).toBeUndefined();
  });

  it('returns Deprecation + Sunset + Link headers for a sunset version', () => {
    const headers = getDeprecationHeaders('v1', '2026-12-15T00:00:00.000Z');
    expect(headers['Deprecation']).toBe('true');
    expect(headers['Sunset']).toBeDefined();
    expect(headers['Link']).toContain('rel="deprecation"');
  });

  it('returns only the Link header for a retired version', () => {
    const headers = getDeprecationHeaders('v1', '2027-06-01T00:00:00.000Z');
    expect(headers['Link']).toContain('rel="deprecation"');
    expect(headers['Deprecation']).toBeUndefined();
    expect(headers['Sunset']).toBeUndefined();
  });

  it('formats the Sunset header as an RFC 1123 date by default', () => {
    const headers = getDeprecationHeaders('v1', '2026-09-01T00:00:00.000Z');
    // retiredAt is 2027-01-01T00:00:00.000Z → 'Fri, 01 Jan 2027 00:00:00 GMT'
    expect(headers['Sunset']).toMatch(/GMT$/);
    expect(headers['Sunset']).toContain('01 Jan 2027');
  });

  it('uses the injected formatDate function when provided', () => {
    const headers = getDeprecationHeaders(
      'v1',
      '2026-09-01T00:00:00.000Z',
      () => 'CUSTOM-DATE',
    );
    expect(headers['Sunset']).toBe('CUSTOM-DATE');
  });

  it('returns a frozen object', () => {
    const headers = getDeprecationHeaders('v1', '2026-09-01T00:00:00.000Z');
    expect(Object.isFrozen(headers)).toBe(true);
  });
});

describe('getVersionResponseStatus', () => {
  it('returns 200 for active version', () => {
    expect(getVersionResponseStatus('v2', '2026-09-01T00:00:00.000Z')).toBe(200);
  });

  it('returns 200 for deprecated version', () => {
    expect(getVersionResponseStatus('v1', '2026-09-01T00:00:00.000Z')).toBe(200);
  });

  it('returns 299 for sunset version', () => {
    expect(getVersionResponseStatus('v1', '2026-12-15T00:00:00.000Z')).toBe(299);
  });

  it('returns 410 for retired version', () => {
    expect(getVersionResponseStatus('v1', '2027-06-01T00:00:00.000Z')).toBe(410);
  });
});

describe('VERSION_LIFECYCLES registry', () => {
  it('contains both v1 and v2', () => {
    expect(VERSION_LIFECYCLES.v1).toBeDefined();
    expect(VERSION_LIFECYCLES.v2).toBeDefined();
  });

  it('v1 has deprecatedAt, sunsetAt, retiredAt set', () => {
    expect(VERSION_LIFECYCLES.v1.deprecatedAt).toBeDefined();
    expect(VERSION_LIFECYCLES.v1.sunsetAt).toBeDefined();
    expect(VERSION_LIFECYCLES.v1.retiredAt).toBeDefined();
  });

  it('v2 has NO deprecatedAt (it is currently active)', () => {
    expect(VERSION_LIFECYCLES.v2.deprecatedAt).toBeUndefined();
    expect(VERSION_LIFECYCLES.v2.sunsetAt).toBeUndefined();
    expect(VERSION_LIFECYCLES.v2.retiredAt).toBeUndefined();
  });

  it('exposes an upgradeGuideUrl for both versions', () => {
    expect(VERSION_LIFECYCLES.v1.upgradeGuideUrl).toMatch(/^https?:\/\//);
    expect(VERSION_LIFECYCLES.v2.upgradeGuideUrl).toMatch(/^https?:\/\//);
  });
});
