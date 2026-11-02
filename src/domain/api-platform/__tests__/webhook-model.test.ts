/**
 * Webhook model tests.
 *
 * Phase 10 Prompt 94.
 */

import { describe, expect, it } from '@jest/globals';

import { STUB_SECRET_HASHER } from '../../security/secret-rotation';
import {
  MAX_RETRY_COUNT,
  RETRY_BACKOFF_MINUTES,
  STUB_WEBHOOK_SIGNER,
  WEBHOOK_EVENTS,
  computeWebhookSignature,
  createWebhookSubscription,
  getEventsForFilter,
  isSubscribedTo,
  isWebhookEvent,
  nextRetryDelayMinutes,
  shouldRetryWebhook,
  stripPlaintextSecret,
  type WebhookDelivery,
} from '../webhook-model';

const NOW = '2026-07-15T12:00:00.000Z';

describe('isWebhookEvent', () => {
  it('returns true for known events', () => {
    expect(isWebhookEvent('expense.created')).toBe(true);
    expect(isWebhookEvent('settlement.confirmed')).toBe(true);
    expect(isWebhookEvent('balance.updated')).toBe(true);
  });

  it('returns false for unknown events', () => {
    expect(isWebhookEvent('expense.foo')).toBe(false);
    expect(isWebhookEvent('')).toBe(false);
    expect(isWebhookEvent(null)).toBe(false);
  });

  it('exposes all 9 webhook events', () => {
    expect(WEBHOOK_EVENTS).toHaveLength(9);
    expect(WEBHOOK_EVENTS).toContain('expense.created');
    expect(WEBHOOK_EVENTS).toContain('group.member_added');
  });
});

describe('shouldRetryWebhook', () => {
  const baseDelivery: WebhookDelivery = {
    id: 'delivery_1',
    subscriptionId: 'sub_1',
    event: 'expense.created',
    payload: { id: 'exp_1' },
    retryCount: 0,
    status: 'failed',
  };

  it('does not retry a delivered webhook', () => {
    expect(
      shouldRetryWebhook({ ...baseDelivery, status: 'delivered' }),
    ).toBe(false);
  });

  it('does not retry a permanently_failed webhook', () => {
    expect(
      shouldRetryWebhook({ ...baseDelivery, status: 'permanently_failed' }),
    ).toBe(false);
  });

  it('does not retry when retryCount reaches MAX_RETRY_COUNT', () => {
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        retryCount: MAX_RETRY_COUNT,
      }),
    ).toBe(false);
  });

  it('retries on 5xx response', () => {
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        responseStatus: 503,
      }),
    ).toBe(true);
  });

  it('does NOT retry on 4xx response (client error — request itself is bad)', () => {
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        responseStatus: 404,
      }),
    ).toBe(false);
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        responseStatus: 401,
      }),
    ).toBe(false);
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        responseStatus: 422,
      }),
    ).toBe(false);
  });

  it('retries on no response status (timeout / network error)', () => {
    expect(shouldRetryWebhook({ ...baseDelivery })).toBe(true);
  });

  it('does not retry when status is delivered even with responseStatus', () => {
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        status: 'delivered',
        responseStatus: 200,
      }),
    ).toBe(false);
  });

  it('does not retry on 2xx with failed status (defensive)', () => {
    expect(
      shouldRetryWebhook({
        ...baseDelivery,
        status: 'failed',
        responseStatus: 200,
      }),
    ).toBe(false);
  });
});

