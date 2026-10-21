/**
 * Minimal reference sync relay (Node, no dependencies).
 *
 * Purpose
 *   Demonstrate and test the relay contract the mobile client needs:
 *   device registration, membership authorisation, opaque encrypted event
 *   submission/retrieval, per-device acknowledgements, expiry and rate
 *   limiting. It never holds a group key and never decrypts a payload.
 *
 * Deployment status
 *   This is a reference implementation for local verification. It is NOT
 *   wired into the app and NOT deployed. See docs/RELAY_DEPLOYMENT.md for
 *   the trade-offs, free-tier limits and the migration path.
 *
 * Security properties
 *   - Callers prove possession of their device key on every request.
 *   - Events are verified (sender signature + device id binding) before
 *     storage; a member cannot submit as another device.
 *   - Only members can read or acknowledge their group's events.
 *   - Bodies are size-limited; requests are rate-limited per device.
 */

import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { EncryptedSyncEvent } from '@domain/sync-crypto';
import { hashInvitationToken, verifyEventSignature } from '@domain/sync-crypto';

import { DEVICE_ID_HEADER, SIGNATURE_HEADER, verifyRequest } from './request-signature';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_EVENTS = 5_000;
const DEFAULT_MAX_BODY = 64 * 1024;
const DEFAULT_RATE = { max: 120, windowMs: 60_000 } as const;

export interface RelayDevice {
  readonly deviceId: string;
  readonly signingPublicKey: string;
  readonly encryptionPublicKey: string;
}

interface StoredEvent {
  readonly event: EncryptedSyncEvent;
  readonly receivedAt: number;
  readonly ackedBy: Set<string>;
}

interface GroupState {
  /** First member; the only device allowed to remove others. */
  readonly creatorDeviceId: string;
  readonly members: Set<string>;
  readonly events: Map<string, StoredEvent>;
  /** Encrypted group-key wraps addressed to one device. */
  readonly keybox: Map<string, KeyboxEntry>;
  /** Invitation hashes; the raw token is never stored. */
  readonly invites: Map<
    string,
    { readonly tokenHash: string; readonly expiresAt: number; consumedAt?: number }
  >;
}

export interface KeyboxEntry {
  readonly mailboxId: string;
  readonly recipientDeviceId: string;
  readonly submittedBy: string;
  readonly wrapped: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
}

export interface RelayOptions {
  readonly ttlMs?: number;
  readonly maxEventsPerGroup?: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: { readonly max: number; readonly windowMs: number };
  /** Injectable clock for TTL tests. */
  readonly now?: () => number;
}

export interface RelayHandle {
  readonly url: string;
  readonly port: number;
  readonly server: Server;
  close(): Promise<void>;
  /** Counts for assertions; never contains payload plaintext. */
  stats(): {
    readonly devices: number;
    readonly groups: number;
    readonly events: number;
    readonly acked: number;
  };
  expire(nowMs?: number): void;
}

interface RateBucket {
  count: number;
  windowStart: number;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'Request body too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export async function startRelay(options: RelayOptions = {}): Promise<RelayHandle> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEvents = options.maxEventsPerGroup ?? DEFAULT_MAX_EVENTS;
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const rate = options.rateLimit ?? DEFAULT_RATE;
  const now = options.now ?? ((): number => Date.now());

  const devices = new Map<string, RelayDevice>();
  const groups = new Map<string, GroupState>();
  const buckets = new Map<string, RateBucket>();

  function rateLimit(deviceId: string): void {
    const at = now();
    const bucket = buckets.get(deviceId);
    if (bucket === undefined || at - bucket.windowStart >= rate.windowMs) {
      buckets.set(deviceId, { count: 1, windowStart: at });
      return;
    }
    bucket.count += 1;
    if (bucket.count > rate.max) {
      throw new HttpError(429, 'Too many requests for this device.');
    }
  }

  function expire(at = now()): void {
    for (const group of groups.values()) {
      for (const [eventId, stored] of group.events) {
        if (at - stored.receivedAt > ttlMs) group.events.delete(eventId);
      }
    }
  }

