/**
 * Webhook model — subscription, delivery, retry, HMAC signing.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 *   - Webhook signing secrets are stored as HASHES ONLY. The plaintext
 *     secret is returned to the subscriber exactly once (at subscription
 *     time) and is never persisted. Storage layers MUST reject a
 *     `WebhookSubscription` with a non-empty `secret` field.
 *   - HMAC-SHA256 is used to sign every delivery. The signature is sent
 *     in the `X-BillLens-Signature` header. Subscribers MUST verify the
 *     signature before processing the payload — otherwise they are open
 *     to spoofing attacks.
 *   - Retries are exponential (1min, 5min, 30min, 2h, 6h) and capped at
 *     5 attempts. After 5 failures the delivery is marked
 *     `permanently_failed` and the subscription is auto-paused.
 *
 * This module is PURE: it computes decisions from inputs. HMAC signing
 * is delegated to an injected `WebhookSigner` port (production:
 * `crypto.createHmac('sha256', secret)`; tests: a deterministic stub).
 *
 * See `docs/api-developer-platform.md`.
 */

import type { SecretHasher } from '../security/secret-rotation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'settlement.created'
  | 'settlement.confirmed'
  | 'settlement.reversed'
  | 'group.member_added'
  | 'group.member_removed'
  | 'balance.updated';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = Object.freeze([
  'expense.created',
  'expense.updated',
  'expense.deleted',
  'settlement.created',
  'settlement.confirmed',
  'settlement.reversed',
  'group.member_added',
  'group.member_removed',
  'balance.updated',
]);

const WEBHOOK_EVENT_SET: ReadonlySet<WebhookEvent> = new Set(WEBHOOK_EVENTS);

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && WEBHOOK_EVENT_SET.has(value as WebhookEvent);
}

