/**
 * Relay client — the only code that talks to the relay over HTTP.
 *
 * Signs every request with the device key and keeps the API surface
 * minimal: register, membership, submit, fetch, acknowledge. Events are
 * opaque envelopes; this client never decrypts.
 */

import type { DeviceIdentity, DevicePublicIdentity, EncryptedSyncEvent } from '@domain/sync-crypto';
import { publicIdentity } from '@domain/sync-crypto';

import { signRequest } from './request-signature';

export interface RelayMember {
  readonly deviceId: string;
  readonly signingPublicKey: string;
  readonly encryptionPublicKey: string;
}

export class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body?: string;
  },
) => Promise<FetchLikeResponse>;

export class RelayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly identity: DeviceIdentity,
    // Injectable for tests: Expo's Jest preset replaces global fetch with a
    // native stub, so relay tests pass a Node HTTP adapter instead.
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    pathWithQuery: string,
    body?: unknown,
  ): Promise<T> {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    // The signature covers the pathname (no query string), matching the
    // relay's verifier.
    const pathname = pathWithQuery.split('?')[0] ?? pathWithQuery;
    const headers = signRequest(this.identity, method, pathname, bodyText);
    const response = await this.fetchImpl(`${this.baseUrl}${pathWithQuery}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: bodyText }),
    });
    const text = await response.text();
    const parsed = (text.length > 0 ? JSON.parse(text) : {}) as T & { error?: string };
    if (!response.ok) {
      throw new RelayError(response.status, parsed.error ?? `Relay request failed (${response.status}).`);
    }
    return parsed;
  }

  async register(): Promise<void> {
    const publicKeys: DevicePublicIdentity = publicIdentity(this.identity);
    await this.fetchImpl(`${this.baseUrl}/v1/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(publicKeys),
    }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new RelayError(response.status, `Device registration failed: ${text}`);
      }
    });
  }

  async addMember(groupId: string, deviceId: string): Promise<void> {
    await this.request('POST', `/v1/groups/${encodeURIComponent(groupId)}/members`, { deviceId });
  }

  async removeMember(groupId: string, deviceId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(deviceId)}`,
    );
  }

  async listMembers(groupId: string): Promise<readonly RelayMember[]> {
    const result = await this.request<{ members: RelayMember[] }>(
      'GET',
      `/v1/groups/${encodeURIComponent(groupId)}/members`,
    );
    return result.members;
  }

  async submitEvent(groupId: string, event: EncryptedSyncEvent): Promise<{ duplicate: boolean }> {
    const result = await this.request<{ duplicate?: boolean }>(
      'POST',
      `/v1/groups/${encodeURIComponent(groupId)}/events`,
      { event },
    );
    return { duplicate: result.duplicate === true };
  }

  async fetchEvents(groupId: string, since?: string, limit = 100): Promise<readonly EncryptedSyncEvent[]> {
    const query = new URLSearchParams();
    if (since !== undefined) query.set('since', since);
    query.set('limit', String(limit));
    const result = await this.request<{ events: EncryptedSyncEvent[] }>(
      'GET',
      `/v1/groups/${encodeURIComponent(groupId)}/events?${query.toString()}`,
    );
    return result.events;
  }

  async acknowledge(groupId: string, eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.request('POST', `/v1/groups/${encodeURIComponent(groupId)}/acks`, {
      eventIds: [...eventIds],
    });
  }
}
