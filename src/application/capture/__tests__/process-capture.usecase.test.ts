/**
 * ProcessCaptureUseCase tests — the capture → OCR → draft pipeline
 * orchestration (v2.4.0).
 *
 * Uses in-memory repository doubles + a fake processor, exactly like the
 * application layer's other use-case tests (no native modules).
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import {
  buildReviewedDraft,
  draftSourceFor,
  CapturePipelineError,
  ProcessCaptureUseCase,
  type ImageDataReader,
  type ImageHasher,
  type CapturedImageData,
} from '@application/capture';
import {
  asCaptureSourceId,
  asExpenseDraftId,
  createExtractionResult,
  updateProcessingStatus,
  createExpenseDraft,
  startProcessing,
} from '@domain/entities';
import type {
  CaptureSource,
  CaptureProcessingStatus,
} from '@domain/entities/capture-source';
import type { ExpenseDraft } from '@domain/entities/expense-draft';
import type { ExtractionResult } from '@domain/entities/extraction-result';
import type { CaptureProcessor } from '@domain/ports/capture-processor.port';
import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from '@domain/repositories';
import type { CaptureSourceRepository } from '@domain/repositories/capture-source.repository';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { ExtractionResultRepository } from '@domain/repositories/extraction-result.repository';
import {
  createExtractedField,
  asExtractionConfidence,
  nowDateTime,
} from '@domain/value-objects';
import type { CaptureSourceId, ExtractionResultId, UserId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// In-memory doubles
// ---------------------------------------------------------------------------

class InMemoryCaptureSourceRepository implements CaptureSourceRepository {
  readonly store = new Map<string, CaptureSource>();

  async findById(id: CaptureSourceId) {
    return this.store.get(id as string) ?? null;
  }
  async findByImageHash(hash: string) {
    for (const source of this.store.values()) {
      if (source.imageHash === hash) return source;
    }
    return null;
  }
  async listByStatus(status: CaptureProcessingStatus, pagination: Pagination): Promise<PaginatedResult<CaptureSource>> {
    const items = Array.from(this.store.values()).filter((s) => s.processingStatus === status);
    return { items: items.slice(0, pagination.limit), hasMore: false };
  }
  async listByUser(userId: UserId, pagination: Pagination): Promise<PaginatedResult<CaptureSource>> {
    const items = Array.from(this.store.values()).filter((s) => s.capturedBy === userId);
    return { items: items.slice(0, pagination.limit), hasMore: false };
  }
  async listUpdatedSince(): Promise<PaginatedResult<CaptureSource>> {
    return { items: [], hasMore: false };
  }
  async save(source: CaptureSource) {
    this.store.set(source.id as string, source);
  }
  async updateProcessingStatus(id: CaptureSourceId, status: CaptureProcessingStatus, error?: string) {
    const existing = this.store.get(id as string);
    if (existing) {
      this.store.set(id as string, updateProcessingStatus(existing, status, error));
    }
  }
  async softDelete(id: CaptureSourceId, _metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    this.store.delete(id as string);
    return { id: id as string, deletedAt: nowDateTime(), version: 1 as never };
  }
}

class InMemoryExtractionResultRepository implements ExtractionResultRepository {
  readonly store = new Map<string, ExtractionResult>();

  async findById(id: ExtractionResultId) {
    return this.store.get(id as string) ?? null;
  }
  async findByCaptureSource(captureSourceId: CaptureSourceId) {
    for (const result of this.store.values()) {
      if (result.captureSourceId === captureSourceId) return result;
    }
    return null;
  }
  async save(result: ExtractionResult) {
    if (this.store.has(result.id as string)) return; // immutable replay
    this.store.set(result.id as string, result);
  }
  async softDelete(id: ExtractionResultId, _metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    this.store.delete(id as string);
    return { id: id as string, deletedAt: nowDateTime(), version: 1 as never };
  }
}

class InMemoryDraftRepository implements ExpenseDraftRepository {
  readonly store = new Map<string, ExpenseDraft>();

  async findById(id: Parameters<ExpenseDraftRepository['findById']>[0]) {
    return this.store.get(id as string) ?? null;
  }
  async listByGroup(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async listByStatus(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async listByCaptureSource(captureSourceId: string) {
    return Array.from(this.store.values()).filter(
      (d) => (d.captureSourceId as string) === captureSourceId,
    );
  }
  async listUpdatedSince(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async save(draft: ExpenseDraft) {
    this.store.set(draft.id as string, draft);
  }
  async softDelete(id: Parameters<ExpenseDraftRepository['findById']>[0]): Promise<SoftDeleteResult> {
    this.store.delete(id as string);
    return { id: id as string, deletedAt: nowDateTime(), version: 1 as never };
  }
}

/** Fake processor returning canned results or throwing on demand. */
class FakeProcessor implements CaptureProcessor {
  constructor(
    private readonly result: ExtractionResult,
    private readonly shouldThrow?: (call: number) => unknown,
  ) {}
  callCount = 0;

