import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_ROTATION_INTERVAL_DAYS,
  MS_PER_DAY,
  SECRET_TYPES,
  STUB_SECRET_HASHER,
  computeRotationSchedule,
  createRotationRecord,
  isRotationDue,
  isSecretType,
  nextRotationDate,
  rotationsDueWithin,
  type SecretRotationRecord,
} from '../secret-rotation';

const NOW = '2025-01-01T00:00:00.000Z';

describe('secret-rotation', () => {
  describe('SECRET_TYPES + DEFAULT_ROTATION_INTERVAL_DAYS', () => {
    it('exposes 6 secret types', () => {
      expect(SECRET_TYPES).toHaveLength(6);
      expect(SECRET_TYPES).toEqual([
        'service_role',
        'anon_key',
        'oauth_secret',
        'ocr_api_key',
        'notification_cert',
        'signing_key',
      ]);
    });

    it('sets service_role default to 90 days', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.service_role).toBe(90);
    });

    it('sets anon_key default to 180 days', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.anon_key).toBe(180);
    });

    it('sets oauth_secret default to 365 days', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.oauth_secret).toBe(365);
    });

    it('sets ocr_api_key default to 90 days', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.ocr_api_key).toBe(90);
    });

    it('sets notification_cert default to 365 days', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.notification_cert).toBe(365);
    });

    it('sets signing_key default to 730 days (2 years)', () => {
      expect(DEFAULT_ROTATION_INTERVAL_DAYS.signing_key).toBe(730);
    });

    it('isSecretType accepts known types', () => {
      for (const t of SECRET_TYPES) {
        expect(isSecretType(t)).toBe(true);
      }
    });

    it('isSecretType rejects unknown values', () => {
      expect(isSecretType('random_key')).toBe(false);
      expect(isSecretType(42)).toBe(false);
      expect(isSecretType(null)).toBe(false);
    });

    it('MS_PER_DAY is exactly 86_400_000 ms', () => {
      expect(MS_PER_DAY).toBe(86_400_000);
    });
  });

  describe('STUB_SECRET_HASHER', () => {
    it('returns a 64-hex-char string', () => {
      const h = STUB_SECRET_HASHER('my-secret');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same input', () => {
      expect(STUB_SECRET_HASHER('abc')).toBe(STUB_SECRET_HASHER('abc'));
    });

    it('returns different hashes for different inputs', () => {
      expect(STUB_SECRET_HASHER('abc')).not.toBe(STUB_SECRET_HASHER('abd'));
    });

    it('throws on non-string input', () => {
      expect(() => STUB_SECRET_HASHER(null as unknown as string)).toThrow();
    });
  });

  describe('createRotationRecord', () => {
    it('hashes the raw secret and stores ONLY the hash', () => {
      const record = createRotationRecord({
        type: 'service_role',
        rawSecret: 'super-secret-value',
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      // The record MUST NOT contain the raw secret.
      expect(JSON.stringify(record)).not.toContain('super-secret-value');
      expect(record.hash).toBe(STUB_SECRET_HASHER('super-secret-value'));
    });

    it('uses the default interval when none is provided', () => {
      const record = createRotationRecord({
        type: 'service_role',
        rawSecret: 'x',
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      expect(record.intervalDays).toBe(90);
    });

    it('honours a custom interval', () => {
      const record = createRotationRecord({
        type: 'service_role',
        rawSecret: 'x',
        rotatedAt: NOW,
        intervalDays: 30,
        hasher: STUB_SECRET_HASHER,
      });
      expect(record.intervalDays).toBe(30);
    });

    it('preserves notes when provided', () => {
      const record = createRotationRecord({
        type: 'anon_key',
        rawSecret: 'x',
        rotatedAt: NOW,
        notes: 'rotated due to leak',
        hasher: STUB_SECRET_HASHER,
      });
      expect(record.notes).toBe('rotated due to leak');
    });

    it('throws for an unknown secret type', () => {
      expect(() =>
        createRotationRecord({
          type: 'unknown' as never,
          rawSecret: 'x',
          rotatedAt: NOW,
          hasher: STUB_SECRET_HASHER,
        }),
      ).toThrow();
    });

    it('throws for an empty raw secret', () => {
      expect(() =>
        createRotationRecord({
          type: 'service_role',
          rawSecret: '',
          rotatedAt: NOW,
          hasher: STUB_SECRET_HASHER,
        }),
      ).toThrow();
    });

    it('throws for an invalid rotatedAt', () => {
      expect(() =>
        createRotationRecord({
          type: 'service_role',
          rawSecret: 'x',
          rotatedAt: 'not-a-date',
          hasher: STUB_SECRET_HASHER,
        }),
      ).toThrow();
    });

    it('throws for a non-positive intervalDays', () => {
      expect(() =>
        createRotationRecord({
          type: 'service_role',
          rawSecret: 'x',
          rotatedAt: NOW,
          intervalDays: 0,
          hasher: STUB_SECRET_HASHER,
        }),
      ).toThrow();
      expect(() =>
        createRotationRecord({
          type: 'service_role',
          rawSecret: 'x',
          rotatedAt: NOW,
          intervalDays: -1,
          hasher: STUB_SECRET_HASHER,
        }),
      ).toThrow();
    });

    it('throws when hasher is not a function', () => {
      expect(() =>
        createRotationRecord({
          type: 'service_role',
          rawSecret: 'x',
          rotatedAt: NOW,
          hasher: null as unknown as typeof STUB_SECRET_HASHER,
        }),
      ).toThrow();
    });

    it('returns a frozen record', () => {
      const record = createRotationRecord({
        type: 'service_role',
        rawSecret: 'x',
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      expect(Object.isFrozen(record)).toBe(true);
    });
  });

  describe('isRotationDue', () => {
    it('returns true when no record exists', () => {
      expect(isRotationDue(null, NOW)).toBe(true);
    });

    it('returns false when the interval has not elapsed', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 30 days later — not due.
      const later = new Date(Date.parse(NOW) + 30 * MS_PER_DAY).toISOString();
      expect(isRotationDue(record, later)).toBe(false);
    });

    it('returns true when the interval has elapsed', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      const later = new Date(Date.parse(NOW) + 91 * MS_PER_DAY).toISOString();
      expect(isRotationDue(record, later)).toBe(true);
    });

    it('returns true within the grace window', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 88 days later + 5 day grace → 88 + 5 = 93 >= 90 → due.
      const later = new Date(Date.parse(NOW) + 88 * MS_PER_DAY).toISOString();
      expect(isRotationDue(record, later, 5)).toBe(true);
    });

    it('returns false outside the grace window', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 80 days later + 5 day grace → 85 < 90 → not due.
      const later = new Date(Date.parse(NOW) + 80 * MS_PER_DAY).toISOString();
      expect(isRotationDue(record, later, 5)).toBe(false);
    });

    it('rejects a negative graceDays', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      expect(() => isRotationDue(record, NOW, -1)).toThrow();
    });
  });

  describe('nextRotationDate', () => {
    it('returns lastRotatedAt + intervalDays', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      const expected = new Date(Date.parse(NOW) + 90 * MS_PER_DAY).toISOString();
      expect(nextRotationDate(record)).toBe(expected);
    });

    it('throws on an invalid lastRotatedAt', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: 'not-a-date',
        intervalDays: 90,
      };
      expect(() => nextRotationDate(record)).toThrow();
    });
  });

  describe('computeRotationSchedule', () => {
    it('includes an entry for every known secret type, even those without records', () => {
      const schedule = computeRotationSchedule([], NOW);
      expect(schedule).toHaveLength(6);
      for (const t of SECRET_TYPES) {
        expect(schedule.some((r) => r.type === t)).toBe(true);
      }
    });

    it('marks secrets with no record as overdue', () => {
      const schedule = computeRotationSchedule([], NOW);
      for (const entry of schedule) {
        expect(entry.overdue).toBe(true);
        expect(entry.lastRotatedAt).toBe('');
      }
    });

    it('computes daysUntilDue for an existing record', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 30 days after NOW → 60 days until due.
      const later = new Date(Date.parse(NOW) + 30 * MS_PER_DAY).toISOString();
      const schedule = computeRotationSchedule([record], later);
      const entry = schedule.find((r) => r.type === 'service_role');
      expect(entry).toBeDefined();
      expect(entry!.daysUntilDue).toBe(60);
      expect(entry!.overdue).toBe(false);
    });

    it('sorts entries by dueAt ascending', () => {
      const soon: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      const later: SecretRotationRecord = {
        type: 'signing_key',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 730,
      };
      const schedule = computeRotationSchedule([soon, later], NOW);
      const types = schedule.map((r) => r.type);
      expect(types.indexOf('service_role')).toBeLessThan(types.indexOf('signing_key'));
    });

    it('rejects an invalid nowIso', () => {
      expect(() => computeRotationSchedule([], 'not-a-date')).toThrow();
    });

    it('rejects a negative lookaheadDays', () => {
      expect(() => computeRotationSchedule([], NOW, -1)).toThrow();
    });

    it('returns a frozen array', () => {
      const schedule = computeRotationSchedule([], NOW);
      expect(Object.isFrozen(schedule)).toBe(true);
    });
  });

  describe('rotationsDueWithin', () => {
    it('includes overdue entries', () => {
      const schedule = computeRotationSchedule([], NOW);
      const due = rotationsDueWithin(schedule, 30);
      expect(due.length).toBe(6); // all secret types are overdue with no record
    });

    it('includes entries due within the lookahead window', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 75 days after NOW → 15 days until due → within 30-day lookahead.
      const later = new Date(Date.parse(NOW) + 75 * MS_PER_DAY).toISOString();
      const schedule = computeRotationSchedule([record], later);
      const due = rotationsDueWithin(schedule, 30);
      expect(due.some((r) => r.type === 'service_role')).toBe(true);
    });

    it('excludes entries beyond the lookahead window', () => {
      const record: SecretRotationRecord = {
        type: 'service_role',
        hash: 'h',
        lastRotatedAt: NOW,
        intervalDays: 90,
      };
      // 0 days after NOW → 90 days until due → outside 30-day lookahead.
      const schedule = computeRotationSchedule([record], NOW);
      const due = rotationsDueWithin(schedule, 30);
      expect(due.some((r) => r.type === 'service_role')).toBe(false);
    });

    it('rejects a negative lookaheadDays', () => {
      const schedule = computeRotationSchedule([], NOW);
      expect(() => rotationsDueWithin(schedule, -1)).toThrow();
    });
  });

  describe('privacy — raw secrets never persisted', () => {
    it('the record only contains the hash, never the raw secret', () => {
      const rawSecret = 'SUP3R-SECRET-VALUE-FOR-TESTING';
      const record = createRotationRecord({
        type: 'oauth_secret',
        rawSecret,
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      const serialised = JSON.stringify(record);
      expect(serialised).not.toContain(rawSecret);
      // Hash IS present.
      expect(serialised).toContain(record.hash);
    });

    it('different raw secrets produce different hashes', () => {
      const a = createRotationRecord({
        type: 'service_role',
        rawSecret: 'secret-a',
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      const b = createRotationRecord({
        type: 'service_role',
        rawSecret: 'secret-b',
        rotatedAt: NOW,
        hasher: STUB_SECRET_HASHER,
      });
      expect(a.hash).not.toBe(b.hash);
    });
  });
});
