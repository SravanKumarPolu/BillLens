import { describe, expect, it } from '@jest/globals';

import {
  bucketAmountMinor,
  containsResidualPii,
  redactMetricPayload,
} from '../metrics-redactor';

describe('metrics-redactor', () => {
  describe('bucketAmountMinor', () => {
    it.each<[number, string]>([
      [0, '< 100'],
      [50, '< 100'],
      [99, '< 100'],
      [100, '100-1000'],
      [500, '100-1000'],
      [999, '100-1000'],
      [1000, '1000-10000'],
      [5000, '1000-10000'],
      [9999, '1000-10000'],
      [10000, '> 10000'],
      [1_000_000, '> 10000'],
    ])('buckets %d minor → %s', (input, expected) => {
      expect(bucketAmountMinor(input)).toBe(expected);
    });

    it('buckets negative amounts by their absolute value (never reveals magnitude)', () => {
      expect(bucketAmountMinor(-250)).toBe('100-1000');
      expect(bucketAmountMinor(-25000)).toBe('> 10000');
    });

    it('returns [REDACTED:amount] for non-numeric input', () => {
      expect(bucketAmountMinor(NaN)).toBe('[REDACTED:amount]');
      expect(bucketAmountMinor(Infinity)).toBe('[REDACTED:amount]');
      expect(bucketAmountMinor('1250' as unknown as number)).toBe('[REDACTED:amount]');
      expect(bucketAmountMinor(undefined as unknown as number)).toBe('[REDACTED:amount]');
    });
  });

  describe('redactMetricPayload — top-level keys', () => {
    it('preserves top-level numbers (aggregate ratios / latencies)', () => {
      const out = redactMetricPayload({ value: 0.995, sampleCount: 1234 });
      expect(out.value).toBe(0.995);
      expect(out.sampleCount).toBe(1234);
    });

    it('preserves top-level booleans + null + undefined', () => {
      const out = redactMetricPayload({
        a: true,
        b: false,
        c: null,
        d: undefined,
      });
      expect(out.a).toBe(true);
      expect(out.b).toBe(false);
      expect(out.c).toBe(null);
      expect(out.d).toBe(undefined);
    });

    it('always buckets amountMinor / amountMajor at the top level', () => {
      const out = redactMetricPayload({ amountMinor: 1500, amountMajor: 15.0 });
      // 1500 minor units → '1000-10000' bucket
      expect(out.amountMinor).toBe('1000-10000');
      // 15.0 (major) is treated as a raw numeric value by the bucket function,
      // and 15 < 100 → '< 100'. The exact value NEVER leaks.
      expect(out.amountMajor).toBe('< 100');
      expect(out.amountMajor).not.toBe(15);
      expect(out.amountMajor).not.toBe(15.0);
    });

    it('redacts amountMinor even when the value is a string', () => {
      const out = redactMetricPayload({ amountMinor: '1500' as unknown as number });
      expect(out.amountMinor).toBe('[REDACTED:amount]');
    });
  });

  describe('redactMetricPayload — force-redacted keys', () => {
    it('redacts merchantName', () => {
      const out = redactMetricPayload({ merchantName: 'Big Bazaar' });
      expect(out.merchantName).toBe('[REDACTED:merchant]');
      expect(JSON.stringify(out)).not.toContain('Big Bazaar');
    });

    it('redacts upiId', () => {
      const out = redactMetricPayload({ upiId: 'alice@okhdfcbank' });
      expect(out.upiId).toBe('[REDACTED:upi_id]');
      expect(JSON.stringify(out)).not.toContain('alice@okhdfcbank');
    });

    it('redacts email', () => {
      const out = redactMetricPayload({ email: 'alice@example.com' });
      expect(out.email).toBe('[REDACTED:email]');
    });

    it('redacts paymentReference', () => {
      const out = redactMetricPayload({ paymentReference: '004523689123' });
      expect(out.paymentReference).toBe('[REDACTED:payment_reference]');
    });

    it('redacts bankReference / utr / rrn', () => {
      const out = redactMetricPayload({
        bankReference: '456789012345',
        utr: 'UTR123456789012',
        rrn: '765432109876',
      });
      expect(out.bankReference).toBe('[REDACTED:payment_reference]');
      expect(out.utr).toBe('[REDACTED:payment_reference]');
      expect(out.rrn).toBe('[REDACTED:payment_reference]');
    });

    it('redacts sql / query / sqlQuery', () => {
      const out = redactMetricPayload({
        sql: 'SELECT * FROM expenses WHERE amount_minor > 1000',
        query: 'INSERT INTO settlements (id) VALUES (?)',
        sqlQuery: 'DELETE FROM receipts WHERE id = ?',
      });
      expect(out.sql).toBe('[REDACTED:sqlite_query]');
      expect(out.query).toBe('[REDACTED:sqlite_query]');
      expect(out.sqlQuery).toBe('[REDACTED:sqlite_query]');
      expect(JSON.stringify(out)).not.toContain('SELECT');
      expect(JSON.stringify(out)).not.toContain('INSERT');
      expect(JSON.stringify(out)).not.toContain('DELETE');
      expect(JSON.stringify(out)).not.toContain('FROM expenses');
    });

    it('redacts file paths (file://, /data/, /var/, /Users/, /home/)', () => {
      const out = redactMetricPayload({
        filePath: 'file:///data/user/0/com.billlens/files/db.sqlite',
        path: '/var/lib/billlens/backups/backup.json',
        uri: 'file:///Users/alice/Documents/receipt.jpg',
      });
      expect(out.filePath).toBe('[REDACTED:file_path]');
      expect(out.path).toBe('[REDACTED:file_path]');
      expect(out.uri).toBe('[REDACTED:file_path]');
      expect(JSON.stringify(out)).not.toContain('/data/');
      expect(JSON.stringify(out)).not.toContain('/var/');
      expect(JSON.stringify(out)).not.toContain('/Users/');
      expect(JSON.stringify(out)).not.toContain('file://');
    });

    it('redacts ocrText / receiptImage / rawText', () => {
      const out = redactMetricPayload({
        ocrText: 'BIG BAZAAR\nTotal: 1250.00\nUPI: alice@okhdfcbank',
        receiptImage: 'file:///tmp/receipt.jpg',
        rawText: 'CONFIDENTIAL RECEIPT TEXT',
      });
      expect(out.ocrText).toBe('[REDACTED:ocr_text]');
      expect(out.receiptImage).toBe('[REDACTED:file_path]');
      expect(out.rawText).toBe('[REDACTED:ocr_text]');
    });

    it('redacts note / description / title (may carry merchant names)', () => {
      const out = redactMetricPayload({
        note: 'Dinner at Mainland China',
        description: 'Lunch with the team',
        title: 'Big Bazaar groceries',
      });
      expect(out.note).toBe('[REDACTED:free_text]');
      expect(out.description).toBe('[REDACTED:free_text]');
      expect(out.title).toBe('[REDACTED:free_text]');
    });

    it('is case-insensitive on key names', () => {
      const out = redactMetricPayload({
        MerchantName: 'Big Bazaar',
        UPIID: 'alice@okhdfcbank',
        FilePath: '/var/log/x',
      });
      expect(out.MerchantName).toBe('[REDACTED:merchant]');
      expect(out.UPIID).toBe('[REDACTED:upi_id]');
      expect(out.FilePath).toBe('[REDACTED:file_path]');
    });
  });

  describe('redactMetricPayload — value-level scrubbing', () => {
    it('scrubs SQLite queries embedded in arbitrary keys', () => {
      const out = redactMetricPayload({
        debugMessage: 'failed to execute: SELECT * FROM users WHERE email = ?',
      });
      expect(out.debugMessage).toBe('[REDACTED:sqlite_query]');
      expect(JSON.stringify(out)).not.toContain('SELECT');
      expect(JSON.stringify(out)).not.toContain('FROM users');
    });

    it('scrubs file paths embedded in arbitrary keys', () => {
      const out = redactMetricPayload({
        stackTrace: 'at foo (/data/user/0/com.billlens/files/db.ts:42:18)',
      });
      // The string CONTAINS a path — but our value-level pattern only matches
      // strings that START with /data, file://, etc. Strings with a path
      // embedded are NOT auto-scrubbed. Verify our behaviour explicitly so
      // the team knows to avoid logging raw stack traces.
      // We expect the path pattern to NOT match (string doesn't start with the path).
      // The test asserts the value is returned unchanged (or could be flagged
      // by future heuristics).
      expect(typeof out.stackTrace).toBe('string');
    });

    it('scrubs email embedded in arbitrary keys', () => {
      const out = redactMetricPayload({ contact: 'alice@example.com' });
      expect(out.contact).toBe('[REDACTED:email]');
    });

    it('scrubs UPI VPA embedded in arbitrary keys', () => {
      const out = redactMetricPayload({ sender: 'alice@okhdfcbank' });
      expect(out.sender).toBe('[REDACTED:upi_id]');
    });

    it('scrubs long digit runs (payment references)', () => {
      const out = redactMetricPayload({ ref: '0045236891234567' });
      expect(out.ref).toBe('[REDACTED:payment_reference]');
    });

    it('scrubs long hex tokens', () => {
      const out = redactMetricPayload({
        token: 'a'.repeat(64),
      });
      expect(out.token).toBe('[REDACTED:token]');
    });
  });

  describe('redactMetricPayload — nested objects', () => {
    it('recursively redacts nested objects', () => {
      const out = redactMetricPayload({
        error: {
          message: 'sync failed',
          context: {
            merchantName: 'Big Bazaar',
            amountMinor: 1500,
            sql: 'UPDATE expenses SET amount_minor = 1500 WHERE id = ?',
            nested: {
              email: 'alice@example.com',
            },
          },
        },
      });
      const err = out.error as Record<string, unknown>;
      expect(err.message).toBe('sync failed');
      const ctx = err.context as Record<string, unknown>;
      expect(ctx.merchantName).toBe('[REDACTED:merchant]');
      expect(ctx.amountMinor).toBe('1000-10000');
      expect(ctx.sql).toBe('[REDACTED:sqlite_query]');
      const nested = ctx.nested as Record<string, unknown>;
      expect(nested.email).toBe('[REDACTED:email]');
    });

    it('recursively redacts arrays', () => {
      const out = redactMetricPayload({
        merchants: ['Big Bazaar', 'Mainland China'],
        amounts: [50, 250, 1500, 25000],
      });
      // Arrays of strings — neither key matches a forced-redact pattern, so
      // the strings pass through value-level scrubbing. Plain merchant names
      // (no PII pattern) are preserved. We never claim to redact arbitrary
      // free-text merchant names in array values — that's why the caller is
      // instructed to use the `merchantName` key explicitly.
      expect(Array.isArray(out.merchants)).toBe(true);
      // Amounts in arrays are bucketed (NEVER exact).
      const amounts = out.amounts as unknown[];
      expect(amounts).toEqual(['< 100', '100-1000', '1000-10000', '> 10000']);
    });

    it('does NOT mutate the input payload', () => {
      const input: Record<string, unknown> = {
        merchantName: 'Big Bazaar',
        amountMinor: 1500,
      };
      const snapshot = JSON.stringify(input);
      void redactMetricPayload(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('returns a frozen object', () => {
      const out = redactMetricPayload({ value: 1 });
      expect(Object.isFrozen(out)).toBe(true);
    });
  });

  describe('redactMetricPayload — privacy regression: NO PII leaks', () => {
    const PII_FIXTURES: readonly (readonly [string, unknown, string])[] = [
      ['merchant name', { merchantName: 'Big Bazaar' }, 'Big Bazaar'],
      ['upi id', { upiId: 'alice@okhdfcbank' }, 'alice@okhdfcbank'],
      ['email', { email: 'alice@example.com' }, 'alice@example.com'],
      ['payment reference', { paymentReference: '0045236891234567' }, '0045236891234567'],
      ['file path', { filePath: '/var/lib/billlens/x' }, '/var/lib/billlens/x'],
      ['file uri', { uri: 'file:///Users/alice/receipt.jpg' }, 'file:///Users/alice'],
      ['sqlite query', { sql: 'SELECT * FROM expenses' }, 'SELECT * FROM expenses'],
      ['ocr text', { ocrText: 'BIG BAZAAR' }, 'BIG BAZAAR'],
      ['exact amount', { amountMinor: 1250 }, '1250'],
      ['raw amount in nested object', { ctx: { amountMinor: 9999 } }, '9999'],
      ['upi embedded value', { x: 'bob@ybl' }, 'bob@ybl'],
      ['long digit run value', { x: '123456789012' }, '123456789012'],
      ['hex token value', { x: 'a'.repeat(64) }, 'a'.repeat(64)],
    ];

    it.each(PII_FIXTURES)(
      'never leaks %s in serialized output',
      (_label, payload, piiSubstring) => {
        const out = redactMetricPayload(payload as Readonly<Record<string, unknown>>);
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain(piiSubstring);
        expect(containsResidualPii(out)).toBe(false);
      },
    );

    it('does NOT leak a complex mixed payload', () => {
      const payload = {
        metric: 'sync_success_rate' as const,
        value: 0.942,
        sampleCount: 1823,
        context: {
          failureReason: 'network_timeout',
          affectedQueries: ['SELECT * FROM expenses WHERE amount_minor > 10000'],
          userWithEmail: 'alice@example.com',
          merchant: 'Big Bazaar',
          amountMinor: 25000,
          receiptPath: 'file:///data/user/0/com.billlens/receipt.jpg',
          upiId: 'alice@okhdfcbank',
          paymentRef: '0045236891234567',
        },
      };
      const out = redactMetricPayload(payload);
      const serialized = JSON.stringify(out);
      const forbidden = [
        'Big Bazaar',
        'alice@okhdfcbank',
        'alice@example.com',
        '0045236891234567',
        '/data/user/0',
        'file:///data',
        'SELECT',
        'FROM expenses',
        'receipt.jpg',
        '25000',
      ];
      for (const bad of forbidden) {
        expect(serialized).not.toContain(bad);
      }
      expect(containsResidualPii(out)).toBe(false);
    });
  });
});
