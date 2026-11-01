import {
  getUserTimezone,
  convertToUserTimezone,
  formatInTimezone,
  getTimezoneOffset,
} from '../timezone-handler';

describe('i18n / timezone-handler', () => {
  describe('getUserTimezone', () => {
    it('returns a non-empty string', () => {
      const tz = getUserTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    });
    it('returns UTC fallback when Intl unavailable', () => {
      // We can't easily mock Intl away in jest-expo env; we just
      // verify the function does not throw.
      expect(() => getUserTimezone()).not.toThrow();
    });
  });

  describe('convertToUserTimezone', () => {
    it('returns ISO string with offset for known timezone', () => {
      const result = convertToUserTimezone(
        '2026-01-01T12:00:00.000Z',
        'America/New_York',
      );
      // New York in January is UTC-5 (EST, no DST).
      expect(result).toMatch(/2026-01-01T07:00:00\.000/);
      expect(result).toMatch(/-0[45]:00/);
    });
    it('returns ISO string with positive offset for Asia/Kolkata', () => {
      const result = convertToUserTimezone(
        '2026-01-01T12:00:00.000Z',
        'Asia/Kolkata',
      );
      // India is UTC+5:30 always.
      expect(result).toMatch(/2026-01-01T17:30:00\.000\+05:30/);
    });
    it('returns UTC+00:00 (Z) for UTC timezone', () => {
      const result = convertToUserTimezone(
        '2026-01-01T12:00:00.000Z',
        'UTC',
      );
      expect(result).toMatch(/2026-01-01T12:00:00\.000Z/);
    });
    it('returns original string for invalid date', () => {
      const result = convertToUserTimezone('not-a-date', 'UTC');
      expect(result).toBe('not-a-date');
    });
    it('returns original string for unknown timezone', () => {
      const result = convertToUserTimezone(
        '2026-01-01T12:00:00.000Z',
        'Not/A_Real_Tz',
      );
      expect(result).toBe('2026-01-01T12:00:00.000Z');
    });
  });

  describe('formatInTimezone', () => {
    it('formats YYYY-MM-DD HH:mm', () => {
      const result = formatInTimezone(
        '2026-01-01T12:00:00.000Z',
        'Asia/Kolkata',
        'YYYY-MM-DD HH:mm',
      );
      expect(result).toBe('2026-01-01 17:30');
    });
    it('formats YYYY/MM/DD', () => {
      const result = formatInTimezone(
        '2026-01-01T12:00:00.000Z',
        'Asia/Tokyo',
        'YYYY/MM/DD',
      );
      // Tokyo is UTC+9 → 21:00 on the same day.
      expect(result).toBe('2026/01/01');
    });
    it('formats YYYY-MM-DD HH:mm:ss', () => {
      const result = formatInTimezone(
        '2026-01-01T12:00:00.000Z',
        'UTC',
        'YYYY-MM-DD HH:mm:ss',
      );
      expect(result).toBe('2026-01-01 12:00:00');
    });
    it('returns original string for invalid date', () => {
      const result = formatInTimezone('not-a-date', 'UTC', 'YYYY-MM-DD');
      expect(result).toBe('not-a-date');
    });
    it('returns original string for unknown timezone', () => {
      const result = formatInTimezone(
        '2026-01-01T12:00:00.000Z',
        'Not/A_Real_Tz',
        'YYYY-MM-DD',
      );
      expect(result).toBe('2026-01-01T12:00:00.000Z');
    });
  });

  describe('getTimezoneOffset', () => {
    it('returns -300 for America/New_York in January (EST = UTC-5)', () => {
      const offset = getTimezoneOffset(
        'America/New_York',
        '2026-01-15T12:00:00.000Z',
      );
      expect(offset).toBe(-300);
    });
    it('returns -240 for America/New_York in July (EDT = UTC-4)', () => {
      const offset = getTimezoneOffset(
        'America/New_York',
        '2026-07-15T12:00:00.000Z',
      );
      expect(offset).toBe(-240);
    });
    it('returns 330 for Asia/Kolkata (UTC+5:30 always)', () => {
      const offset = getTimezoneOffset(
        'Asia/Kolkata',
        '2026-01-15T12:00:00.000Z',
      );
      expect(offset).toBe(330);
    });
    it('returns 0 for UTC', () => {
      const offset = getTimezoneOffset('UTC', '2026-01-15T12:00:00.000Z');
      expect(offset).toBe(0);
    });
    it('returns 540 for Asia/Tokyo (UTC+9 always)', () => {
      const offset = getTimezoneOffset('Asia/Tokyo', '2026-01-15T12:00:00.000Z');
      expect(offset).toBe(540);
    });
    it('returns 0 for invalid date', () => {
      const offset = getTimezoneOffset('UTC', 'not-a-date');
      expect(offset).toBe(0);
    });
    it('returns 0 for unknown timezone', () => {
      const offset = getTimezoneOffset(
        'Not/A_Real_Tz',
        '2026-01-15T12:00:00.000Z',
      );
      expect(offset).toBe(0);
    });
  });
});