  function authenticate(req: IncomingMessage, method: string, path: string, body: string): RelayDevice {
    const deviceId = req.headers[DEVICE_ID_HEADER];
    const signature = req.headers[SIGNATURE_HEADER];
    if (typeof deviceId !== 'string' || typeof signature !== 'string') {
      throw new HttpError(401, 'Missing device credentials.');
    }
    const device = devices.get(deviceId);
    if (device === undefined) throw new HttpError(401, 'Unknown device.');
    rateLimit(deviceId);
    if (!verifyRequest(device.signingPublicKey, method, path, body, signature)) {
      throw new HttpError(401, 'Invalid request signature.');
    }
    return device;
  }

  function requireMember(groupId: string, deviceId: string): GroupState {
    const group = groups.get(groupId);
    if (group === undefined) throw new HttpError(404, 'Group not found on relay.');
    if (!group.members.has(deviceId)) throw new HttpError(403, 'Not a member of this group.');
    return group;
  }

  const server = createServer(async (req, res) => {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', 'http://relay.local');
    const path = url.pathname;

    try {
      if (method === 'GET' && path === '/health') {
        json(res, 200, { ok: true, sdk: 'relay-reference/1' });
        return;
      }

      const body = method === 'GET' ? '' : await readBody(req, maxBody);

      // POST /v1/devices — register a device's public keys.
      if (method === 'POST' && path === '/v1/devices') {
        const parsed = JSON.parse(body) as Partial<RelayDevice>;
        const required: (keyof RelayDevice)[] = [
          'deviceId',
          'signingPublicKey',
          'encryptionPublicKey',
        ];
        if (required.some((key) => typeof parsed[key] !== 'string' || parsed[key]!.length === 0)) {
          throw new HttpError(400, 'deviceId, signingPublicKey and encryptionPublicKey are required.');
        }
        if (devices.has(parsed.deviceId!)) {
          json(res, 200, { deviceId: parsed.deviceId, duplicate: true });
          return;
        }
        devices.set(parsed.deviceId!, {
          deviceId: parsed.deviceId!,
          signingPublicKey: parsed.signingPublicKey!,
          encryptionPublicKey: parsed.encryptionPublicKey!,
        });
        json(res, 201, { deviceId: parsed.deviceId });
        return;
      }

      const inviteMatch = /^\/v1\/groups\/([^/]+)\/invites$/.exec(path);
      if (inviteMatch !== null && method === 'POST') {
        const groupId = decodeURIComponent(inviteMatch[1]!);
        const caller = authenticate(req, method, path, body);
        const group = requireMember(groupId, caller.deviceId);
        const parsed = JSON.parse(body) as {
          invitationId?: string;
          tokenHash?: string;
          expiresAt?: string;
        };
        const expiresAt = Date.parse(parsed.expiresAt ?? '');
        if (
          typeof parsed.invitationId !== 'string' ||
          typeof parsed.tokenHash !== 'string' ||
          !Number.isFinite(expiresAt)
        ) {
          throw new HttpError(400, 'invitationId, tokenHash and expiresAt are required.');
        }
        group.invites.set(parsed.invitationId, {
          tokenHash: parsed.tokenHash,
          expiresAt,
        });
        json(res, 201, { invitationId: parsed.invitationId });
        return;
      }

      const joinMatch = /^\/v1\/groups\/([^/]+)\/join$/.exec(path);
      if (joinMatch !== null && method === 'POST') {
        const groupId = decodeURIComponent(joinMatch[1]!);
        const parsed = JSON.parse(body) as { deviceId?: string; token?: string };
        if (typeof parsed.deviceId !== 'string' || typeof parsed.token !== 'string') {
          throw new HttpError(400, 'deviceId and token are required.');
        }
        const group = groups.get(groupId);
        if (group === undefined) throw new HttpError(404, 'Group not found on relay.');
        if (!devices.has(parsed.deviceId)) throw new HttpError(401, 'Register the device first.');

        const tokenHash = hashInvitationToken(parsed.token);
        const invite = [...group.invites.values()].find(
          (candidate) =>
            candidate.consumedAt === undefined &&
            candidate.expiresAt > now() &&
            candidate.tokenHash === tokenHash,
        );
        if (invite === undefined) throw new HttpError(403, 'Invalid or expired invitation.');
        invite.consumedAt = now();
        group.members.add(parsed.deviceId);
        json(res, 200, { groupId, members: [...group.members] });
        return;
      }

      const keyboxItemMatch = /^\/v1\/groups\/([^/]+)\/keys\/([^/]+)$/.exec(path);
      if (keyboxItemMatch !== null && method === 'DELETE') {
        const groupId = decodeURIComponent(keyboxItemMatch[1]!);
        const mailboxId = decodeURIComponent(keyboxItemMatch[2]!);
        const caller = authenticate(req, method, path, body);
        const group = requireMember(groupId, caller.deviceId);
        const entry = group.keybox.get(mailboxId);
        if (entry === undefined || entry.recipientDeviceId !== caller.deviceId) {
          throw new HttpError(404, 'Key envelope not found.');
        }
        group.keybox.delete(mailboxId);
        json(res, 200, { deleted: mailboxId });
        return;
      }

      const keysMatch = /^\/v1\/groups\/([^/]+)\/keys$/.exec(path);
      if (keysMatch !== null) {
        const groupId = decodeURIComponent(keysMatch[1]!);
        const caller = authenticate(req, method, path, body);
        const group = requireMember(groupId, caller.deviceId);

        if (method === 'POST') {
          const parsed = JSON.parse(body) as {
            recipientDeviceId?: string;
            wrapped?: Record<string, unknown>;
          };
          if (typeof parsed.recipientDeviceId !== 'string' || parsed.wrapped === undefined) {
            throw new HttpError(400, 'recipientDeviceId and wrapped are required.');
          }
          if (!group.members.has(parsed.recipientDeviceId)) {
            throw new HttpError(403, 'Recipient is not an active member of this group.');
          }
          const mailboxId = createHash('sha256')
            .update(`${groupId}:${parsed.recipientDeviceId}:${Date.now()}:${Math.random()}`)
            .digest('hex')
            .slice(0, 24);
          group.keybox.set(mailboxId, {
            mailboxId,
            recipientDeviceId: parsed.recipientDeviceId,
            submittedBy: caller.deviceId,
            wrapped: parsed.wrapped,
            createdAt: now(),
          });
          json(res, 201, { mailboxId });
          return;
        }

        if (method === 'GET') {
          const entries = [...group.keybox.values()].filter(
            (entry) => entry.recipientDeviceId === caller.deviceId,
          );
          json(res, 200, { groupId, keys: entries });
          return;
        }

        json(res, 405, { error: 'Method not allowed.' });
        return;
      }

      const memberMatch = /^\/v1\/groups\/([^/]+)\/members\/([^/]+)$/.exec(path);
      if (memberMatch !== null && method === 'DELETE') {
        const groupId = decodeURIComponent(memberMatch[1]!);
        const targetId = decodeURIComponent(memberMatch[2]!);
        const caller = authenticate(req, method, path, body);
        const group = requireMember(groupId, caller.deviceId);
        if (caller.deviceId !== group.creatorDeviceId) {
          throw new HttpError(403, 'Only the group creator can remove members.');
        }
        if (targetId === group.creatorDeviceId) {
          throw new HttpError(400, 'The creator cannot be removed.');
        }
        group.members.delete(targetId);
        json(res, 200, { groupId, members: [...group.members] });
        return;
      }

      const groupMatch = /^\/v1\/groups\/([^/]+)\/(members|events|acks)$/.exec(path);
      if (groupMatch === null) {
        json(res, 404, { error: 'Not found.' });
        return;
      }
      const groupId = decodeURIComponent(groupMatch[1]!);
      const resource = groupMatch[2]!;
      const caller = authenticate(req, method, path, body);

      if (resource === 'members' && method === 'POST') {
        const parsed = JSON.parse(body) as { deviceId?: string };
        if (typeof parsed.deviceId !== 'string' || parsed.deviceId.length === 0) {
          throw new HttpError(400, 'deviceId is required.');
        }
        let group = groups.get(groupId);
        if (group === undefined) {
          // First member creates the relay entry.
          group = {
            creatorDeviceId: caller.deviceId,
            members: new Set([caller.deviceId]),
            events: new Map(),
            keybox: new Map(),
            invites: new Map(),
          };
          groups.set(groupId, group);
        } else {
          requireMember(groupId, caller.deviceId);
        }
        group.members.add(parsed.deviceId);
        json(res, 200, { groupId, members: [...group.members] });
        return;
      }

      if (resource === 'members' && method === 'GET') {
        const group = requireMember(groupId, caller.deviceId);
        const members = [...group.members]
          .map((id) => devices.get(id))
          .filter((device): device is RelayDevice => device !== undefined);
        json(res, 200, { groupId, members });
        return;
      }

      if (resource === 'events' && method === 'POST') {
        const group = requireMember(groupId, caller.deviceId);
        const parsed = JSON.parse(body) as { event?: EncryptedSyncEvent };
        const event = parsed.event;
        if (event === undefined || typeof event !== 'object') {
          throw new HttpError(400, 'event is required.');
        }
        if (event.header.groupId !== groupId) {
          throw new HttpError(400, 'Event groupId does not match the URL.');
        }
        if (event.header.deviceId !== caller.deviceId) {
          throw new HttpError(403, 'Event sender does not match the authenticated device.');
        }
        if (!verifyEventSignature(event, caller.signingPublicKey)) {
          throw new HttpError(401, 'Event signature is invalid.');
        }
        expire();
        const existing = group.events.get(event.header.eventId);
        if (existing !== undefined) {
          json(res, 200, { eventId: event.header.eventId, duplicate: true });
          return;
        }
        if (group.events.size >= maxEvents) {
          throw new HttpError(507, 'Group event quota reached.');
        }
        group.events.set(event.header.eventId, {
          event,
          receivedAt: now(),
          ackedBy: new Set([caller.deviceId]),
        });
        json(res, 201, { eventId: event.header.eventId, digest: hashBody(body) });
        return;
      }

      if (resource === 'events' && method === 'GET') {
        const group = requireMember(groupId, caller.deviceId);
        expire();
        const since = url.searchParams.get('since');
        const sinceMs = since === null ? 0 : Date.parse(since);
        const limit = Math.min(Number(url.searchParams.get('limit') ?? '100') || 100, 200);
        const events = [...group.events.values()]
          .filter((stored) => !stored.ackedBy.has(caller.deviceId))
          .filter((stored) =>
            since === null || Number.isNaN(sinceMs)
              ? true
              : Date.parse(stored.event.header.createdAt) > sinceMs,
          )
          .sort((a, b) => Date.parse(a.event.header.createdAt) - Date.parse(b.event.header.createdAt))
          .slice(0, limit)
          .map((stored) => stored.event);
        json(res, 200, { groupId, events });
        return;
      }

      if (resource === 'acks' && method === 'POST') {
        const group = requireMember(groupId, caller.deviceId);
        const parsed = JSON.parse(body) as { eventIds?: string[] };
        if (!Array.isArray(parsed.eventIds)) throw new HttpError(400, 'eventIds array is required.');
        const acked: string[] = [];
        for (const eventId of parsed.eventIds) {
          const stored = group.events.get(eventId);
          if (stored === undefined) continue;
          stored.ackedBy.add(caller.deviceId);
          acked.push(eventId);
        }
        json(res, 200, { groupId, acked });
        return;
      }

      json(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
      if (error instanceof HttpError) {
        json(res, error.status, { error: error.message });
        return;
      }
      json(res, 500, { error: 'Relay error.' });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Relay failed to bind a port.');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    server,
    close: (): Promise<void> =>
      new Promise((resolve, reject) => {
        // Drop keep-alive sockets so `close` resolves promptly in tests.
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    stats: () => ({
      devices: devices.size,
      groups: groups.size,
      events: [...groups.values()].reduce((sum, group) => sum + group.events.size, 0),
      acked: [...groups.values()].reduce(
        (sum, group) => sum + [...group.events.values()].filter((e) => e.ackedBy.size > 1).length,
        0,
      ),
    }),
    expire,
  };
}
