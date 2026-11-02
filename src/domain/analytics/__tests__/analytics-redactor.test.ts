import { describe, expect, it } from '@jest/globals';

import {
  SENSITIVE_PROPERTY_KEYS,
  bucketAmount,
  containsResidualAnalyticsPii,
  isSensitivePropertyKey,
  redactAnalyticsEvent,
  type AnalyticsEvent,
} from '../analytics-redactor';

describe('analytics-redactor', () => {
  describe('SENSITIVE_PROPERTY_KEYS', () => {
    // The spec lists 14 keys in the Set (the prompt text says "13" but
    // the explicit Set definition has 14 — we go with the Set).
    it('contains exactly 14 keys (the full set listed in the spec)', () => {
      expect(SENSITIVE_PROPERTY_KEYS.size).toBe(14);
    });

    it.each([
      'amountMinor',
      'amountMajor',
      'merchantName',
      'upiId',
      'bankReference',
      'ocrText',
      'receiptImage',
      'groupName',
      'memberName',
      'note',
      'paymentReference',
      'inviteToken',
      'sessionToken',
      'filePath',
    ])('includes %s', (key) => {
      expect(SENSITIVE_PROPERTY_KEYS.has(key)).toBe(true);
    });

    it('does NOT include non-sensitive keys', () => {
      expect(SENSITIVE_PROPERTY_KEYS.has('feature')).toBe(false);
      expect(SENSITIVE_PROPERTY_KEYS.has('count')).toBe(false);
      expect(SENSITIVE_PROPERTY_KEYS.has('screen')).toBe(false);
    });
  });

  describe('isSensitivePropertyKey', () => {
    it('returns true for sensitive keys', () => {
      expect(isSensitivePropertyKey('amountMinor')).toBe(true);
      expect(isSensitivePropertyKey('merchantName')).toBe(true);
      expect(isSensitivePropertyKey('upiId')).toBe(true);
    });

    it('returns false for non-sensitive keys', () => {
      expect(isSensitivePropertyKey('feature')).toBe(false);
      expect(isSensitivePropertyKey('screen')).toBe(false);
    });

    it('is case-sensitive (canonical camelCase only)', () => {
      expect(isSensitivePropertyKey('amountminor')).toBe(false);
      expect(isSensitivePropertyKey('AmountMinor')).toBe(false);
      expect(isSensitivePropertyKey('AMOUNTMINOR')).toBe(false);
    });
  });

  describe('bucketAmount', () => {
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
    ])('buckets %d → %s', (input, expected) => {
      expect(bucketAmount(input)).toBe(expected);
    });

    it('buckets negative amounts by absolute value', () => {
      expect(bucketAmount(-500)).toBe('100-1000');
      expect(bucketAmount(-50000)).toBe('> 10000');
    });

    it('returns [REDACTED:amount] for non-finite input', () => {
      expect(bucketAmount(NaN)).toBe('[REDACTED:amount]');
      expect(bucketAmount(Infinity)).toBe('[REDACTED:amount]');
      expect(bucketAmount(-Infinity)).toBe('[REDACTED:amount]');
    });
  });

  describe('redactAnalyticsEvent — drops ALL 14 sensitive keys', () => {
    const event: AnalyticsEvent = {
      name: 'expense_created',
      anonymousId: 'install-abc-123',
      occurredAt: '2025-01-01T00:00:00.000Z',
      properties: {
        amountMinor: 1250,
        amountMajor: 12.5,
        merchantName: 'Big Bazaar',
        upiId: 'alice@okhdfcbank',
        bankReference: '0045236891234567',
        ocrText: 'BIG BAZAAR Total: 1250.00',
        receiptImage: 'file:///tmp/receipt.jpg',
        groupName: 'Weekend Trip',
        memberName: 'Alice',
        note: 'Dinner at Mainland China',
        paymentReference: 'UTR123456789012',
        inviteToken: 'a'.repeat(64),
        sessionToken: 'b'.repeat(64),
        filePath: '/data/user/0/com.billlens/db.sqlite',
        // Non-sensitive keys that should survive.
        feature: 'create_expense_manual',
        screen: 'NewExpenseScreen',
        count: 1,
        isActive: true,
      },
    };

    const redacted = redactAnalyticsEvent(event);

    it('drops all 14 sensitive keys', () => {
      const sensitiveKeys = [
        'amountMinor',
        'amountMajor',
        'merchantName',
        'upiId',
        'bankReference',
        'ocrText',
        'receiptImage',
        'groupName',
        'memberName',
        'note',
        'paymentReference',
        'inviteToken',
        'sessionToken',
        'filePath',
      ];
      for (const key of sensitiveKeys) {
        expect(redacted.properties).not.toHaveProperty(key);
      }
    });

    it('preserves non-sensitive keys', () => {
      expect(redacted.properties.feature).toBe('create_expense_manual');
      expect(redacted.properties.screen).toBe('NewExpenseScreen');
      expect(redacted.properties.count).toBe(1);
      expect(redacted.properties.isActive).toBe(true);
    });

    it('does NOT leak any PII value in serialized output', () => {
      const serialized = JSON.stringify(redacted);
      const forbidden = [
        'Big Bazaar',
        'alice@okhdfcbank',
        '0045236891234567',
        'BIG BAZAAR',
        '1250.00',
        'file:///tmp',
        '/data/user/0',
        'Weekend Trip',
        'Alice',
        'Mainland China',
        'UTR123456789012',
        'a'.repeat(64),
        'b'.repeat(64),
        'db.sqlite',
      ];
      for (const bad of forbidden) {
        expect(serialized).not.toContain(bad);
      }
    });

    it('passes containsResidualAnalyticsPii', () => {
      expect(containsResidualAnalyticsPii(redacted)).toBe(false);
    });
  });

  describe('redactAnalyticsEvent — scrubs PII from non-sensitive string values', () => {
    it('scrubs emails embedded in arbitrary string values', () => {
      const event: AnalyticsEvent = {
        name: 'contact_submitted',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { contactField: 'alice@example.com' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.contactField).toBe('[REDACTED:email]');
    });

    it('scrubs UPI VPAs embedded in arbitrary string values', () => {
      const event: AnalyticsEvent = {
        name: 'upi_field_seen',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { senderField: 'alice@okhdfcbank' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.senderField).toBe('[REDACTED:upi_id]');
    });

    it('scrubs file URIs embedded in arbitrary string values', () => {
      const event: AnalyticsEvent = {
        name: 'file_referenced',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { ref: 'file:///data/user/0/com.billlens/x.log' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.ref).toBe('[REDACTED:file_path]');
    });

    it('scrubs absolute paths embedded in arbitrary string values', () => {
      const event: AnalyticsEvent = {
        name: 'path_seen',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { path: '/var/lib/billlens/db.sqlite' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.path).toBe('[REDACTED:file_path]');
    });

    it('scrubs long digit runs (payment references)', () => {
      const event: AnalyticsEvent = {
        name: 'ref_seen',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { ref: '0045236891234567' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.ref).toBe('[REDACTED:payment_reference]');
    });

    it('scrubs hex tokens', () => {
      const event: AnalyticsEvent = {
        name: 'token_seen',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { tok: 'a'.repeat(64) },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.tok).toBe('[REDACTED:token]');
    });

    it('scrubs SQL queries', () => {
      const event: AnalyticsEvent = {
        name: 'query_seen',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { q: 'SELECT * FROM expenses WHERE amount_minor > 1000' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.q).toBe('[REDACTED:sqlite_query]');
    });

    it('preserves short, non-PII strings', () => {
      const event: AnalyticsEvent = {
        name: 'screen_view',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { screen: 'HomeDashboard' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.screen).toBe('HomeDashboard');
    });

    it('preserves numbers (counts, ratios)', () => {
      const event: AnalyticsEvent = {
        name: 'count_event',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { count: 42, ratio: 0.95 },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.count).toBe(42);
      expect(redacted.properties.ratio).toBe(0.95);
    });

    it('preserves booleans + null + undefined', () => {
      const event: AnalyticsEvent = {
        name: 'mixed_event',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { a: true, b: false, c: null, d: undefined },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.properties.a).toBe(true);
      expect(redacted.properties.b).toBe(false);
      expect(redacted.properties.c).toBe(null);
      expect(redacted.properties.d).toBe(undefined);
    });
  });

  describe('redactAnalyticsEvent — nested objects + arrays', () => {
    it('recursively redacts nested objects', () => {
      const event: AnalyticsEvent = {
        name: 'nested_event',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {
          outer: {
            merchantName: 'Big Bazaar',
            note: 'secret',
            safe: 'ok',
            inner: {
              upiId: 'alice@okhdfcbank',
            },
          },
        },
      };
      const redacted = redactAnalyticsEvent(event);
      const outer = redacted.properties.outer as Record<string, unknown>;
      expect(outer).not.toHaveProperty('merchantName');
      expect(outer).not.toHaveProperty('note');
      expect(outer.safe).toBe('ok');
      const inner = outer.inner as Record<string, unknown>;
      expect(inner).not.toHaveProperty('upiId');
    });

    it('recursively redacts arrays', () => {
      const event: AnalyticsEvent = {
        name: 'array_event',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {
          contacts: ['alice@example.com', 'bob@example.com'],
          counts: [1, 2, 3],
        },
      };
      const redacted = redactAnalyticsEvent(event);
      const contacts = redacted.properties.contacts as unknown[];
      expect(contacts).toEqual(['[REDACTED:email]', '[REDACTED:email]']);
      const counts = redacted.properties.counts as unknown[];
      expect(counts).toEqual([1, 2, 3]);
    });

    it('does NOT mutate the input event', () => {
      const event: AnalyticsEvent = {
        name: 'x',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { merchantName: 'Big Bazaar', safe: 'ok' },
      };
      const snapshot = JSON.stringify(event);
      void redactAnalyticsEvent(event);
      expect(JSON.stringify(event)).toBe(snapshot);
    });

    it('returns a frozen result', () => {
      const event: AnalyticsEvent = {
        name: 'x',
        anonymousId: 'install-xyz',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: { safe: 'ok' },
      };
      const redacted = redactAnalyticsEvent(event);
      expect(Object.isFrozen(redacted)).toBe(true);
      expect(Object.isFrozen(redacted.properties)).toBe(true);
    });
  });

  describe('redactAnalyticsEvent — anonymousId + name validation', () => {
    it('preserves a valid anonymousId', () => {
      const event: AnalyticsEvent = {
        name: 'x',
        anonymousId: 'install-abc-123',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {},
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.anonymousId).toBe('install-abc-123');
    });

    it('redacts an anonymousId that looks like an email', () => {
      const event: AnalyticsEvent = {
        name: 'x',
        anonymousId: 'alice@example.com',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {},
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.anonymousId).toBe('[REDACTED:anonymous_id]');
    });

    it('redacts an empty anonymousId', () => {
      const event: AnalyticsEvent = {
        name: 'x',
        anonymousId: '',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {},
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.anonymousId).toBe('[REDACTED:anonymous_id]');
    });

    it('redacts an event name that is too long', () => {
      const event: AnalyticsEvent = {
        name: 'x'.repeat(200),
        anonymousId: 'install-abc',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {},
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.name).toBe('[REDACTED:event_name]');
    });

    it('preserves a normal short event name', () => {
      const event: AnalyticsEvent = {
        name: 'expense_created',
        anonymousId: 'install-abc',
        occurredAt: '2025-01-01T00:00:00.000Z',
        properties: {},
      };
      const redacted = redactAnalyticsEvent(event);
      expect(redacted.name).toBe('expense_created');
    });
  });

  describe('redactAnalyticsEvent — privacy regression: NO PII leaks', () => {
    const PII_FIXTURES: readonly (readonly [string, AnalyticsEvent, string])[] = [
      [
        'merchantName',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { merchantName: 'Big Bazaar' },
        },
        'Big Bazaar',
      ],
      [
        'upiId',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { upiId: 'alice@okhdfcbank' },
        },
        'alice@okhdfcbank',
      ],
      [
        'amountMinor',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { amountMinor: 1250 },
        },
        '1250',
      ],
      [
        'ocrText',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { ocrText: 'BIG BAZAAR' },
        },
        'BIG BAZAAR',
      ],
      [
        'filePath',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { filePath: '/var/lib/billlens/db.sqlite' },
        },
        '/var/lib/billlens',
      ],
      [
        'receiptImage',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { receiptImage: 'file:///tmp/receipt.jpg' },
        },
        'file:///tmp',
      ],
      [
        'sessionToken',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { sessionToken: 'a'.repeat(64) },
        },
        'a'.repeat(64),
      ],
      [
        'inviteToken',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { inviteToken: 'b'.repeat(64) },
        },
        'b'.repeat(64),
      ],
      [
        'paymentReference',
        {
          name: 'x',
          anonymousId: 'a',
          occurredAt: '2025-01-01T00:00:00.000Z',
          properties: { paymentReference: '0045236891234567' },
        },
        '0045236891234567',
      ],
    ];

    it.each(PII_FIXTURES)(
      'never leaks %s in serialized output',
      (_label, event, piiSubstring) => {
        const redacted = redactAnalyticsEvent(event);
        const serialized = JSON.stringify(redacted);
        expect(serialized).not.toContain(piiSubstring);
        expect(containsResidualAnalyticsPii(redacted)).toBe(false);
      },
    );

    it('does NOT leak PII from a complex mixed event', () => {
      const event: AnalyticsEvent = {
        name: 'expense_created',
        anonymousId: 'install-abc-123',
        occurredAt: '2025-01-15T10:30:00.000Z',
        properties: {
          amountMinor: 25000,
          merchantName: 'Big Bazaar',
          upiId: 'alice@okhdfcbank',
          ocrText: 'BIG BAZAAR Total: 2500.00',
          filePath: '/data/user/0/com.billlens/db.sqlite',
          paymentReference: '0045236891234567',
          sessionToken: 'a'.repeat(64),
          // Legit properties.
          feature: 'create_expense_ocr',
          screen: 'NewExpenseScreen',
          splitType: 'equal',
          participantCount: 4,
          nested: {
            merchantName: 'Mainland China',
            email: 'alice@example.com',
          },
        },
      };
      const redacted = redactAnalyticsEvent(event);
      const serialized = JSON.stringify(redacted);
      const forbidden = [
        'Big Bazaar',
        'Mainland China',
        'alice@okhdfcbank',
        'alice@example.com',
        'BIG BAZAAR',
        '2500.00',
        '25000',
        '/data/user/0',
        '0045236891234567',
        'a'.repeat(64),
      ];
      for (const bad of forbidden) {
        expect(serialized).not.toContain(bad);
      }
      expect(containsResidualAnalyticsPii(redacted)).toBe(false);
    });
  });
});