describe('nextRetryDelayMinutes', () => {
  it('returns the first backoff slot for retryCount=0', () => {
    const d: WebhookDelivery = {
      id: 'd1',
      subscriptionId: 's1',
      event: 'expense.created',
      payload: {},
      retryCount: 0,
      status: 'failed',
    };
    expect(nextRetryDelayMinutes(d)).toBe(RETRY_BACKOFF_MINUTES[0]);
  });

  it('returns the second backoff slot for retryCount=1', () => {
    const d: WebhookDelivery = {
      id: 'd1',
      subscriptionId: 's1',
      event: 'expense.created',
      payload: {},
      retryCount: 1,
      status: 'failed',
    };
    expect(nextRetryDelayMinutes(d)).toBe(RETRY_BACKOFF_MINUTES[1]);
  });

  it('returns 0 when no further retry is scheduled', () => {
    const d: WebhookDelivery = {
      id: 'd1',
      subscriptionId: 's1',
      event: 'expense.created',
      payload: {},
      retryCount: 0,
      status: 'delivered',
    };
    expect(nextRetryDelayMinutes(d)).toBe(0);
  });

  it('clamps retryCount to the last backoff slot', () => {
    const d: WebhookDelivery = {
      id: 'd1',
      subscriptionId: 's1',
      event: 'expense.created',
      payload: {},
      retryCount: 99,
      status: 'failed',
    };
    expect(nextRetryDelayMinutes(d)).toBe(0); // 99 >= MAX, so no retry
  });

  it('exposes the canonical exponential backoff schedule', () => {
    expect(RETRY_BACKOFF_MINUTES).toEqual([1, 5, 30, 120, 360]);
    expect(MAX_RETRY_COUNT).toBe(5);
  });
});

