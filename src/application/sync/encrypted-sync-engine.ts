/**
 * Encrypted sync engine — pull, verify, decrypt, apply idempotently.
 *
 * Deliberately transport-agnostic: `source` is the relay client (or any
 * implementation of the port). The engine:
 *   1. fetches envelopes the device has not acknowledged,
 *   2. resolves the sender's signing key from the membership map,
 *   3. verifies freshness + signature, decrypts with the event's key epoch,
 *   4. applies the payload through a callback (the use case that writes
 *      SQLite),
 *   5. records the event id and acknowledges it to the relay.
 *
 * Idempotency: `processed` holds event ids this device has applied. The
 * app must persist that set (a table or the existing sync queue); this
 * class is intentionally storage-free so it can be tested on two
 * independent databases.
 *
 * Failure semantics: an unknown sender, wrong epoch, stale timestamp or
 * bad signature throws before `apply` is called. Nothing is acknowledged
 * on failure, so a later pull retries the same envelope.
 */

import type { EncryptedSyncEvent, GroupKeyring } from '@domain/sync-crypto';
import {
  assertFreshness,
  eventDigest,
  openEncryptedEvent,
} from '@domain/sync-crypto';

import type { EncryptedSyncStore } from './encrypted-sync-store.port';
import { FinancialConflictError } from './financial-conflict';

export interface EncryptedEventSource {
  fetchEvents(groupId: string): Promise<readonly EncryptedSyncEvent[]>;
  acknowledge(groupId: string, eventIds: readonly string[]): Promise<void>;
}

export interface EncryptedSyncEngineInput {
  readonly groupId: string;
  readonly keyring: GroupKeyring;
  /** deviceId → Ed25519 public key (hex), from relay membership. */
  readonly memberSigningKeys: ReadonlyMap<string, string>;
  readonly source: EncryptedEventSource;
  readonly apply: (payload: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly processed?: Set<string>;
  readonly now?: () => Date;
  /** When present, processed state survives restarts. */
  readonly store?: EncryptedSyncStore;
}

export interface PullResult {
  readonly applied: number;
  readonly skipped: number;
  readonly conflicts: number;
}

export class EncryptedSyncEngine {
  private readonly processed: Set<string>;

  constructor(private readonly input: EncryptedSyncEngineInput) {
    this.processed = input.processed ?? new Set<string>();
  }

  /** Event ids applied by this device (persist this in the app). */
  processedEventIds(): readonly string[] {
    return [...this.processed];
  }

  async pullOnce(): Promise<PullResult> {
    const events = await this.input.source.fetchEvents(this.input.groupId);
    const acknowledged: string[] = [];
    let applied = 0;
    let skipped = 0;
    let conflicts = 0;
    const now = this.input.now ?? ((): Date => new Date());

    for (const event of events) {
      const eventId = event.header.eventId;
      if (this.input.store !== undefined) {
        const record = await this.input.store.getProcessedEvent(eventId);
        if (record?.status === 'processed' || record?.status === 'conflict') {
          skipped += 1;
          acknowledged.push(eventId);
          continue;
        }
        await this.input.store.beginProcessing({
          eventId,
          groupId: event.header.groupId,
          deviceId: event.header.deviceId,
          keyId: event.header.keyId,
          digest: eventDigest(event),
          at: now().toISOString(),
        });
      } else if (this.processed.has(eventId)) {
        skipped += 1;
        acknowledged.push(eventId);
        continue;
      }

      const signingKey = this.input.memberSigningKeys.get(event.header.deviceId);
      if (signingKey === undefined) {
        throw new Error(`Unknown sender device: ${event.header.deviceId}`);
      }

      assertFreshness(event.header, now());

      try {
        const opened = openEncryptedEvent(event, {
          senderSigningPublicKey: signingKey,
          groupKey: {
            keyId: event.header.keyId,
            key: this.input.keyring.get(event.header.keyId),
          },
        });

        await this.input.apply(opened.payload);
      } catch (error) {
        if (error instanceof FinancialConflictError) {
          const at = now().toISOString();
          if (this.input.store !== undefined) {
            await this.input.store.recordConflict({
              id: `${eventId}:${error.conflict.entityId}`,
              groupId: this.input.groupId,
              eventId,
              entityType: error.conflict.entityType,
              entityId: error.conflict.entityId,
              localVersion: error.conflict.localVersion,
              remoteVersion: error.conflict.remoteVersion,
              localPayload: error.conflict.localPayload,
              remotePayload: error.conflict.remotePayload,
              status: 'unresolved',
              createdAt: at,
            });
            await this.input.store.markConflict(eventId, error.conflict.reason, at);
          }
          this.processed.add(eventId);
          acknowledged.push(eventId);
          conflicts += 1;
          continue;
        }

        if (this.input.store !== undefined) {
          await this.input.store.markFailed(
            eventId,
            error instanceof Error ? error.message : String(error),
            now().toISOString(),
          );
        }
        throw error;
      }

      if (this.input.store !== undefined) {
        await this.input.store.markProcessed(eventId, eventDigest(event), now().toISOString());
      }
      this.processed.add(eventId);
      acknowledged.push(eventId);
      applied += 1;
    }

    if (acknowledged.length > 0) {
      await this.input.source.acknowledge(this.input.groupId, acknowledged);
      if (this.input.store !== undefined) {
        await this.input.store.markAcknowledged(acknowledged, now().toISOString());
      }
    }
    return { applied, skipped, conflicts };
  }
}