  async process(): Promise<ExtractionResult> {
    this.callCount += 1;
    if (this.shouldThrow !== undefined) {
      const error = this.shouldThrow(this.callCount);
      if (error !== undefined) throw error;
    }
    return this.result;
  }
}

const IMAGE_URI = 'file:///receipts/test.jpg';
const USER_ID = 'local-user' as UserId;

function makeImageData(overrides?: Partial<CapturedImageData>): CapturedImageData {
  return {
    base64: 'aGVsbG8gd29ybGQ=',
    sizeBytes: 1024 * 300,
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

function makeReader(data: CapturedImageData = makeImageData()): ImageDataReader & { data: CapturedImageData } {
  return {
    data,
    read: async () => data,
  };
}

function makeHasher(): ImageHasher {
  return { hashImageBase64: async (b64) => `sha256-b64:${b64.length}` };
}

/** A healthy high-confidence extraction result. */
function healthyExtraction(captureSourceId: CaptureSourceId): ExtractionResult {
  return createExtractionResult({
    id: 'ext-1' as never,
    captureSourceId,
    merchant: createExtractedField('Paradise Biryani', asExtractionConfidence(0.95)),
    date: createExtractedField('2026-07-29', asExtractionConfidence(0.9)),
    currencyCode: createExtractedField('INR', asExtractionConfidence(0.98)),
    subtotal: createExtractedField(950, asExtractionConfidence(0.85)),
    tax: createExtractedField(50, asExtractionConfidence(0.8)),
    total: createExtractedField(1000, asExtractionConfidence(0.92)),
    lineItems: [
      {
        id: 'item-1',
        name: createExtractedField('Biryani', asExtractionConfidence(0.9)),
        quantity: createExtractedField(2, asExtractionConfidence(0.9)),
        unitPriceMinor: createExtractedField(350, asExtractionConfidence(0.9)),
        totalAmountMinor: createExtractedField(700, asExtractionConfidence(0.9)),
      },
      {
        id: 'item-2',
        name: createExtractedField('Coke', asExtractionConfidence(0.8)),
        quantity: createExtractedField(1, asExtractionConfidence(0.9)),
        unitPriceMinor: createExtractedField(250, asExtractionConfidence(0.9)),
        totalAmountMinor: createExtractedField(250, asExtractionConfidence(0.9)),
      },
    ],
    overallConfidence: asExtractionConfidence(0.9),
    totalMatches: true,
  });
}

function makeFixture(processor: CaptureProcessor) {
  const captureSources = new InMemoryCaptureSourceRepository();
  const extractionResults = new InMemoryExtractionResultRepository();
  const drafts = new InMemoryDraftRepository();
  const useCase = new ProcessCaptureUseCase(
    captureSources,
    extractionResults,
    drafts,
    processor,
    makeReader(),
    makeHasher(),
  );
  return { captureSources, extractionResults, drafts, useCase };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessCaptureUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the full pipeline: capture → extraction → reviewable draft', async () => {
    const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')));
    const fx = makeFixture(processor);

    const output = await fx.useCase.execute({
      imageUri: IMAGE_URI,
      sourceType: 'paper_receipt',
      userId: USER_ID,
    });

    expect(output.outcome).toBe('completed');
    expect(output.isDuplicateImage).toBe(false);

    // Capture source persisted and completed.
    const source = fx.captureSources.store.get(output.captureSourceId as string);
    expect(source?.processingStatus).toBe('completed');
    expect(source?.imageHash).toBe(`sha256-b64:${makeImageData().base64.length}`);
    expect(source?.fileSizeBytes).toBe(makeImageData().sizeBytes);
    expect(source?.mimeType).toBe('image/jpeg');

    // Extraction result persisted (immutable).
    const extraction = fx.extractionResults.store.get(output.draftId as string)
      ? await fx.extractionResults.findByCaptureSource(output.captureSourceId)
      : await fx.extractionResults.findByCaptureSource(output.captureSourceId);
    expect(extraction).not.toBeNull();
    expect(extraction?.total.value).toBe(1000);

    // Draft persisted in needs_review/ready with mapped fields.
    const draft = fx.drafts.store.get(output.draftId as string);
    expect(draft).toBeDefined();
    expect(draft?.status === 'ready' || draft?.status === 'needs_review').toBe(true);
    expect(draft?.title).toBe('Paradise Biryani');
    expect(draft?.merchantName).toBe('Paradise Biryani');
    expect(draft?.amountMinor).toBe(1000);
    expect(draft?.currencyCode).toBe('INR');
    expect(draft?.expenseDate).toBe('2026-07-29');
    expect(draft?.lineItems).toHaveLength(2);
    expect(draft?.charges).toHaveLength(1); // tax charge
    expect(draft?.charges[0]?.type).toBe('tax');
    expect(draft?.captureSourceId).toBe(output.captureSourceId);
    expect(draft?.extractionResultId).toBe(extraction?.id);
  });

  it('surfaces a total-mismatch as a blocking draft issue instead of failing', async () => {
    const mismatched = {
      ...healthyExtraction(asCaptureSourceId('any')),
      totalMatches: false,
    } as unknown as ExtractionResult;
    const fx = makeFixture(new FakeProcessor(mismatched));

    const output = await fx.useCase.execute({
      imageUri: IMAGE_URI,
      sourceType: 'paper_receipt',
      userId: USER_ID,
    });

    expect(output.outcome).toBe('completed');
    const draft = fx.drafts.store.get(output.draftId as string);
    expect(draft?.status).toBe('needs_review');
    expect(draft?.unresolvedIssues.some((i) => i.issueType === 'total_mismatch' && i.severity === 'error')).toBe(
      true,
    );
  });

  it('flags low overall confidence for careful review', async () => {
    const lowConfidence = {
      ...healthyExtraction(asCaptureSourceId('any')),
      overallConfidence: asExtractionConfidence(0.4),
    } as unknown as ExtractionResult;
    const fx = makeFixture(new FakeProcessor(lowConfidence));

    const output = await fx.useCase.execute({
      imageUri: IMAGE_URI,
      sourceType: 'paper_receipt',
      userId: USER_ID,
    });

    const draft = fx.drafts.store.get(output.draftId as string);
    expect(draft?.unresolvedIssues.some((i) => i.issueType === 'low_confidence')).toBe(true);
  });

  it('maps payment screenshots to payment_screenshot drafts', async () => {
    const fx = makeFixture(new FakeProcessor(healthyExtraction(asCaptureSourceId('any'))));
    const output = await fx.useCase.execute({
      imageUri: IMAGE_URI,
      sourceType: 'upi_screenshot',
      userId: USER_ID,
    });
    const draft = fx.drafts.store.get(output.draftId as string);
    expect(draft?.source).toBe('payment_screenshot');
  });

  it('rejects images above the size budget before any OCR call', async () => {
    const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')));
    const captureSources = new InMemoryCaptureSourceRepository();
    const extractionResults = new InMemoryExtractionResultRepository();
    const drafts = new InMemoryDraftRepository();
    const useCase = new ProcessCaptureUseCase(
      captureSources,
      extractionResults,
      drafts,
      processor,
      makeReader(makeImageData({ sizeBytes: 11 * 1024 * 1024 })),
      makeHasher(),
    );

    await expect(
      useCase.execute({ imageUri: IMAGE_URI, sourceType: 'paper_receipt', userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(processor.callCount).toBe(0); // no paid OCR round-trip
    expect(captureSources.store.size).toBe(0); // nothing persisted
  });

  it('wraps unreadable images in a typed error', async () => {
    const failingReader: ImageDataReader = {
      read: async () => {
        throw new Error('ENOENT');
      },
    };
    const useCase = new ProcessCaptureUseCase(
      new InMemoryCaptureSourceRepository(),
      new InMemoryExtractionResultRepository(),
      new InMemoryDraftRepository(),
      new FakeProcessor(healthyExtraction(asCaptureSourceId('any'))),
      failingReader,
      makeHasher(),
    );

    await expect(
      useCase.execute({ imageUri: IMAGE_URI, sourceType: 'paper_receipt', userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'IMAGE_READ_FAILED' });
  });

  describe('duplicate detection', () => {
    it('returns duplicate when the same image was completed and its draft is reviewable', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')));
      const fx = makeFixture(processor);

      const first = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });
      expect(first.outcome).toBe('completed');

      // Second scan of the SAME image bytes.
      const second = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });
      expect(second.outcome).toBe('duplicate');
      expect(second.draftId).toBe(first.draftId);
      expect(second.duplicateOf).toBe(first.captureSourceId);
      expect(processor.callCount).toBe(1); // no second OCR round-trip
    });

    it('returns already_processing while a run is in flight', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')));
      const fx = makeFixture(processor);

      const first = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });

      // Simulate an in-flight run: reset the source to processing and the
      // draft to needs_review (as if the pipeline is mid-flight).
      const source = fx.captureSources.store.get(first.captureSourceId as string)!;
      fx.captureSources.store.set(
        first.captureSourceId as string,
        updateProcessingStatus(source, 'processing'),
      );

      const second = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });
      expect(second.outcome).toBe('already_processing');
    });

    it('allows a re-scan after the first draft was confirmed', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')));
      const fx = makeFixture(processor);

      const first = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });

      // Confirm the draft (terminal state).
      const draft = fx.drafts.store.get(first.draftId as string)!;
      fx.drafts.store.set(first.draftId as string, {
        ...draft,
        status: 'confirmed',
      });

      const second = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });
      expect(second.outcome).toBe('completed');
      expect(second.draftId).not.toBe(first.draftId);
      expect(second.isDuplicateImage).toBe(true); // hash matched, re-scan allowed
    });
  });

  describe('failure handling', () => {
    it('marks the capture failed, discards the pipeline draft, and throws typed', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')), () =>
        new Error('provider down'),
      );
      const fx = makeFixture(processor);

      await expect(
        fx.useCase.execute({ imageUri: IMAGE_URI, sourceType: 'paper_receipt', userId: USER_ID }),
      ).rejects.toBeInstanceOf(CapturePipelineError);

      // Capture source exists, marked failed with the reason.
      const sources = Array.from(fx.captureSources.store.values());
      expect(sources).toHaveLength(1);
      expect(sources[0]?.processingStatus).toBe('failed');
      expect(sources[0]?.processingError).toContain('provider down');

      // No extraction persisted; the pipeline draft was discarded.
      expect(fx.extractionResults.store.size).toBe(0);
      const drafts = Array.from(fx.drafts.store.values());
      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.status).toBe('discarded');
    });

    it('resolves with cancelled (not a throw) when the signal aborts', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')), () => {
        const err = new Error('The user aborted the operation');
        err.name = 'AbortError';
        return err;
      });
      const fx = makeFixture(processor);
      const controller = new AbortController();
      controller.abort();

      const output = await fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
        signal: controller.signal,
      });

      expect(output.outcome).toBe('cancelled');
      const sources = Array.from(fx.captureSources.store.values());
      expect(sources[0]?.processingStatus).toBe('cancelled');
    });

    // --- v2.5.0: production OCR guard — unconfigured provider fails LOUD ----

    it('maps a NOT_CONFIGURED processor failure to OCR_UNAVAILABLE (not OCR_FAILED)', async () => {
      // Mirrors UnavailableCaptureProcessor's typed error shape without
      // importing infrastructure (the application layer stays clean).
      const notConfigured = Object.assign(
        new Error(
          'Receipt scanning is not available in this build: no OCR provider is configured.',
        ),
        { name: 'OcrCaptureError', code: 'NOT_CONFIGURED', retriable: false },
      );
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')), () => notConfigured);
      const fx = makeFixture(processor);

      const promise = fx.useCase.execute({
        imageUri: IMAGE_URI,
        sourceType: 'paper_receipt',
        userId: USER_ID,
      });

      await expect(promise).rejects.toMatchObject({
        name: 'CapturePipelineError',
        code: 'OCR_UNAVAILABLE',
      });

      // Same cleanup semantics as a normal failure: capture marked failed
      // (honestly, with the config reason), no half-populated drafts.
      const sources = Array.from(fx.captureSources.store.values());
      expect(sources[0]?.processingStatus).toBe('failed');
      expect(sources[0]?.processingError).toContain('no OCR provider is configured');
      const drafts = Array.from(fx.drafts.store.values());
      expect(drafts[0]?.status).toBe('discarded');
      expect(fx.extractionResults.store.size).toBe(0);
    });

    it('keeps OCR_FAILED for ordinary processor errors', async () => {
      const processor = new FakeProcessor(healthyExtraction(asCaptureSourceId('any')), () =>
        new Error('provider exploded'),
      );
      const fx = makeFixture(processor);

      await expect(
        fx.useCase.execute({ imageUri: IMAGE_URI, sourceType: 'paper_receipt', userId: USER_ID }),
      ).rejects.toMatchObject({ name: 'CapturePipelineError', code: 'OCR_FAILED' });
    });
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('draftSourceFor', () => {
  it('maps payment screenshots to payment_screenshot', () => {
    expect(draftSourceFor('upi_screenshot')).toBe('payment_screenshot');
    expect(draftSourceFor('card_screenshot')).toBe('payment_screenshot');
    expect(draftSourceFor('bank_screenshot')).toBe('payment_screenshot');
  });
  it('maps digital invoices to invoice', () => {
    expect(draftSourceFor('digital_invoice')).toBe('invoice');
  });
  it('maps everything else to receipt', () => {
    expect(draftSourceFor('paper_receipt')).toBe('receipt');
    expect(draftSourceFor('gallery_image')).toBe('receipt');
    expect(draftSourceFor('shared_image')).toBe('receipt');
  });
});

