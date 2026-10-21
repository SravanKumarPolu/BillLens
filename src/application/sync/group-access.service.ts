/**
 * Group access: invitations, key delivery, revocation and recovery.
 *
 * Security model without cloud accounts:
 *   - An invitation is a bearer token (hash only on the relay) plus a
 *     group id. It contains no key.
 *   - The invitee registers a device key pair and is added to the relay
 *     group by an existing member.
 *   - An existing member wraps the current group key to the invitee's
 *     X25519 key and leaves it in the relay keybox; only that device can
 *     fetch and unwrap it.
 *   - Removing a member is a relay operation (creator only) followed by a
 *     key rotation; the removed device never receives the new epoch.
 *   - Recovery for a new device is the same re-wrap performed by any
 *     authorised member who still holds the key. Without such a member the
 *     data is unrecoverable — this service cannot invent a key.
 *
 * Key material is returned to the caller for SecureStore; this service
 * persists only epoch metadata.
 */

import type { EncryptedSyncStore } from '@application/sync/encrypted-sync-store.port';
import type {
  DeviceIdentity,
  DevicePublicIdentity,
  GroupKey,
  GroupKeyring,
  WrappedGroupKey,
} from '@domain/sync-crypto';
import {
  GroupKeyring as Keyring,
  assertInvitationUsable,
  createInvitation,
  generateGroupKey,
  hashInvitationToken,
  publicIdentity,
  unwrapGroupKey,
  verifyInvitationToken,
  wrapGroupKey,
  type GroupInvitation,
} from '@domain/sync-crypto';

export interface RelayMemberKeys {
  readonly deviceId: string;
  readonly signingPublicKey: string;
  readonly encryptionPublicKey: string;
}

/** Structural port; the reference relay client satisfies it. */
export interface GroupRelayPort {
  register(): Promise<void>;
  addMember(groupId: string, deviceId: string): Promise<void>;
  createInvite(
    groupId: string,
    invite: { invitationId: string; tokenHash: string; expiresAt: string },
  ): Promise<void>;
  joinGroup(groupId: string, token: string): Promise<void>;
  removeMember(groupId: string, deviceId: string): Promise<void>;
  listMembers(groupId: string): Promise<readonly RelayMemberKeys[]>;
  submitWrappedKey(
    groupId: string,
    recipientDeviceId: string,
    wrapped: Readonly<Record<string, unknown>>,
  ): Promise<{ mailboxId: string }>;
  fetchWrappedKeys(
    groupId: string,
  ): Promise<readonly { mailboxId: string; wrapped: Record<string, unknown> }[]>;
  deleteWrappedKey(groupId: string, mailboxId: string): Promise<void>;
}

export interface GroupAccessDeps {
  readonly identity: DeviceIdentity;
  readonly keyring: GroupKeyring;
  readonly store: EncryptedSyncStore;
  readonly relay: GroupRelayPort;
  readonly now?: () => Date;
}

export class GroupAccessService {
  private readonly now: () => Date;

  constructor(private readonly deps: GroupAccessDeps) {
    this.now = deps.now ?? ((): Date => new Date());
  }

  identity(): DevicePublicIdentity {
    return publicIdentity(this.deps.identity);
  }

  /** Create and register an invitation; share `token` out of band. */
  async createInvite(groupId: string): Promise<GroupInvitation> {
    const invitation = createInvitation({
      groupId,
      inviterDeviceId: this.deps.identity.deviceId,
      now: this.now(),
    });
    await this.deps.relay.createInvite(groupId, {
      invitationId: invitation.invitationId,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
    });
    return invitation;
  }

  /**
   * Accept an invitation: verify the token, register this device and ask
   * the relay to add it to the group. The key is delivered separately by
   * an authorised member (see `deliverKey`).
   */
  async acceptInvite(input: {
    readonly invitation: GroupInvitation;
    readonly token: string;
  }): Promise<void> {
    if (input.invitation.groupId.length === 0) {
      throw new Error('Invitation has no group.');
    }
    if (!verifyInvitationToken(input.token, input.invitation.tokenHash)) {
      throw new Error('Invitation token does not match.');
    }
    assertInvitationUsable(input.invitation, this.now());

    await this.deps.relay.register();
    await this.deps.relay.joinGroup(input.invitation.groupId, input.token);

    await this.deps.store.upsertMembership({
      groupId: input.invitation.groupId,
      deviceId: this.deps.identity.deviceId,
      signingPublicKey: publicIdentity(this.deps.identity).signingPublicKey,
      encryptionPublicKey: publicIdentity(this.deps.identity).encryptionPublicKey,
      status: 'active',
      addedAt: this.now().toISOString(),
    });
  }

