/**
 * Durable state for encrypted sync.
 *
 * Everything needed to resume safely after a restart lives here: which
 * events were applied, which are acknowledged, conflicts awaiting a human
 * decision, device membership and key epochs (metadata only — key material
 * stays in SecureStore).
 */

export type ProcessedEventStatus = 'applying' | 'processed' | 'failed' | 'conflict';

export interface ProcessedEventRecord {
  readonly eventId: string;
  readonly groupId: string;
  readonly deviceId: string;
  readonly keyId: string;
  readonly digest: string;
  readonly status: ProcessedEventStatus;
  readonly receivedAt: string;
  readonly processedAt?: string;
  readonly acknowledgedAt?: string;
  readonly error?: string;
}

export interface EncryptedConflictRecord {
  readonly id: string;
  readonly groupId: string;
  readonly eventId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly localVersion: number;
  readonly remoteVersion: number;
  readonly localPayload: string;
  readonly remotePayload: string;
  readonly status: 'unresolved' | 'keep_local' | 'accept_remote';
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface DeviceMembershipRecord {
  readonly groupId: string;
  readonly deviceId: string;
  readonly signingPublicKey: string;
  readonly encryptionPublicKey: string;
  readonly status: 'active' | 'removed';
  readonly addedAt: string;
  readonly removedAt?: string;
}

export interface KeyEpochRecord {
  readonly groupId: string;
  readonly keyId: string;
  readonly createdAt: string;
  readonly retiredAt?: string;
}

export interface EncryptedSyncStore {
  getProcessedEvent(eventId: string): Promise<ProcessedEventRecord | null>;
  /** Mark the start of apply; safe to repeat after a crash. */
  beginProcessing(input: {
    readonly eventId: string;
    readonly groupId: string;
    readonly deviceId: string;
    readonly keyId: string;
    readonly digest: string;
    readonly at: string;
  }): Promise<void>;
  markProcessed(eventId: string, digest: string, at: string): Promise<void>;
  markFailed(eventId: string, error: string, at: string): Promise<void>;
  markConflict(eventId: string, detail: string, at: string): Promise<void>;

  listPendingAcks(groupId: string): Promise<readonly string[]>;
  markAcknowledged(eventIds: readonly string[], at: string): Promise<void>;

  recordConflict(record: EncryptedConflictRecord): Promise<void>;
  listConflicts(groupId: string, status?: EncryptedConflictRecord['status']): Promise<readonly EncryptedConflictRecord[]>;
  resolveConflict(id: string, status: 'keep_local' | 'accept_remote', at: string): Promise<void>;

  upsertMembership(record: DeviceMembershipRecord): Promise<void>;
  listMemberships(groupId: string): Promise<readonly DeviceMembershipRecord[]>;

  putKeyEpoch(record: KeyEpochRecord): Promise<void>;
  listKeyEpochs(groupId: string): Promise<readonly KeyEpochRecord[]>;
  retireKeyEpoch(groupId: string, keyId: string, at: string): Promise<void>;

  saveCursor(groupId: string, deviceId: string, lastCreatedAt: string, at: string): Promise<void>;
  getCursor(groupId: string, deviceId: string): Promise<string | null>;
}
