import { describe, expect, it } from '@jest/globals';

import {
  containsResidualFeedbackPii,
  redactFeedbackBody,
  redactFeedbackBodyForType,
} from '../feedback-redactor';

describe('feedback-redactor', () => {
  describe('redactFeedbackBody — file paths / URIs', () => {
    it('strips file:// URIs', () => {
      const out = redactFeedbackBody('Crash log at file:///data/user/0/com.billlens/crash.log');
      expect(out).not.toContain('file://');
      expect(out).not.toContain('/data/user/0');
      expect(out).toContain('[REDACTED:file_path]');
    });

    it('strips absolute paths (/data/, /var/, /Users/, /home/, /tmp/)', () => {
      const out = redactFeedbackBody(
        'Database is at /data/user/0/com.billlens/files/db.sqlite and backups at /var/lib/billlens/',
      );
      expect(out).not.toContain('/data/user/0');
      expect(out).not.toContain('/var/lib/billlens');
      expect(out).toContain('[REDACTED:file_path]');
    });

    it('preserves relative paths that do not start with /', () => {
      const out = redactFeedbackBody('See the receipt at assets/receipt.jpg');
      expect(out).toContain('assets/receipt.jpg');
    });
  });

  describe('redactFeedbackBody — emails + UPI IDs', () => {
    it('strips email addresses', () => {
      const out = redactFeedbackBody('Contact me at alice@example.com please.');
      expect(out).not.toContain('alice@example.com');
      expect(out).toContain('[REDACTED:email]');
    });

    it('strips UPI VPAs', () => {
      const out = redactFeedbackBody('My UPI is alice@okhdfcbank');
      expect(out).not.toContain('alice@okhdfcbank');
      expect(out).toContain('[REDACTED:upi_id]');
    });

    it('distinguishes email (dot in domain) from UPI (no dot)', () => {
      const out = redactFeedbackBody('Email alice@example.com or UPI bob@okhdfcbank');
      expect(out).toContain('[REDACTED:email]');
      expect(out).toContain('[REDACTED:upi_id]');
      expect(out).not.toContain('alice@example.com');
      expect(out).not.toContain('bob@okhdfcbank');
    });
  });

  describe('redactFeedbackBody — payment references', () => {
    it('strips long digit runs (UTR / RRN)', () => {
      const out = redactFeedbackBody('UTR: 0045236891234567');
      expect(out).not.toContain('0045236891234567');
      expect(out).toContain('[REDACTED:payment_reference]');
    });

    it('preserves short numbers (years, counts)', () => {
      const out = redactFeedbackBody('I created 12 expenses in 2024.');
      expect(out).toContain('12');
      expect(out).toContain('2024');
    });
  });

  describe('redactFeedbackBody — OCR text', () => {
    it('strips OCR text markers', () => {
      const out = redactFeedbackBody(
        'OCR: BIG BAZAAR\nTotal: 1250.00\nRaw text: Total amount is 1500.00',
      );
      expect(out).not.toContain('BIG BAZAAR');
      expect(out).not.toContain('Total amount is 1500.00');
      expect(out).toContain('[REDACTED:ocr_text]');
    });
  });

  describe('redactFeedbackBody — amount bucketing', () => {
    it('buckets ₹ amounts with thousand separators', () => {
      const out = redactFeedbackBody('I paid ₹1,250.00 for groceries');
      expect(out).not.toContain('1,250.00');
      expect(out).not.toContain('₹1,250');
      expect(out).toContain('[REDACTED:amount:1000-10000]');
    });

    it('buckets Rs amounts without separators', () => {
      const out = redactFeedbackBody('Rs 50 for coffee');
      expect(out).toContain('[REDACTED:amount:< 100]');
      expect(out).not.toContain('Rs 50');
    });

    it('buckets INR amounts', () => {
      const out = redactFeedbackBody('INR 15000 for rent');
      expect(out).toContain('[REDACTED:amount:> 10000]');
      expect(out).not.toContain('15000');
    });

    it('buckets dollar amounts', () => {
      const out = redactFeedbackBody('$12.50 for parking');
      expect(out).toContain('[REDACTED:amount:< 100]');
      expect(out).not.toContain('$12.50');
    });

    it.each<[string, string, string]>([
      ['₹50', '< 100', 'small'],
      ['₹500', '100-1000', 'medium'],
      ['₹5000', '1000-10000', 'large'],
      ['₹50000', '> 10000', 'huge'],
    ])('buckets %s into %s (%s)', (amount, bucket) => {
      const out = redactFeedbackBody(`I paid ${amount}`);
      expect(out).toContain(`[REDACTED:amount:${bucket}]`);
    });
  });

  describe('redactFeedbackBodyForType — bug report attachments', () => {
    it('strips attachment references entirely for bug_report', () => {
      const raw =
        'App crashed.\nAttachment: /data/user/0/com.billlens/crash.log\nSee attached: screenshot.png';
      const out = redactFeedbackBodyForType(raw, 'bug_report');
      expect(out).not.toContain('crash.log');
      expect(out).not.toContain('screenshot.png');
      expect(out).not.toContain('/data/user/0');
      expect(out).toContain('[REDACTED:attachment]');
    });

    it('strips markdown image syntax in bug reports', () => {
      const raw = 'Here is the screenshot:\n![receipt](file:///tmp/receipt.jpg)';
      const out = redactFeedbackBodyForType(raw, 'bug_report');
      expect(out).not.toContain('receipt.jpg');
      expect(out).not.toContain('![receipt]');
      expect(out).toContain('[REDACTED:attachment]');
    });

    it('does NOT strip attachment references for general feedback (still strips paths)', () => {
      const raw = 'See attached: /data/user/0/com.billlens/crash.log';
      const out = redactFeedbackBodyForType(raw, 'general');
      // The path is still stripped (standard redaction).
      expect(out).not.toContain('/data/user/0');
      expect(out).toContain('[REDACTED:file_path]');
      // But the line itself is NOT collapsed into [REDACTED:attachment].
      expect(out).not.toContain('[REDACTED:attachment]');
    });

    it('preserves general feedback text after redaction', () => {
      const raw = 'I love the app, it would be great to have dark mode!';
      const out = redactFeedbackBodyForType(raw, 'feature_request');
      expect(out).toBe(raw);
    });
  });

  describe('redactFeedbackBody — input edge cases', () => {
    it('returns empty string for null/undefined', () => {
      expect(redactFeedbackBody(null)).toBe('');
      expect(redactFeedbackBody(undefined)).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(redactFeedbackBody('')).toBe('');
    });

    it('returns empty string for non-string input (defensive)', () => {
      expect(redactFeedbackBody(42 as unknown as string)).toBe('');
      expect(redactFeedbackBody({} as unknown as string)).toBe('');
    });

    it('does NOT mutate the input string (strings are immutable, but verify)', () => {
      const input = 'My UPI is alice@okhdfcbank';
      const snapshot = input;
      void redactFeedbackBody(input);
      expect(input).toBe(snapshot);
    });
  });

  describe('redactFeedbackBody — privacy regression: NO PII leaks', () => {
    const PII_FIXTURES: readonly (readonly [string, string, string])[] = [
      ['file uri', 'Crash at file:///Users/alice/crash.log', 'file:///Users/alice'],
      ['absolute path', 'DB at /var/lib/billlens/db.sqlite', '/var/lib/billlens'],
      ['email', 'Contact alice@example.com', 'alice@example.com'],
      ['upi vpa', 'UPI: alice@okhdfcbank', 'alice@okhdfcbank'],
      ['payment ref', 'UTR 0045236891234567', '0045236891234567'],
      ['ocr text', 'OCR: BIG BAZAAR', 'BIG BAZAAR'],
      ['exact amount', '₹1,250.00', '1,250.00'],
      ['amount without comma', 'Rs 1250', '1250'],
    ];

    it.each(PII_FIXTURES)('never leaks %s in output', (_label, body, piiSubstring) => {
      const out = redactFeedbackBody(body);
      expect(out).not.toContain(piiSubstring);
      expect(containsResidualFeedbackPii(out)).toBe(false);
    });

    it('does NOT leak PII from a complex bug report', () => {
      const raw = [
        'App crashed while paying.',
        'Merchant: Big Bazaar',
        'Amount: ₹2,500.00',
        'UPI: alice@okhdfcbank',
        'UTR: 0045236891234567',
        'Contact: alice@example.com',
        'Attachment: /data/user/0/com.billlens/crash.log',
        'Screenshot: ![img](file:///tmp/receipt.jpg)',
        'OCR: BIG BAZAAR Total: 2500.00',
      ].join('\n');
      const out = redactFeedbackBodyForType(raw, 'bug_report');
      const forbidden = [
        'Big Bazaar',
        '2,500.00',
        '2500',
        'alice@okhdfcbank',
        '0045236891234567',
        'alice@example.com',
        '/data/user/0',
        '/tmp/receipt.jpg',
        'file:///tmp',
        'BIG BAZAAR',
      ];
      for (const bad of forbidden) {
        expect(out).not.toContain(bad);
      }
      expect(containsResidualFeedbackPii(out)).toBe(false);
    });
  });
});
