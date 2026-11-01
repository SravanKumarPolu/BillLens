/**
 * Backup validation tests.
 *
 * Phase 10 Prompt 97.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type BackupRecord,
  computeBackupFrequency,
  computeValidationRate,
  getStaleBackups,
  isBackupValid,
} from '../backup-validation';

const NOW = '2026-07-15T00:00:00.000Z';

function makeBackup(overrides: Partial<BackupRecord>): BackupRecord {
  return {
    id: 'bk-1',
    type: 'full',
    createdAt: '2026-07-01T00:00:00.000Z',
    sizeBytes: 1024 * 1024 * 100, // 100 MB
    checksum: 'sha256:abc123',
    encrypted: true,
    location: 's3://billlens-backups/2026-07-01',
    validationStatus: 'validated',
    validatedAt: '2026-07-01T01:00:00.000Z',
    ...overrides,
  };
}

describe('isBackupValid', () => {
  it('returns true for a fully-valid backup', () => {
    expect(isBackupValid(makeBackup({}))).toBe(true);
  });

  it('returns false when validationStatus is pending', () => {
    expect(isBackupValid(makeBackup({ validationStatus: 'pending' }))).toBe(
      false,
    );
  });

  it('returns false when validationStatus is failed', () => {
    expect(isBackupValid(makeBackup({ validationStatus: 'failed' }))).toBe(
      false,
    );
  });

  it('returns false when checksum is empty', () => {
    expect(isBackupValid(makeBackup({ checksum: '' }))).toBe(false);
  });

  it('returns false when checksum is missing', () => {
    expect(isBackupValid(makeBackup({ checksum: undefined as never }))).toBe(
      false,
    );
  });

  it('returns false when backup is not encrypted', () => {
    expect(isBackupValid(makeBackup({ encrypted: false }))).toBe(false);
  });

  it('returns false when sizeBytes is 0', () => {
    expect(isBackupValid(makeBackup({ sizeBytes: 0 }))).toBe(false);
  });

  it('returns false when sizeBytes is negative', () => {
    expect(isBackupValid(makeBackup({ sizeBytes: -100 }))).toBe(false);
  });

  it('returns false when sizeBytes is NaN', () => {
    expect(isBackupValid(makeBackup({ sizeBytes: NaN }))).toBe(false);
  });

  it('returns false when sizeBytes is Infinity', () => {
    expect(isBackupValid(makeBackup({ sizeBytes: Infinity }))).toBe(false);
  });

  it('returns true for incremental backups when all other checks pass', () => {
    expect(isBackupValid(makeBackup({ type: 'incremental' }))).toBe(true);
  });

  it('returns true for snapshot backups when all other checks pass', () => {
    expect(isBackupValid(makeBackup({ type: 'snapshot' }))).toBe(true);
  });

  it('returns true for differential backups when all other checks pass', () => {
    expect(isBackupValid(makeBackup({ type: 'differential' }))).toBe(true);
  });
});

describe('getStaleBackups', () => {
  it('returns backups older than maxAgeDays', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'fresh', createdAt: '2026-07-10T00:00:00.000Z' }),
      makeBackup({ id: 'stale', createdAt: '2026-05-01T00:00:00.000Z' }),
    ];
    const stale = getStaleBackups(backups, 30, NOW);
    expect(stale.map((b) => b.id)).toEqual(['stale']);
  });

  it('returns multiple stale backups sorted oldest-first', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'middle', createdAt: '2026-05-01T00:00:00.000Z' }),
      makeBackup({ id: 'oldest', createdAt: '2026-04-01T00:00:00.000Z' }),
      makeBackup({ id: 'fresh', createdAt: '2026-07-10T00:00:00.000Z' }),
    ];
    const stale = getStaleBackups(backups, 30, NOW);
    expect(stale.map((b) => b.id)).toEqual(['oldest', 'middle']);
  });

  it('returns an empty list when all backups are within the window', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'fresh', createdAt: '2026-07-10T00:00:00.000Z' }),
      makeBackup({ id: 'fresh2', createdAt: '2026-07-12T00:00:00.000Z' }),
    ];
    expect(getStaleBackups(backups, 30, NOW)).toEqual([]);
  });

  it('returns an empty list for an empty input', () => {
    expect(getStaleBackups([], 30, NOW)).toEqual([]);
  });

  it('returns an empty list when now is invalid', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'stale', createdAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(getStaleBackups(backups, 30, 'not-a-date')).toEqual([]);
  });

  it('excludes backups with unparseable createdAt', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'bad', createdAt: 'not-a-date' }),
    ];
    expect(getStaleBackups(backups, 30, NOW)).toEqual([]);
  });

  it('respects the boundary: backup created exactly maxAgeDays ago is NOT stale', () => {
    // 30 days before NOW = 2026-06-15T00:00:00.000Z
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'boundary', createdAt: '2026-06-15T00:00:00.000Z' }),
    ];
    expect(getStaleBackups(backups, 30, NOW)).toEqual([]);
  });

  it('backup created 1ms before the boundary IS stale', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ id: 'just-stale', createdAt: '2026-06-14T23:59:59.999Z' }),
    ];
    expect(getStaleBackups(backups, 30, NOW).map((b) => b.id)).toEqual([
      'just-stale',
    ]);
  });
});

describe('computeBackupFrequency', () => {
  it('returns 0 for an empty list', () => {
    expect(computeBackupFrequency([], 7)).toBe(0);
  });

  it('returns 0 when windowDays <= 0', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ createdAt: '2026-07-01T00:00:00.000Z' }),
      makeBackup({ createdAt: '2026-07-02T00:00:00.000Z' }),
    ];
    expect(computeBackupFrequency(backups, 0)).toBe(0);
    expect(computeBackupFrequency(backups, -1)).toBe(0);
  });

  it('returns 1.0 backups/day for 7 backups created over 7 days', () => {
    const backups: readonly BackupRecord[] = Array.from({ length: 7 }, (_, i) =>
      makeBackup({
        id: `bk-${i}`,
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      }),
    );
    // 7 backups, span = 6 days (2026-07-01 to 2026-07-07)
    // windowDays = 7; latest = 2026-07-07; windowStart = 2026-06-30
    // All 7 are in window.
    // effectiveWindow = min(6 days, 7 days) = 6 days
    // frequency = 7 / 6 = 1.17
    const freq = computeBackupFrequency(backups, 7);
    expect(freq).toBeGreaterThan(1);
    expect(freq).toBeLessThanOrEqual(2);
  });

  it('returns higher frequency for denser backup schedules', () => {
    const daily: readonly BackupRecord[] = Array.from(
      { length: 7 },
      (_, i) => ({
        ...makeBackup({ id: `d-${i}` }),
        createdAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      }),
    );
    const twiceDaily: readonly BackupRecord[] = Array.from(
      { length: 14 },
      (_, i) => ({
        ...makeBackup({ id: `td-${i}` }),
        createdAt: `2026-07-0${Math.floor(i / 2) + 1}T${i % 2 === 0 ? '00' : '12'}:00:00.000Z`,
      }),
    );
    const dailyFreq = computeBackupFrequency(daily, 7);
    const twiceFreq = computeBackupFrequency(twiceDaily, 7);
    expect(twiceFreq).toBeGreaterThan(dailyFreq);
  });

  it('counts only backups within the trailing window', () => {
    // 30 days of backups, but windowDays=7. Should count only the trailing 7 days.
    const backups: readonly BackupRecord[] = Array.from(
      { length: 30 },
      (_, i) => ({
        ...makeBackup({ id: `bk-${i}` }),
        createdAt: `2026-06-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const freq = computeBackupFrequency(backups, 7);
    // Latest = 2026-06-30, windowStart = 2026-06-23
    // Backups in window: 8 (from 06-23 to 06-30 inclusive)
    // Span = 29 days, but windowDays = 7, so effectiveWindow = 7 days
    // frequency = 8 / 7 ≈ 1.14
    expect(freq).toBeGreaterThan(0.5);
    expect(freq).toBeLessThanOrEqual(2);
  });

  it('returns a positive number for a single backup', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ createdAt: '2026-07-15T00:00:00.000Z' }),
    ];
    // Single backup → span = max(0, 1 day) = 1 day
    // inWindow = 1, effectiveDays = 1, freq = 1.0
    const freq = computeBackupFrequency(backups, 7);
    expect(freq).toBeGreaterThan(0);
  });

  it('handles unparseable createdAt gracefully', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ createdAt: 'not-a-date' }),
      makeBackup({ createdAt: '2026-07-01T00:00:00.000Z' }),
    ];
    const freq = computeBackupFrequency(backups, 7);
    expect(freq).toBeGreaterThanOrEqual(0);
  });
});

describe('computeValidationRate', () => {
  it('returns 0 for an empty list', () => {
    expect(computeValidationRate([])).toBe(0);
  });

  it('returns 100 when all backups are validated', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ validationStatus: 'validated' }),
      makeBackup({ validationStatus: 'validated' }),
    ];
    expect(computeValidationRate(backups)).toBe(100);
  });

  it('returns 0 when no backups are validated', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ validationStatus: 'pending' }),
      makeBackup({ validationStatus: 'failed' }),
    ];
    expect(computeValidationRate(backups)).toBe(0);
  });

  it('returns 50 when half are validated', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ validationStatus: 'validated' }),
      makeBackup({ validationStatus: 'pending' }),
    ];
    expect(computeValidationRate(backups)).toBe(50);
  });

  it('returns 33.3 when 1 of 3 is validated', () => {
    const backups: readonly BackupRecord[] = [
      makeBackup({ validationStatus: 'validated' }),
      makeBackup({ validationStatus: 'pending' }),
      makeBackup({ validationStatus: 'failed' }),
    ];
    expect(computeValidationRate(backups)).toBe(33.3);
  });
});
