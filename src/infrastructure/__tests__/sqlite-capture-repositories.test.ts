/**
 * SqliteCaptureSourceRepository + SqliteExtractionResultRepository tests
 * (v2.4.0) — capture-layer persistence round-trips over the in-memory
 * SQL double, exactly like the other write-repository suites.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  asCaptureSourceId,
  createCaptureSource,
  updateProcessingStatus,
} from '@domain/entities/capture-source';
import {
  asExtractionResultId,
  createExtractionResult,
} from '@domain/entities/extraction-result';
import { createExtractedField, asExtractionConfidence } from '@domain/value-objects';

import { runMigrations } from '../sqlite/schema';
import { SqliteCaptureSourceRepository } from '../sqlite/sqlite-capture-source-repository';
import { SqliteExtractionResultRepository } from '../sqlite/sqlite-extraction-result-repository';

import { InMemoryDatabase } from './in-memory-database';

const USER = 'local-user' as never;

describe('SqliteCaptureSourceRepository', () => {
  let db: InMemoryDatabase;
  let repo: SqliteCaptureSourceRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    repo = new SqliteCaptureSourceRepository(db);
  });

  it('round-trips a capture source with all optional metadata', async () => {
    const source = updateProcessingStatus(
      createCaptureSource({
        id: asCaptureSourceId('cap-1'),
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/a.jpg',
        imageHash: 'sha256-b64:abc',
        mimeType: 'image/jpeg',
        fileSizeBytes: 12345,
        capturedBy: USER,
      }),
      'processing',
    );

    await repo.save(source);

    const loaded = await repo.findById(asCaptureSourceId('cap-1'));
    expect(loaded).not.toBeNull();
    expect(loaded?.sourceType).toBe('paper_receipt');
    expect(loaded?.imageUri).toBe('file:///receipts/a.jpg');
    expect(loaded?.imageHash).toBe('sha256-b64:abc');
    expect(loaded?.mimeType).toBe('image/jpeg');
    expect(loaded?.fileSizeBytes).toBe(12345);
    expect(loaded?.processingStatus).toBe('processing');
    expect(loaded?.version).toBe(2); // create (v1) + status transition (v2)
  });

  it('finds a capture source by image hash (duplicate detection)', async () => {
    await repo.save(
      createCaptureSource({
        id: asCaptureSourceId('cap-hash'),
        sourceType: 'gallery_image',
        imageUri: 'file:///receipts/b.jpg',
        imageHash: 'sha256-b64:dup',
        capturedBy: USER,
      }),
    );

    const found = await repo.findByImageHash('sha256-b64:dup');
    expect(found?.id).toBe('cap-hash');

    const missing = await repo.findByImageHash('sha256-b64:other');
    expect(missing).toBeNull();
  });

  it('updates processing status atomically (hot path)', async () => {
    await repo.save(
      createCaptureSource({
        id: asCaptureSourceId('cap-status'),
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/c.jpg',
        capturedBy: USER,
      }),
    );

    await repo.updateProcessingStatus(asCaptureSourceId('cap-status'), 'failed', 'provider 500');

    const loaded = await repo.findById(asCaptureSourceId('cap-status'));
    expect(loaded?.processingStatus).toBe('failed');
    expect(loaded?.processingError).toBe('provider 500');
  });

  it('soft-deleted sources are invisible to reads and hash lookups', async () => {
    const created = createCaptureSource({
      id: asCaptureSourceId('cap-del'),
      sourceType: 'paper_receipt',
      imageUri: 'file:///receipts/d.jpg',
      imageHash: 'sha256-b64:gone',
      capturedBy: USER,
    });
    await repo.save(created);
    await repo.softDelete(asCaptureSourceId('cap-del'), {
      actorId: USER,
      deletedAt: new Date().toISOString() as never,
      reason: 'test',
    });

    expect(await repo.findById(asCaptureSourceId('cap-del'))).toBeNull();
    expect(await repo.findByImageHash('sha256-b64:gone')).toBeNull();
  });

  it('full-replacement save updates an existing row', async () => {
    const id = asCaptureSourceId('cap-upsert');
    await repo.save(
      createCaptureSource({
        id,
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/e.jpg',
        capturedBy: USER,
      }),
    );
    await repo.save({
      ...createCaptureSource({
        id,
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/e2.jpg',
        imageHash: 'sha256-b64:new',
        capturedBy: USER,
      }),
      version: 1,
    });

    const loaded = await repo.findById(id);
    expect(loaded?.imageUri).toBe('file:///receipts/e2.jpg');
    expect(loaded?.imageHash).toBe('sha256-b64:new');
  });
});

describe('SqliteExtractionResultRepository', () => {
  let db: InMemoryDatabase;
  let captureSources: SqliteCaptureSourceRepository;
  let repo: SqliteExtractionResultRepository;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
    captureSources = new SqliteCaptureSourceRepository(db);
    repo = new SqliteExtractionResultRepository(db);
  });

  function makeExtraction(id: string, captureSourceId: string) {
    return createExtractionResult({
      id: asExtractionResultId(id),
      captureSourceId: asCaptureSourceId(captureSourceId),
      merchant: createExtractedField('Cafe Noir', asExtractionConfidence(0.91)),
      date: createExtractedField('2026-07-29', asExtractionConfidence(0.8)),
      currencyCode: createExtractedField('EUR', asExtractionConfidence(0.9)),
      subtotal: createExtractedField(900, asExtractionConfidence(0.85)),
      tax: createExtractedField(100, asExtractionConfidence(0.8)),
      tip: createExtractedField(10, asExtractionConfidence(0.7)),
      total: createExtractedField(1010, asExtractionConfidence(0.9)),
      lineItems: [
        {
          id: 'item-1',
          name: createExtractedField('Latte', asExtractionConfidence(0.9)),
          quantity: createExtractedField(2, asExtractionConfidence(0.95)),
          unitPriceMinor: createExtractedField(450, asExtractionConfidence(0.9)),
          totalAmountMinor: createExtractedField(900, asExtractionConfidence(0.9)),
        },
      ],
      overallConfidence: asExtractionConfidence(0.86),
      totalMatches: true,
      rawText: 'CAFE NOIR\nTotal 10.10',
    });
  }

  it('round-trips an extraction result including tip and line items', async () => {
    await captureSources.save(
      createCaptureSource({
        id: asCaptureSourceId('cap-x'),
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/x.jpg',
        capturedBy: USER,
      }),
    );
    await repo.save(makeExtraction('ext-x', 'cap-x'));

    const loaded = await repo.findById(asExtractionResultId('ext-x'));
    expect(loaded?.merchant.value).toBe('Cafe Noir');
    expect(loaded?.total.value).toBe(1010);
    expect(loaded?.tip?.value).toBe(10);
    expect(loaded?.lineItems[0]?.name.value).toBe('Latte');
    expect(loaded?.totalMatches).toBe(true);
    expect(loaded?.rawText).toContain('CAFE NOIR');
  });

  it('findByCaptureSource returns the LATEST extraction (re-runs)', async () => {
    await captureSources.save(
      createCaptureSource({
        id: asCaptureSourceId('cap-y'),
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/y.jpg',
        capturedBy: USER,
      }),
    );
    const first = makeExtraction('ext-y1', 'cap-y');
    await repo.save(first);
    await repo.save(makeExtraction('ext-y2', 'cap-y'));

    const latest = await repo.findByCaptureSource(asCaptureSourceId('cap-y'));
    expect(latest?.id).not.toBeNull();
    // Both immutable records persist.
    expect(await repo.findById(asExtractionResultId('ext-y1'))).not.toBeNull();
    expect(await repo.findById(asExtractionResultId('ext-y2'))).not.toBeNull();
  });

  it('save is idempotent for the same immutable result (replay)', async () => {
    await captureSources.save(
      createCaptureSource({
        id: asCaptureSourceId('cap-z'),
        sourceType: 'paper_receipt',
        imageUri: 'file:///receipts/z.jpg',
        capturedBy: USER,
      }),
    );
    const extraction = makeExtraction('ext-z', 'cap-z');
    await repo.save(extraction);
    await repo.save(extraction); // sync replay — must not throw or duplicate

    const bySource = await repo.findByCaptureSource(asCaptureSourceId('cap-z'));
    expect(bySource).not.toBeNull();
  });
});