describe('buildReviewedDraft', () => {
  // The pipeline draft arrives in 'processing' status (startProcessing
  // already applied); buildReviewedDraft applies completeProcessing.
  const pipelineDraft = startProcessing(
    createExpenseDraft({
      id: asExpenseDraftId('draft-x'),
      source: 'receipt',
      createdBy: USER_ID,
    }),
    { expectedVersion: 1 },
  );

  it('carries tip into a DraftCharge', () => {
    const extraction = {
      ...healthyExtraction(asCaptureSourceId('any')),
      tip: createExtractedField(100, asExtractionConfidence(0.9)),
    } as unknown as ExtractionResult;
    const draft = buildReviewedDraft(pipelineDraft, extraction, nowDateTime());
    expect(draft.charges.some((c) => c.type === 'tip' && c.amountMinor === 100)).toBe(true);
  });

  it('flags a future receipt date for review', () => {
    const extraction = {
      ...healthyExtraction(asCaptureSourceId('any')),
      date: createExtractedField('2999-01-01', asExtractionConfidence(0.9)),
    } as unknown as ExtractionResult;
    const draft = buildReviewedDraft(pipelineDraft, extraction, nowDateTime());
    expect(draft.unresolvedIssues.some((i) => i.issueType === 'date_in_future')).toBe(true);
  });

  it('errors on a missing total', () => {
    const extraction = {
      ...healthyExtraction(asCaptureSourceId('any')),
      total: createExtractedField(undefined, asExtractionConfidence(0.1)),
      subtotal: createExtractedField(undefined, asExtractionConfidence(0.1)),
    } as unknown as ExtractionResult;
    const draft = buildReviewedDraft(pipelineDraft, extraction, nowDateTime());
    expect(draft.status).toBe('needs_review');
    expect(draft.unresolvedIssues.some((i) => i.issueType === 'missing_field' && i.fieldName === 'amountMinor')).toBe(
      true,
    );
  });
});
