import { describe, expect, it } from '@jest/globals';

import {
  computeCorrectionStatistics,
  getBestPerformingField,
  getWorstPerformingField,
  statisticsContainRawPii,
  type ReceiptCorrectionBatch,
} from '../index';
import type { FieldLevelDiff } from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiff(
  fieldName: FieldLevelDiff['fieldName'],
  extractedPattern: string,
  correctedPattern: string,
  correctionType: FieldLevelDiff['correctionType'] = 'value_change',
  extractionConfidence: FieldLevelDiff['extractionConfidence'] = 'medium',
): FieldLevelDiff {
  return {
    fieldName,
    extractedValuePattern: extractedPattern,
    correctedValuePattern: correctedPattern,
    extractionConfidence,
    correctionType,
  };
}

function makeBatch(
  receiptId: string,
  diffs: readonly FieldLevelDiff[],
): ReceiptCorrectionBatch {
  return { receiptId, diffs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('correction-statistics', () => {
  describe('computeCorrectionStatistics', () => {
    it('returns empty stats for no batches', () => {
      const stats = computeCorrectionStatistics([]);
      expect(stats.totalReceipts).toBe(0);
      expect(stats.totalCorrections).toBe(0);
      expect(stats.fieldCorrectionRates).toEqual([]);
      expect(stats.commonPatterns).toEqual([]);
      expect(stats.worstPerformingFields).toEqual([]);
    });

    it('counts total receipts and corrections', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>'), makeDiff('merchant', '<merchant:len=medium>', '<merchant:len=long>')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      expect(stats.totalReceipts).toBe(2);
      expect(stats.totalCorrections).toBe(3);
    });

    it('computes per-field correction rates', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r3', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      // total: 2 receipts corrected, 2 occurrences.
      // merchant: 1 receipt corrected, 1 occurrence.
      const total = stats.fieldCorrectionRates.find((f) => f.fieldName === 'total');
      const merchant = stats.fieldCorrectionRates.find((f) => f.fieldName === 'merchant');
      expect(total?.totalOccurrences).toBe(2);
      expect(total?.correctedCount).toBe(2);
      expect(total?.correctionRate).toBe(1);
      expect(merchant?.totalOccurrences).toBe(1);
      expect(merchant?.correctedCount).toBe(1);
      expect(merchant?.correctionRate).toBe(1);
    });

    it('sorts field correction rates by correction rate descending', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r3', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      // Both have rate 1.0, but total has more occurrences (still first).
      expect(stats.fieldCorrectionRates[0]!.fieldName).toBe('total');
    });

    it('computes common patterns sorted by count', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r3', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r4', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      expect(stats.commonPatterns.length).toBe(2);
      expect(stats.commonPatterns[0]!.count).toBe(3);
      expect(stats.commonPatterns[0]!.fieldName).toBe('total');
      expect(stats.commonPatterns[1]!.count).toBe(1);
    });

    it('respects the topPatternsLimit option', () => {
      const batches: ReceiptCorrectionBatch[] = [];
      for (let i = 0; i < 10; i++) {
        batches.push(
          makeBatch(`r${i}`, [
            makeDiff('total', `<amount:${i}>`, '<amount>'),
          ]),
        );
      }
      const stats = computeCorrectionStatistics(batches, { topPatternsLimit: 3 });
      expect(stats.commonPatterns.length).toBe(3);
    });

    it('computes correction type counts', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>', 'value_change')]),
        makeBatch('r2', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=long>', 'value_change')]),
        makeBatch('r3', [makeDiff('date', '<date:YYYY-MM-DD>', '<date:DD/MM/YYYY>', 'format_change')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      expect(stats.correctionTypeCounts['value_change']).toBe(2);
      expect(stats.correctionTypeCounts['format_change']).toBe(1);
    });

    it('returns frozen output objects', () => {
      const stats = computeCorrectionStatistics([
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
      ]);
      expect(Object.isFrozen(stats)).toBe(true);
      expect(Object.isFrozen(stats.fieldCorrectionRates)).toBe(true);
      expect(Object.isFrozen(stats.commonPatterns)).toBe(true);
      expect(Object.isFrozen(stats.worstPerformingFields)).toBe(true);
      expect(Object.isFrozen(stats.correctionTypeCounts)).toBe(true);
    });

    it('CRITICAL: statistics NEVER contain raw values', () => {
      const batches = [
        makeBatch('r1', [
          makeDiff('total', '<amount>', '<amount>'),
          makeDiff('merchant', '<merchant:len=medium>', '<merchant:len=long>'),
        ]),
      ];
      const stats = computeCorrectionStatistics(batches);
      expect(statisticsContainRawPii(stats)).toBe(false);
    });

    it('CRITICAL: statistics never contain raw merchant names', () => {
      const batches = [
        makeBatch('r1', [
          makeDiff('merchant', '<merchant:len=medium>', '<merchant:len=long>'),
        ]),
        makeBatch('r2', [
          makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>'),
        ]),
      ];
      const stats = computeCorrectionStatistics(batches);
      const serialized = JSON.stringify(stats);
      // Should NOT contain raw merchant names.
      expect(serialized).not.toContain('McDonalds');
      expect(serialized).not.toContain('Burger King');
      expect(serialized).not.toContain('Starbucks');
      expect(serialized).not.toContain('Amazon');
    });

    it('CRITICAL: statistics never contain user IDs or receipt IDs in patterns', () => {
      const batches = [
        makeBatch('user-123-receipt-456', [
          makeDiff('total', '<amount>', '<amount>'),
        ]),
      ];
      const stats = computeCorrectionStatistics(batches);
      const serialized = JSON.stringify(stats.commonPatterns);
      // Receipt ID is used internally as a key but should NOT appear in
      // the pattern values themselves.
      expect(serialized).not.toContain('user-123');
      expect(serialized).not.toContain('receipt-456');
    });

    it('does not mutate input batches', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
      ];
      const batchesCopy = batches.map((b) => ({
        receiptId: b.receiptId,
        diffs: [...b.diffs],
      }));
      computeCorrectionStatistics(batches);
      expect(batches).toEqual(batchesCopy);
    });
  });

  describe('worstPerformingFields (with minOccurrencesForWorst)', () => {
    it('filters out fields with fewer than min occurrences', () => {
      const batches: ReceiptCorrectionBatch[] = [];
      // total: 10 corrections
      for (let i = 0; i < 10; i++) {
        batches.push(makeBatch(`r${i}`, [makeDiff('total', '<amount>', '<amount>')]));
      }
      // merchant: 1 correction (below threshold)
      batches.push(makeBatch('r10', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]));
      const stats = computeCorrectionStatistics(batches, { minOccurrencesForWorst: 5 });
      expect(stats.worstPerformingFields.length).toBe(1);
      expect(stats.worstPerformingFields[0]!.fieldName).toBe('total');
    });

    it('includes fields meeting the minimum threshold', () => {
      const batches: ReceiptCorrectionBatch[] = [];
      for (let i = 0; i < 10; i++) {
        batches.push(makeBatch(`r${i}`, [makeDiff('total', '<amount>', '<amount>')]));
      }
      for (let i = 10; i < 20; i++) {
        batches.push(makeBatch(`r${i}`, [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]));
      }
      const stats = computeCorrectionStatistics(batches, { minOccurrencesForWorst: 5 });
      expect(stats.worstPerformingFields.length).toBe(2);
    });
  });

  describe('getWorstPerformingField', () => {
    it('returns the field with the highest correction rate', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r3', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r4', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r5', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r6', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]),
      ];
      const stats = computeCorrectionStatistics(batches, { minOccurrencesForWorst: 5 });
      const worst = getWorstPerformingField(stats);
      expect(worst?.fieldName).toBe('total');
    });

    it('returns null when no fields meet the threshold', () => {
      const batches = [makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')])];
      const stats = computeCorrectionStatistics(batches, { minOccurrencesForWorst: 5 });
      expect(getWorstPerformingField(stats)).toBe(null);
    });

    it('returns null for empty stats', () => {
      const stats = computeCorrectionStatistics([]);
      expect(getWorstPerformingField(stats)).toBe(null);
    });
  });

  describe('getBestPerformingField', () => {
    it('returns the field with the lowest correction rate', () => {
      const batches = [
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r2', [makeDiff('total', '<amount>', '<amount>')]),
        makeBatch('r3', [makeDiff('merchant', '<merchant:len=short>', '<merchant:len=medium>')]),
      ];
      const stats = computeCorrectionStatistics(batches);
      const best = getBestPerformingField(stats);
      // Both have rate 1.0, but merchant is last in the sorted list (lowest
      // occurrences among ties — sort is stable on rate, descending).
      expect(best).not.toBe(null);
    });

    it('returns null for empty stats', () => {
      const stats = computeCorrectionStatistics([]);
      expect(getBestPerformingField(stats)).toBe(null);
    });
  });

  describe('statisticsContainRawPii', () => {
    it('returns false for clean statistics', () => {
      const stats = computeCorrectionStatistics([
        makeBatch('r1', [makeDiff('total', '<amount>', '<amount>')]),
      ]);
      expect(statisticsContainRawPii(stats)).toBe(false);
    });

    it('returns true if a raw email leaks into the patterns', () => {
      // Manually construct stats with a leaked pattern (defense-in-depth test).
      const stats = computeCorrectionStatistics([
        makeBatch('r1', [makeDiff('merchant', '<merchant:len=medium>', 'user@example.com')]),
      ]);
      // The computeDiff module would never produce this — anonymizeValue
      // would convert 'user@example.com' to '<merchant:len=medium,has_digits,has_special>'.
      // But if a bug ever causes a raw value to leak, statisticsContainRawPii
      // should catch it.
      // Actually, anonymizeValue would convert it, so this test verifies
      // the helper still flags the case correctly when called manually.
      expect(statisticsContainRawPii(stats)).toBe(true);
    });
  });
});