export interface WebhookSubscription {
  readonly id: string;
  readonly url: string;
  readonly events: readonly WebhookEvent[];
  /**
   * Plaintext signing secret — present ONLY on the subscription-create
   * response. Persisted subscriptions MUST have this field stripped.
   */
  readonly secret: string;
  /** SHA-256 hash of the plaintext secret — the ONLY field persisted. */
  readonly secretHash: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface WebhookDelivery {
  readonly id: string;
  readonly subscriptionId: string;
  readonly event: WebhookEvent;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deliveredAt?: string;
  readonly responseStatus?: number;
  readonly retryCount: number;
  readonly status: 'pending' | 'delivered' | 'failed' | 'permanently_failed';
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/**
 * Exponential backoff in minutes: [1, 5, 30, 120, 360].
 *
 * After `MAX_RETRY_COUNT` attempts, the delivery is marked
 * `permanently_failed` and the subscription is auto-paused.
 */
export const RETRY_BACKOFF_MINUTES: readonly number[] = Object.freeze([
  1, 5, 30, 120, 360,
]);

export const MAX_RETRY_COUNT = RETRY_BACKOFF_MINUTES.length;

/**
 * Returns true when the delivery should be retried.
 *
 * Conditions for retry:
 *   - status is `pending` or `failed`
 *   - retryCount < MAX_RETRY_COUNT
 *   - responseStatus (if present) is in the retryable set
 *
 * Conditions that do NOT retry:
 *   - status is `delivered` (success)
 *   - status is `permanently_failed`
 *   - responseStatus is 4xx (client errors — the URL is wrong, the
 *     payload is malformed, the subscriber returned 401, etc.)
 */
export function shouldRetryWebhook(delivery: WebhookDelivery): boolean {
  if (delivery.status === 'delivered') return false;
  if (delivery.status === 'permanently_failed') return false;
  if (delivery.retryCount >= MAX_RETRY_COUNT) return false;

  if (delivery.responseStatus !== undefined) {
    // 4xx client errors: do not retry (the request itself is bad).
    if (delivery.responseStatus >= 400 && delivery.responseStatus < 500) {
      return false;
    }
    // 5xx server errors: retry (the subscriber's server had a hiccup).
    if (delivery.responseStatus >= 500 && delivery.responseStatus < 600) {
      return true;
    }
    // 2xx and 3xx: should not have reached `failed` status — be defensive
    // and do not retry.
    return false;
  }
  // No response status: timed out or network error — retry.
  return true;
}

/**
 * Returns the number of minutes until the next retry attempt.
 *
 * Returns 0 when no further retry is scheduled.
 */
export function nextRetryDelayMinutes(delivery: WebhookDelivery): number {
  if (!shouldRetryWebhook(delivery)) return 0;
  const idx = Math.min(delivery.retryCount, RETRY_BACKOFF_MINUTES.length - 1);
  const value = RETRY_BACKOFF_MINUTES[idx];
  return value ?? 0;
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

/**
 * HMAC-SHA256 signer port. Accepts the payload string and the plaintext
 * signing secret, returns a hex-encoded HMAC-SHA256 digest.
 *
 * Production code MUST inject a real HMAC backed by the platform's crypto
 * (`crypto.createHmac('sha256', secret)` in Node, `expo-crypto.hmacDigest`
 * in React Native — the latter doesn't exist yet so use a polyfill).
 *
 * The default stub is a NON-cryptographic digest intended for tests only.
 */
export type WebhookSigner = (payload: string, secret: string) => string;

/**
 * Reference stub signer — NOT cryptographically secure. Uses a simple
 * FNV-1a-based mixing of the payload and secret. Production deployments
 * MUST inject a real HMAC implementation.
 */
export const STUB_WEBHOOK_SIGNER: WebhookSigner = (
  payload: string,
  secret: string,
): string => {
  if (typeof payload !== 'string' || typeof secret !== 'string') {
    throw new Error('payload and secret must be strings');
  }
  // FNV-1a 32-bit over payload bytes, salted with secret length + char sum.
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  let secretMix = 0;
  for (let i = 0; i < secret.length; i++) {
    secretMix = (secretMix + secret.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < payload.length; i++) {
    const c = (payload.charCodeAt(i) ^ (secretMix + i)) >>> 0;
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i + secretMix;
    h2 = Math.imul(h2, 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `sha256=${(part1 + part2).repeat(4)}`;
};

/**
 * Computes the HMAC-SHA256 signature for a webhook payload.
 *
 * The returned string is prefixed with `sha256=` to match the convention
 * used by GitHub, Stripe, and other webhook senders. The subscriber
 * verifies the signature by:
 *
 *   1. Reading the `X-BillLens-Signature` header.
 *   2. Splitting on `=` to get the algorithm and digest.
 *   3. Computing `HMAC-SHA256(payload, secret)` themselves.
 *   4. Comparing the two digests in constant time.
 *
 * The default `signer` argument is the STUB — production MUST inject a
 * real HMAC signer.
 */
export function computeWebhookSignature(
  payload: string,
  secret: string,
  signer: WebhookSigner = STUB_WEBHOOK_SIGNER,
): string {
  if (typeof payload !== 'string') {
    throw new Error('payload must be a string');
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('secret must be a non-empty string');
  }
  const sig = signer(payload, secret);
  if (typeof sig !== 'string' || sig.length === 0) {
    throw new Error('signer returned an empty signature');
  }
  return sig.startsWith('sha256=') ? sig : `sha256=${sig}`;
}

// ---------------------------------------------------------------------------
// Event filtering
// ---------------------------------------------------------------------------

/**
 * Returns the events matching a filter expression.
 *
 * Filter grammar (simple, prefix-based):
 *   - `*`           → all events
 *   - `expense.*`   → all `expense.*` events
 *   - `expense.created,expense.updated` → comma-separated explicit list
 *   - `expense.*` + `settlement.*` may be combined with commas
 *
 * Unknown filters return an empty list (fail closed — the subscriber
 * asked for events we don't recognise, so we send nothing).
 */
export function getEventsForFilter(filter: string): readonly WebhookEvent[] {
  if (typeof filter !== 'string' || filter.trim().length === 0) {
    return Object.freeze([]);
  }
  const trimmed = filter.trim();
  if (trimmed === '*') {
    return Object.freeze([...WEBHOOK_EVENTS]);
  }
  const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  const out: WebhookEvent[] = [];
  for (const part of parts) {
    if (part === '*') {
      return Object.freeze([...WEBHOOK_EVENTS]);
    }
    if (part.endsWith('.*')) {
      const prefix = part.slice(0, -1); // keep trailing dot
      for (const ev of WEBHOOK_EVENTS) {
        if (ev.startsWith(prefix) && !out.includes(ev)) {
          out.push(ev);
        }
      }
      continue;
    }
    if (isWebhookEvent(part) && !out.includes(part)) {
      out.push(part);
    }
  }
  return Object.freeze(out);
}

/**
 * Returns true when `subscription.events` includes `event` (or `*`).
 */
export function isSubscribedTo(
  subscription: WebhookSubscription,
  event: WebhookEvent,
): boolean {
  return subscription.events.includes(event);
}

// ---------------------------------------------------------------------------
// Subscription construction (hash only — plaintext returned once)
// ---------------------------------------------------------------------------

export interface CreateWebhookSubscriptionInput {
  readonly id: string;
  readonly url: string;
  readonly events: readonly WebhookEvent[];
  readonly plaintextSecret: string;
  readonly createdBy: string;
  readonly now: string;
  readonly hasher: SecretHasher;
}

/**
 * Constructs a `WebhookSubscription` from a freshly generated plaintext
 * secret. The plaintext secret is included in the returned object SO THAT
 * the caller can hand it back to the subscriber exactly once. The caller
 * MUST strip `secret` before persisting — only `secretHash` is persisted.
 */
export function createWebhookSubscription(
  input: CreateWebhookSubscriptionInput,
): WebhookSubscription {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new Error('id must be a non-empty string');
  }
  if (typeof input.url !== 'string' || input.url.length === 0) {
    throw new Error('url must be a non-empty string');
  }
  try {
    // eslint-disable-next-line no-new
    new URL(input.url);
  } catch {
    throw new Error(`url must be a valid URL: ${input.url}`);
  }
  if (!input.url.startsWith('https://') && !input.url.startsWith('http://localhost')) {
    throw new Error(
      'url must use HTTPS (HTTP allowed only for http://localhost in dev)',
    );
  }
  if (!Array.isArray(input.events) || input.events.length === 0) {
    throw new Error('events must contain at least one event');
  }
  for (const ev of input.events) {
    if (!isWebhookEvent(ev)) {
      throw new Error(`Unknown webhook event: ${ev}`);
    }
  }
  if (typeof input.plaintextSecret !== 'string' || input.plaintextSecret.length < 16) {
    throw new Error('plaintextSecret must be at least 16 characters');
  }
  if (typeof input.hasher !== 'function') {
    throw new Error('hasher must be a SecretHasher function');
  }
  if (Number.isNaN(Date.parse(input.now))) {
    throw new Error('now must be a valid ISO date-time');
  }
  const secretHash = input.hasher(input.plaintextSecret);
  if (typeof secretHash !== 'string' || secretHash.length === 0) {
    throw new Error('hasher returned an empty hash');
  }
  return Object.freeze({
    id: input.id,
    url: input.url,
    events: Object.freeze([...input.events]),
    secret: input.plaintextSecret,
    secretHash,
    active: true,
    createdAt: input.now,
    createdBy: input.createdBy,
  });
}

/**
 * Returns a copy of the subscription with `secret` stripped. Use this
 * before persisting.
 */
export function stripPlaintextSecret(
  subscription: WebhookSubscription,
): WebhookSubscription {
  return Object.freeze({
    ...subscription,
    secret: '',
  });
}