  /**
   * Wrap the current epoch for one member device and place it in the
   * relay keybox. The caller must already hold the key.
   */
  async deliverKey(
    groupId: string,
    recipientDeviceId: string,
  ): Promise<{ mailboxId: string; keyId: string }> {
    const members = await this.deps.relay.listMembers(groupId);
    const recipient = members.find((member) => member.deviceId === recipientDeviceId);
    if (recipient === undefined) {
      throw new Error('Recipient is not an active member of this group.');
    }

    const current = this.deps.keyring.currentKey();
    const wrapped = wrapGroupKey(current, recipient.encryptionPublicKey);
    const { mailboxId } = await this.deps.relay.submitWrappedKey(
      groupId,
      recipientDeviceId,
      wrapped as unknown as Record<string, unknown>,
    );
    return { mailboxId, keyId: current.keyId };
  }

  /**
   * Fetch key wraps addressed to this device, unwrap them, add the epochs
   * to the keyring, record metadata and delete the mailbox entry.
   */
  async receiveKeys(groupId: string): Promise<readonly GroupKey[]> {
    const entries = await this.deps.relay.fetchWrappedKeys(groupId);
    const received: GroupKey[] = [];

    for (const entry of entries) {
      const groupKey = unwrapGroupKey(
        entry.wrapped as unknown as WrappedGroupKey,
        this.deps.identity.encryption.privateKey,
      );
      this.deps.keyring.add(groupKey);
      await this.deps.store.putKeyEpoch({
        groupId,
        keyId: groupKey.keyId,
        createdAt: this.now().toISOString(),
      });
      await this.deps.relay.deleteWrappedKey(groupId, entry.mailboxId);
      received.push(groupKey);
    }
    return received;
  }

  /**
   * Remove a member and rotate the group key for everyone who remains.
   * The removed device is not given the new epoch. Only the relay's group
   * creator may remove; the relay enforces it.
   */
  async revokeMember(groupId: string, deviceId: string): Promise<GroupKey> {
    if (deviceId === this.deps.identity.deviceId) {
      throw new Error('Use "leave group" to remove this device.');
    }

    await this.deps.relay.removeMember(groupId, deviceId);
    await this.deps.store.upsertMembership({
      groupId,
      deviceId,
      signingPublicKey: '',
      encryptionPublicKey: '',
      status: 'removed',
      addedAt: this.now().toISOString(),
      removedAt: this.now().toISOString(),
    });

    const previous = this.deps.keyring.currentKey();
    const next = this.deps.keyring.rotate();
    await this.deps.store.retireKeyEpoch(groupId, previous.keyId, this.now().toISOString());
    await this.deps.store.putKeyEpoch({
      groupId,
      keyId: next.keyId,
      createdAt: this.now().toISOString(),
    });

    const remaining = await this.deps.relay.listMembers(groupId);
    for (const member of remaining) {
      if (member.deviceId === this.deps.identity.deviceId) continue;
      await this.deliverKeyFor(groupId, member.deviceId, next);
    }
    return next;
  }

  /**
   * Recovery: an authorised member re-wraps the current key for a new
   * device (fresh install / replaced phone). Fails if this device does not
   * hold a key — there is no server-side recovery.
   */
  async recoverForDevice(groupId: string, recipientDeviceId: string): Promise<{ keyId: string }> {
    if (this.deps.keyring.epochs().length === 0) {
      throw new Error(
        'This device holds no group key. Recovery requires an existing member who still has it.',
      );
    }
    const { keyId } = await this.deliverKey(groupId, recipientDeviceId);
    return { keyId };
  }

  private async deliverKeyFor(groupId: string, recipientDeviceId: string, key: GroupKey): Promise<void> {
    const members = await this.deps.relay.listMembers(groupId);
    const recipient = members.find((member) => member.deviceId === recipientDeviceId);
    if (recipient === undefined) return;
    const wrapped = wrapGroupKey(key, recipient.encryptionPublicKey);
    await this.deps.relay.submitWrappedKey(
      groupId,
      recipientDeviceId,
      wrapped as unknown as Record<string, unknown>,
    );
  }
}

/** Helper for tests/app bootstrap: a keyring seeded with a fresh key. */
export function freshKeyring(key: Uint8Array = generateGroupKey().key): {
  keyring: GroupKeyring;
  key: GroupKey;
} {
  const keyring = new Keyring();
  const groupKey = generateGroupKey(key);
  keyring.add(groupKey);
  return { keyring, key: groupKey };
}

/** Invitation hash helper re-exported for storage layers. */
export { hashInvitationToken };