describe('computeWebhookSignature', () => {
  it('returns a sha256= prefixed signature', () => {
    const sig = computeWebhookSignature('payload', 'secret');
    expect(sig.startsWith('sha256=')).toBe(true);
  });

  it('is deterministic for the same payload + secret', () => {
    const sig1 = computeWebhookSignature('payload', 'secret');
    const sig2 = computeWebhookSignature('payload', 'secret');
    expect(sig1).toBe(sig2);
  });

  it('differs for different payloads', () => {
    const sig1 = computeWebhookSignature('payload1', 'secret');
    const sig2 = computeWebhookSignature('payload2', 'secret');
    expect(sig1).not.toBe(sig2);
  });

  it('differs for different secrets', () => {
    const sig1 = computeWebhookSignature('payload', 'secret1');
    const sig2 = computeWebhookSignature('payload', 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('uses the injected signer', () => {
    const customSigner = (payload: string, secret: string) =>
      `custom-${payload}-${secret}`;
    const sig = computeWebhookSignature('payload', 'secret', customSigner);
    expect(sig).toBe('sha256=custom-payload-secret');
  });

  it('throws on empty secret', () => {
    expect(() => computeWebhookSignature('payload', '')).toThrow(
      'secret must be a non-empty string',
    );
  });

  it('throws on non-string payload', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      computeWebhookSignature(null as any, 'secret'),
    ).toThrow('payload must be a string');
  });

  it('exposes STUB_WEBHOOK_SIGNER as a signer function', () => {
    expect(typeof STUB_WEBHOOK_SIGNER).toBe('function');
    const sig = STUB_WEBHOOK_SIGNER('abc', 'xyz');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });
});

describe('getEventsForFilter', () => {
  it('returns all events for "*"', () => {
    const result = getEventsForFilter('*');
    expect(result).toHaveLength(WEBHOOK_EVENTS.length);
  });

  it('returns events for "expense.*"', () => {
    const result = getEventsForFilter('expense.*');
    expect(result).toContain('expense.created');
    expect(result).toContain('expense.updated');
    expect(result).toContain('expense.deleted');
    expect(result).toHaveLength(3);
  });

  it('returns events for "settlement.*"', () => {
    const result = getEventsForFilter('settlement.*');
    expect(result).toHaveLength(3);
    expect(result).toContain('settlement.created');
  });

  it('returns events for a comma-separated explicit list', () => {
    const result = getEventsForFilter('expense.created,expense.updated');
    expect(result).toEqual(['expense.created', 'expense.updated']);
  });

  it('combines wildcards with commas', () => {
    const result = getEventsForFilter('expense.*,group.member_added');
    expect(result).toContain('expense.created');
    expect(result).toContain('group.member_added');
  });

  it('returns an empty list for an unknown filter (fail closed)', () => {
    expect(getEventsForFilter('unknown.event')).toEqual([]);
  });

  it('returns an empty list for empty filter', () => {
    expect(getEventsForFilter('')).toEqual([]);
    expect(getEventsForFilter('   ')).toEqual([]);
  });

  it('deduplicates events', () => {
    const result = getEventsForFilter('expense.created,expense.created,expense.*');
    // expense.created should appear once.
    const createdCount = result.filter((e) => e === 'expense.created').length;
    expect(createdCount).toBe(1);
  });

  it('returns a frozen array', () => {
    expect(Object.isFrozen(getEventsForFilter('expense.*'))).toBe(true);
  });
});

describe('isSubscribedTo', () => {
  const sub = createWebhookSubscription({
    id: 'sub_1',
    url: 'https://app.example.com/webhooks',
    events: ['expense.created', 'expense.updated'],
    plaintextSecret: 'supersecretvalue123',
    createdBy: 'user_abc',
    now: NOW,
    hasher: STUB_SECRET_HASHER,
  });

  it('returns true for a subscribed event', () => {
    expect(isSubscribedTo(sub, 'expense.created')).toBe(true);
  });

  it('returns false for an unsubscribed event', () => {
    expect(isSubscribedTo(sub, 'expense.deleted')).toBe(false);
  });
});

describe('createWebhookSubscription', () => {
  it('returns a subscription with the plaintext secret present (for one-time return)', () => {
    const sub = createWebhookSubscription({
      id: 'sub_1',
      url: 'https://app.example.com/webhooks',
      events: ['expense.created'],
      plaintextSecret: 'supersecretvalue123',
      createdBy: 'user_abc',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(sub.secret).toBe('supersecretvalue123');
    expect(sub.secretHash).toBe(STUB_SECRET_HASHER('supersecretvalue123'));
    expect(sub.secretHash).not.toBe('supersecretvalue123');
    expect(sub.active).toBe(true);
    expect(sub.createdAt).toBe(NOW);
  });

  it('returns a frozen object with frozen events', () => {
    const sub = createWebhookSubscription({
      id: 'sub_1',
      url: 'https://app.example.com/webhooks',
      events: ['expense.created'],
      plaintextSecret: 'supersecretvalue123',
      createdBy: 'user_abc',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(Object.isFrozen(sub)).toBe(true);
    expect(Object.isFrozen(sub.events)).toBe(true);
  });

  it('throws on a non-https url (except http://localhost)', () => {
    expect(() =>
      createWebhookSubscription({
        id: 'sub_1',
        url: 'http://attacker.com/webhooks',
        events: ['expense.created'],
        plaintextSecret: 'supersecretvalue123',
        createdBy: 'user_abc',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('url must use HTTPS');
  });

  it('allows http://localhost for local development', () => {
    const sub = createWebhookSubscription({
      id: 'sub_1',
      url: 'http://localhost:3000/webhooks',
      events: ['expense.created'],
      plaintextSecret: 'supersecretvalue123',
      createdBy: 'user_abc',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(sub.url).toBe('http://localhost:3000/webhooks');
  });

  it('throws on an invalid URL', () => {
    expect(() =>
      createWebhookSubscription({
        id: 'sub_1',
        url: 'not-a-url',
        events: ['expense.created'],
        plaintextSecret: 'supersecretvalue123',
        createdBy: 'user_abc',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('url must be a valid URL');
  });

  it('throws on empty events', () => {
    expect(() =>
      createWebhookSubscription({
        id: 'sub_1',
        url: 'https://app.example.com/webhooks',
        events: [],
        plaintextSecret: 'supersecretvalue123',
        createdBy: 'user_abc',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('events must contain at least one event');
  });

  it('throws on unknown event', () => {
    expect(() =>
      createWebhookSubscription({
        id: 'sub_1',
        url: 'https://app.example.com/webhooks',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        events: ['unknown.event' as any],
        plaintextSecret: 'supersecretvalue123',
        createdBy: 'user_abc',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('Unknown webhook event');
  });

  it('throws on a short secret (min 16 chars)', () => {
    expect(() =>
      createWebhookSubscription({
        id: 'sub_1',
        url: 'https://app.example.com/webhooks',
        events: ['expense.created'],
        plaintextSecret: 'short',
        createdBy: 'user_abc',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('plaintextSecret must be at least 16 characters');
  });
});

describe('stripPlaintextSecret', () => {
  it('returns a subscription with the plaintext secret cleared', () => {
    const sub = createWebhookSubscription({
      id: 'sub_1',
      url: 'https://app.example.com/webhooks',
      events: ['expense.created'],
      plaintextSecret: 'supersecretvalue123',
      createdBy: 'user_abc',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    const stripped = stripPlaintextSecret(sub);
    expect(stripped.secret).toBe('');
    expect(stripped.secretHash).toBe(sub.secretHash);
    expect(Object.isFrozen(stripped)).toBe(true);
  });
});
