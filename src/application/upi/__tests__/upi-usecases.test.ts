import { beforeEach, describe, expect, it } from '@jest/globals';

import type {
  PaymentHandleId,
  PaymentHandleType,
  PaymentHandleVerificationStatus,
  MemberId,
  MemberPaymentHandle,
} from '@domain/entities';
import {
  asMemberId,
  asSettlementId,
  asUserId,
  createSettlement,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type {
  MemberPaymentHandleRepository,
} from '@domain/repositories';
import type {
  AuditLogEntry,
} from '@domain/repositories/audit.repository';
import type {
  PaginatedResult,
  Pagination,
  DeleteMetadata,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import type { QrEncoderPort } from '@domain/services/upi/upi-qr-generator';
import type { DateTime } from '@domain/value-objects';
import { asDateTime } from '@domain/value-objects';

import {
  InMemorySettlementRepository,
  InMemoryAuditRepository,
} from '../../settlements/__tests__/_in-memory-repositories';
import {
  GenerateUpiDeepLinkUseCase,
  GenerateUpiQrUseCase,
  HandleUpiReturnUseCase,
  SaveUpiPaymentHandleUseCase,
  SharePaymentRequestUseCase,
  type PaymentHandleEncryptionPort,
} from '../index';


// ── In-memory payment handle repository ──────────────────────────────

class InMemoryPaymentHandleRepository implements MemberPaymentHandleRepository {
  private store = new Map<string, MemberPaymentHandle>();

  seed(h: MemberPaymentHandle): void {
    this.store.set(h.id as string, h);
  }

  async findById(id: PaymentHandleId): Promise<MemberPaymentHandle | null> {
    const h = this.store.get(id as string);
    if (!h || h.deletedAt !== undefined) return null;
    return h;
  }

  async listByMember(
    memberId: MemberId,
    filter?: { readonly type?: PaymentHandleType },
    _pagination?: Pagination,
  ): Promise<PaginatedResult<MemberPaymentHandle>> {
    let items = Array.from(this.store.values()).filter(
      (h) => h.memberId === memberId && h.deletedAt === undefined,
    );
    if (filter?.type) items = items.filter((h) => h.type === filter!.type);
    return { items, hasMore: false };
  }

  async findDefault(
    memberId: MemberId,
    type: PaymentHandleType,
  ): Promise<MemberPaymentHandle | null> {
    return (
      Array.from(this.store.values()).find(
        (h) =>
          h.memberId === memberId &&
          h.type === type &&
          h.isDefault &&
          h.deletedAt === undefined,
      ) ?? null
    );
  }

  async save(handle: MemberPaymentHandle): Promise<void> {
    this.store.set(handle.id as string, handle);
  }

  async markDefault(id: PaymentHandleId, expectedVersion: number): Promise<MemberPaymentHandle> {
    const target = this.store.get(id as string);
    if (!target) throw new Error('handle not found');
    // Clear other defaults of the same (member, type)
    for (const [k, h] of this.store) {
      if (h.memberId === target.memberId && h.type === target.type && h.isDefault) {
        this.store.set(k, { ...h, isDefault: false });
      }
    }
    const updated = { ...target, isDefault: true, version: (expectedVersion + 1) as never };
    this.store.set(id as string, updated);
    return updated;
  }

  async softDelete(id: PaymentHandleId, _metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    const h = this.store.get(id as string);
    if (!h) throw new Error('handle not found');
    const deleted = { ...h, deletedAt: asDateTime('2026-10-12T00:00:00.000Z') as DateTime };
    this.store.set(id as string, deleted);
    return { id: id as string, deletedAt: deleted.deletedAt!, version: deleted.version };
  }

  async updateVerificationStatus(
    id: PaymentHandleId,
    expectedVersion: number,
    newStatus: PaymentHandleVerificationStatus,
    _now?: DateTime,
  ): Promise<MemberPaymentHandle> {
    const h = this.store.get(id as string);
    if (!h) throw new Error('handle not found');
    const updated = {
      ...h,
      verificationStatus: newStatus,
      version: (expectedVersion + 1) as never,
    };
    this.store.set(id as string, updated);
    return updated;
  }
}

// ── Stub encryption port ───────────────────────────────────────────

class StubEncryptionPort implements PaymentHandleEncryptionPort {
  async encrypt(plaintext: string): Promise<{ readonly ciphertext: string; readonly keyId: string }> {
    return { ciphertext: `ENC(${plaintext})`, keyId: 'stub-key-1' };
  }
  async decrypt(ciphertext: string, _keyId: string): Promise<string> {
    // Reverse the stub encryption
    if (ciphertext.startsWith('ENC(') && ciphertext.endsWith(')')) {
      return ciphertext.slice(4, -1);
    }
    return ciphertext;
  }
}

// ── Stub QR encoder ───────────────────────────────────────────────

class StubQrEncoder implements QrEncoderPort {
  async encode(content: string): Promise<string> {
    return `data:image/png;base64,STUB(${content.length})`;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────

const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const LATER = asDateTime('2026-10-11T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const FROM_MEMBER = asMemberId('m-1');
const TO_MEMBER = asMemberId('m-2');

// ── Tests ────────────────────────────────────────────────────────────

describe('Phase 6 Track 4 — UPI application use cases', () => {
  let handles: InMemoryPaymentHandleRepository;
  let settlements: InMemorySettlementRepository;
  let audit: InMemoryAuditRepository;
  let encryption: StubEncryptionPort;

  beforeEach(() => {
    handles = new InMemoryPaymentHandleRepository();
    settlements = new InMemorySettlementRepository();
    audit = new InMemoryAuditRepository();
    encryption = new StubEncryptionPort();
  });

  // ── SaveUpiPaymentHandleUseCase ─────────────────────────────

  describe('SaveUpiPaymentHandleUseCase', () => {
    it('saves a valid UPI VPA handle, masked and encrypted', async () => {
      const useCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      const result = await useCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
        isDefault: true,
      });
      expect(result.maskedVpa).toBe('jo***@oksbi');
      expect(result.isDefault).toBe(true);
      // The handle was saved
      const saved = await handles.findById(result.handleId);
      expect(saved).not.toBeNull();
      expect(saved?.encryptedValue).toBe('ENC(john.doe@oksbi)');
      expect(saved?.encryptionKeyId).toBe('stub-key-1');
    });

    it('rejects an invalid VPA', async () => {
      const useCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      await expect(
        useCase.execute({
          memberId: TO_MEMBER,
          upiVpa: 'not-a-vpa',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('records an audit entry WITHOUT the full VPA', async () => {
      const useCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      await useCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
      });
      expect(audit.entries).toHaveLength(1);
      const entry: AuditLogEntry = audit.entries[0]!;
      const summary = JSON.stringify(entry.changeSummary ?? {});
      // The audit entry contains the masked VPA but NOT the full VPA.
      expect(summary).toContain('jo***@oksbi');
      expect(summary).not.toContain('john.doe@oksbi');
    });
  });

  // ── GenerateUpiDeepLinkUseCase ─────────────────────────────

  describe('GenerateUpiDeepLinkUseCase', () => {
    it('builds a UPI deep link by decrypting the saved VPA', async () => {
      // First save a handle
      const saveUseCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      const saved = await saveUseCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
      });
      // Now build the deep link
      const linkUseCase = new GenerateUpiDeepLinkUseCase(handles, audit, encryption);
      const result = await linkUseCase.execute({
        settlementId: asSettlementId('s-1'),
        payeeHandleId: saved.handleId,
        payeeName: 'John Doe',
        amount: 42.50,
        currencyCode: 'INR',
      });
      expect(result.uri.startsWith('upi://pay?')).toBe(true);
      expect(result.uri).toContain('pa=john.doe%40oksbi');
      expect(result.payeeMaskedVpa).toBe('jo***@oksbi');
    });

    it('rejects a non-INR currency (the spec rule)', async () => {
      const saveUseCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      const saved = await saveUseCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
      });
      const linkUseCase = new GenerateUpiDeepLinkUseCase(handles, audit, encryption);
      await expect(
        linkUseCase.execute({
          settlementId: asSettlementId('s-1'),
          payeeHandleId: saved.handleId,
          payeeName: 'John Doe',
          amount: 42.50,
          currencyCode: 'USD', // not INR
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('rejects a deleted handle', async () => {
      const saveUseCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      const saved = await saveUseCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
      });
      // Soft-delete it
      await handles.softDelete(saved.handleId, {
        actorId: USER_ID,
        deletedAt: LATER,
      });
      const linkUseCase = new GenerateUpiDeepLinkUseCase(handles, audit, encryption);
      await expect(
        linkUseCase.execute({
          settlementId: asSettlementId('s-1'),
          payeeHandleId: saved.handleId,
          payeeName: 'John Doe',
          amount: 42.50,
          currencyCode: 'INR',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('records an audit entry WITHOUT the full VPA or the URI', async () => {
      const saveUseCase = new SaveUpiPaymentHandleUseCase(handles, audit, encryption);
      const saved = await saveUseCase.execute({
        memberId: TO_MEMBER,
        upiVpa: 'john.doe@oksbi',
      });
      audit.entries.length = 0; // clear the save entry

      const linkUseCase = new GenerateUpiDeepLinkUseCase(handles, audit, encryption);
      await linkUseCase.execute({
        settlementId: asSettlementId('s-1'),
        payeeHandleId: saved.handleId,
        payeeName: 'John Doe',
        amount: 42.50,
        currencyCode: 'INR',
      });

      expect(audit.entries).toHaveLength(1);
      const summary = JSON.stringify(audit.entries[0]?.changeSummary ?? {});
      // The audit entry contains the masked VPA but NOT the full VPA
      // or the URI (which contains the full VPA).
      expect(summary).toContain('jo***@oksbi');
      expect(summary).not.toContain('john.doe@oksbi');
      expect(summary).not.toContain('upi://');
    });
  });

  // ── GenerateUpiQrUseCase ───────────────────────────────────

  describe('GenerateUpiQrUseCase', () => {
    it('encodes a UPI URI into a QR data URL', async () => {
      const useCase = new GenerateUpiQrUseCase(new StubQrEncoder());
      const result = await useCase.execute({
        upiUri: 'upi://pay?pa=john.doe%40oksbi&pn=John&am=10&cu=INR',
      });
      expect(result.qrDataUrl.startsWith('data:image/png;base64,STUB')).toBe(true);
    });

    it('rejects a non-upi:// URI', async () => {
      const useCase = new GenerateUpiQrUseCase(new StubQrEncoder());
      await expect(
        useCase.execute({ upiUri: 'https://example.com' }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── SharePaymentRequestUseCase ─────────────────────────────

  describe('SharePaymentRequestUseCase', () => {
    it('builds a shareable message', () => {
      const useCase = new SharePaymentRequestUseCase();
      const result = useCase.execute({
        payerName: 'Jane Doe',
        receiverName: 'John Doe',
        receiverMaskedVpa: 'jo***@oksbi',
        amount: 42.50,
        currencyCode: 'INR',
        groupName: 'Weekend Trip',
        upiUri: 'upi://pay?pa=john.doe%40oksbi&pn=John&am=42.50&cu=INR',
      });
      expect(result.message).toContain('Weekend Trip — Jane Doe → John Doe');
      expect(result.message).toContain('₹42.50');
      expect(result.message).toContain('Pay to: jo***@oksbi');
    });

    it('refuses to embed an unmasked VPA in the message body', () => {
      const useCase = new SharePaymentRequestUseCase();
      expect(() =>
        useCase.execute({
          payerName: 'A',
          receiverName: 'B',
          receiverMaskedVpa: 'john.doe@oksbi', // unmasked — should be refused
          amount: 100,
          currencyCode: 'INR',
          upiUri: 'upi://pay?pa=x&pn=x&am=1&cu=INR',
        }),
      ).toThrow(InvalidEntityError);
    });
  });

  // ── HandleUpiReturnUseCase — the safety-critical one ──────

  describe('HandleUpiReturnUseCase — safety invariant', () => {
    function seedDraftSettlement() {
      const s = createSettlement({
        id: asSettlementId('s-1'),
        groupId: 'group-1' as never,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 4250,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'draft',
      });
      settlements.seed(s);
      return s;
    }

    it('NEVER marks the settlement as completed (the safety rule)', async () => {
      // Run through every input combination and verify the
      // settlement never ends up 'completed'.
      const platformSignals = [
        'returned_to_app',
        'app_failed_to_open',
        'user_cancelled_in_billels',
      ] as const;
      const userStatements: readonly (undefined | 'paid' | 'did_not_pay' | 'unknown')[] = [
        undefined,
        'paid',
        'did_not_pay',
        'unknown',
      ];

      for (const ps of platformSignals) {
        for (const us of userStatements) {
          // Re-seed for each iteration — the settlement must start
          // fresh in `draft` so the state machine can transition.
          const draft = createSettlement({
            id: asSettlementId('s-1'),
            groupId: 'group-1' as never,
            fromMemberId: FROM_MEMBER,
            toMemberId: TO_MEMBER,
            amountMinor: 4250,
            currencyCode: 'INR',
            method: 'upi',
            createdBy: USER_ID,
            now: NOW,
            status: 'draft',
          });
          settlements.seed(draft);

          const useCase = new HandleUpiReturnUseCase(settlements, audit);
          const result = await useCase.execute({
            settlementId: asSettlementId('s-1'),
            platformSignal: ps,
            ...(us !== undefined ? { userStatement: us } : {}),
          });

          // The result kind is one of the two valid ones — never
          // 'completed' or 'payment_completed'.
          expect(
            result.kind === 'returned_pending_confirmation' ||
              result.kind === 'cancelled',
          ).toBe(true);
          expect(result.kind).not.toContain('paid');
          expect(result.kind).not.toContain('completed');

          // The settlement status is also never 'completed'.
          const s = await settlements.findById(asSettlementId('s-1'));
          expect(s?.status).not.toBe('completed');
        }
      }
    });

    it('advances draft → pending_confirmation on returned_to_app + paid', async () => {
      seedDraftSettlement();
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: asSettlementId('s-1'),
        platformSignal: 'returned_to_app',
        userStatement: 'paid',
      });
      expect(result.kind).toBe('returned_pending_confirmation');
      // The settlement is now pending_confirmation, NOT completed
      const s = await settlements.findById(asSettlementId('s-1'));
      expect(s?.status).toBe('pending_confirmation');
    });

    it('leaves the settlement in draft on user_cancelled_in_billels', async () => {
      seedDraftSettlement();
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: asSettlementId('s-1'),
        platformSignal: 'user_cancelled_in_billels',
      });
      expect(result.kind).toBe('cancelled');
      // The settlement stays in draft (no transition)
      const s = await settlements.findById(asSettlementId('s-1'));
      expect(s?.status).toBe('draft');
    });

    it('leaves the settlement in draft on app_failed_to_open', async () => {
      seedDraftSettlement();
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: asSettlementId('s-1'),
        platformSignal: 'app_failed_to_open',
      });
      expect(result.kind).toBe('cancelled');
      const s = await settlements.findById(asSettlementId('s-1'));
      expect(s?.status).toBe('draft');
    });

    it('leaves the settlement in draft when user says did_not_pay', async () => {
      seedDraftSettlement();
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: asSettlementId('s-1'),
        platformSignal: 'returned_to_app',
        userStatement: 'did_not_pay',
      });
      expect(result.kind).toBe('cancelled');
      const s = await settlements.findById(asSettlementId('s-1'));
      expect(s?.status).toBe('draft');
    });

    it('attaches a payment reference hash on returned_pending_confirmation', async () => {
      seedDraftSettlement();
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      const hash = 'a'.repeat(64);
      await useCase.execute({
        settlementId: asSettlementId('s-1'),
        platformSignal: 'returned_to_app',
        userStatement: 'paid',
        paymentReferenceHash: hash,
      });
      const s = await settlements.findById(asSettlementId('s-1'));
      expect(s?.paymentReferenceHash).toBe(hash);
    });

    it('throws when the settlement is not found', async () => {
      const useCase = new HandleUpiReturnUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('does-not-exist'),
          platformSignal: 'returned_to_app',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });
});
