import { describe, expect, it } from '@jest/globals';

import {
  captureSnapshot,
  detectMemoryLeak,
  diffSnapshots,
  summarizeSnapshots,
  type MemorySnapshot,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(
  timestamp: string,
  heapUsedMb: number,
  heapTotalMb: number = heapUsedMb * 2,
  externalMb: number = 10,
): MemorySnapshot {
  return { timestamp, heapUsedMb, heapTotalMb, externalMb };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memory-profiler', () => {
  describe('captureSnapshot', () => {
    it('converts bytes to MB', () => {
      const snap = captureSnapshot('2025-01-01T00:00:00.000Z', {
        heapUsed: 100 * 1024 * 1024, // 100 MB
        heapTotal: 200 * 1024 * 1024,
        external: 50 * 1024 * 1024,
      });
      expect(snap.heapUsedMb).toBe(100);
      expect(snap.heapTotalMb).toBe(200);
      expect(snap.externalMb).toBe(50);
    });

    it('includes rssMb when provided', () => {
      const snap = captureSnapshot('2025-01-01T00:00:00.000Z', {
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        rss: 300 * 1024 * 1024,
      });
      expect(snap.rssMb).toBe(300);
    });

    it('throws for invalid timestamp', () => {
      expect(() =>
        captureSnapshot('not-a-date', {
          heapUsed: 100,
          heapTotal: 200,
          external: 50,
        }),
      ).toThrow();
    });

    it('returns a frozen snapshot', () => {
      const snap = captureSnapshot('2025-01-01T00:00:00.000Z', {
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        external: 50 * 1024 * 1024,
      });
      expect(Object.isFrozen(snap)).toBe(true);
    });
  });

  describe('detectMemoryLeak', () => {
    it('returns a no-leak result for empty snapshots', () => {
      const result = detectMemoryLeak([]);
      expect(result.totalSnapshots).toBe(0);
      expect(result.leakSuspected).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('returns no leak for stable memory usage', () => {
      const snapshots: MemorySnapshot[] = [];
      for (let i = 0; i < 10; i++) {
        // Stable at 100 MB.
        snapshots.push(makeSnapshot(`2025-01-01T00:0${i}:00.000Z`, 100));
      }
      const result = detectMemoryLeak(snapshots);
      expect(result.leakSuspected).toBe(false);
      expect(result.growthRateMbPerHour).toBe(0);
      expect(result.peakHeapUsedMb).toBe(100);
      expect(result.minHeapUsedMb).toBe(100);
    });

    it('detects a leak when memory grows steadily', () => {
      const snapshots: MemorySnapshot[] = [];
      // 10 snapshots, each 1 minute apart, growing 1 MB per snapshot.
      // Over 9 minutes = 0.15 hours, growth = 9 MB → 60 MB/hour.
      for (let i = 0; i < 10; i++) {
        snapshots.push(makeSnapshot(`2025-01-01T00:0${i}:00.000Z`, 100 + i));
      }
      const result = detectMemoryLeak(snapshots);
      expect(result.leakSuspected).toBe(true);
      expect(result.growthRateMbPerHour).toBeGreaterThan(10);
      // 60 MB/hr is above the critical threshold (50) → critical.
      expect(result.severity).toBe('critical');
    });

    it('returns critical severity for very high growth rate', () => {
      const snapshots: MemorySnapshot[] = [];
      // 10 snapshots, each 1 second apart, growing 1 MB per snapshot.
      // Over 9 seconds = 0.0025 hours, growth = 9 MB → 3600 MB/hour.
      for (let i = 0; i < 10; i++) {
        snapshots.push(makeSnapshot(`2025-01-01T00:00:0${i}.000Z`, 100 + i));
      }
      const result = detectMemoryLeak(snapshots);
      expect(result.leakSuspected).toBe(true);
      expect(result.growthRateMbPerHour).toBeGreaterThan(50);
      expect(result.severity).toBe('critical');
    });

    it('returns info severity for slow growth below threshold', () => {
      const snapshots: MemorySnapshot[] = [];
      // 10 snapshots, each 1 DAY apart, growing 1 MB per snapshot.
      // Over 9 days = 216 hours, growth = 9 MB → 0.04 MB/hour (below threshold).
      for (let i = 0; i < 10; i++) {
        const day = (i + 1).toString().padStart(2, '0');
        snapshots.push(makeSnapshot(`2025-01-${day}T00:00:00.000Z`, 100 + i));
      }
      const result = detectMemoryLeak(snapshots);
      expect(result.leakSuspected).toBe(false);
      expect(result.growthRateMbPerHour).toBeLessThan(10);
      expect(result.severity).toBe('info'); // slow growth, below threshold
    });

    it('returns none severity for fewer than minSnapshots', () => {
      const snapshots: MemorySnapshot[] = [];
      for (let i = 0; i < 3; i++) {
        snapshots.push(makeSnapshot(`2025-01-01T00:0${i}:00.000Z`, 100 + i));
      }
      const result = detectMemoryLeak(snapshots);
      // 3 < 5 (default minSnapshots) → no leak suspected.
      expect(result.leakSuspected).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('respects custom minSnapshots option', () => {
      const snapshots: MemorySnapshot[] = [];
      for (let i = 0; i < 3; i++) {
        snapshots.push(makeSnapshot(`2025-01-01T00:0${i}:00.000Z`, 100 + i));
      }
      // With minSnapshots=2, the 3 snapshots is enough.
      const result = detectMemoryLeak(snapshots, { minSnapshots: 2 });
      // Growth = 2 MB over 2 minutes = 60 MB/hour → leak suspected.
      expect(result.leakSuspected).toBe(true);
    });

    it('respects custom growthRateThresholdMbPerHour option', () => {
      const snapshots: MemorySnapshot[] = [];
      // 10 snapshots, each 1 day apart, growing 1 MB per snapshot.
      // Growth rate = 9 MB / 216 hours ≈ 0.042 MB/hour.
      for (let i = 0; i < 10; i++) {
        const day = (i + 1).toString().padStart(2, '0');
        snapshots.push(makeSnapshot(`2025-01-${day}T00:00:00.000Z`, 100 + i));
      }
      // With threshold=0.01, growth rate of ~0.042 MB/hour IS a leak.
      const result = detectMemoryLeak(snapshots, { growthRateThresholdMbPerHour: 0.01 });
      expect(result.leakSuspected).toBe(true);
    });

    it('reports peak, min, and final heap used', () => {
      const snapshots: MemorySnapshot[] = [
        makeSnapshot('2025-01-01T00:00:00.000Z', 100),
        makeSnapshot('2025-01-01T00:01:00.000Z', 150),
        makeSnapshot('2025-01-01T00:02:00.000Z', 120),
        makeSnapshot('2025-01-01T00:03:00.000Z', 90),
        makeSnapshot('2025-01-01T00:04:00.000Z', 110),
      ];
      const result = detectMemoryLeak(snapshots);
      expect(result.peakHeapUsedMb).toBe(150);
      expect(result.minHeapUsedMb).toBe(90);
      expect(result.finalHeapUsedMb).toBe(110);
    });

    it('reports first and last snapshot timestamps', () => {
      const snapshots: MemorySnapshot[] = [
        makeSnapshot('2025-01-01T00:00:00.000Z', 100),
        makeSnapshot('2025-01-01T00:01:00.000Z', 110),
      ];
      const result = detectMemoryLeak(snapshots);
      expect(result.firstSnapshotAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.lastSnapshotAt).toBe('2025-01-01T00:01:00.000Z');
    });

    it('reports the analysis window duration', () => {
      const snapshots: MemorySnapshot[] = [
        makeSnapshot('2025-01-01T00:00:00.000Z', 100),
        makeSnapshot('2025-01-01T00:01:00.000Z', 110), // 60s later
      ];
      const result = detectMemoryLeak(snapshots);
      expect(result.analysisWindowMs).toBe(60 * 1000);
    });

    it('returns a frozen result object', () => {
      const result = detectMemoryLeak([]);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('handles decreasing memory (no leak)', () => {
      const snapshots: MemorySnapshot[] = [];
      for (let i = 0; i < 10; i++) {
        snapshots.push(makeSnapshot(`2025-01-01T00:0${i}:00.000Z`, 100 - i));
      }
      const result = detectMemoryLeak(snapshots);
      expect(result.leakSuspected).toBe(false);
      expect(result.growthRateMbPerHour).toBeLessThan(0);
    });

    it('sorts snapshots by timestamp before analysis', () => {
      // Out-of-order input.
      const snapshots: MemorySnapshot[] = [
        makeSnapshot('2025-01-01T00:02:00.000Z', 120),
        makeSnapshot('2025-01-01T00:00:00.000Z', 100),
        makeSnapshot('2025-01-01T00:01:00.000Z', 110),
      ];
      const result = detectMemoryLeak(snapshots);
      expect(result.firstSnapshotAt).toBe('2025-01-01T00:00:00.000Z');
      expect(result.lastSnapshotAt).toBe('2025-01-01T00:02:00.000Z');
      expect(result.finalHeapUsedMb).toBe(120);
    });
  });

  describe('summarizeSnapshots', () => {
    it('returns a summary with peak, min, average, final', () => {
      const snapshots: MemorySnapshot[] = [
        makeSnapshot('2025-01-01T00:00:00.000Z', 100),
        makeSnapshot('2025-01-01T00:01:00.000Z', 150),
        makeSnapshot('2025-01-01T00:02:00.000Z', 120),
      ];
      const summary = summarizeSnapshots(snapshots);
      expect(summary.snapshotCount).toBe(3);
      expect(summary.peakHeapUsedMb).toBe(150);
      expect(summary.minHeapUsedMb).toBe(100);
      expect(summary.averageHeapUsedMb).toBe((100 + 150 + 120) / 3);
      expect(summary.finalHeapUsedMb).toBe(120);
    });

    it('returns an empty summary for no snapshots', () => {
      const summary = summarizeSnapshots([]);
      expect(summary.snapshotCount).toBe(0);
      expect(summary.peakHeapUsedMb).toBe(0);
      expect(summary.averageHeapUsedMb).toBe(0);
    });

    it('returns a frozen summary', () => {
      const summary = summarizeSnapshots([]);
      expect(Object.isFrozen(summary)).toBe(true);
    });
  });

  describe('diffSnapshots', () => {
    it('returns the difference between two snapshots', () => {
      const earlier = makeSnapshot('2025-01-01T00:00:00.000Z', 100, 200, 10);
      const later = makeSnapshot('2025-01-01T00:01:00.000Z', 150, 250, 20);
      const diff = diffSnapshots(earlier, later);
      expect(diff.heapUsedDeltaMb).toBe(50);
      expect(diff.heapTotalDeltaMb).toBe(50);
      expect(diff.externalDeltaMb).toBe(10);
      expect(diff.durationMs).toBe(60 * 1000);
    });

    it('handles negative deltas (memory decreased)', () => {
      const earlier = makeSnapshot('2025-01-01T00:00:00.000Z', 150, 200, 10);
      const later = makeSnapshot('2025-01-01T00:01:00.000Z', 100, 200, 10);
      const diff = diffSnapshots(earlier, later);
      expect(diff.heapUsedDeltaMb).toBe(-50);
    });

    it('returns 0 duration when timestamps are invalid', () => {
      const earlier = makeSnapshot('not-a-date', 100, 200, 10);
      const later = makeSnapshot('also-not-a-date', 150, 250, 20);
      const diff = diffSnapshots(earlier, later);
      expect(diff.durationMs).toBe(0);
    });

    it('returns a frozen diff', () => {
      const earlier = makeSnapshot('2025-01-01T00:00:00.000Z', 100, 200, 10);
      const later = makeSnapshot('2025-01-01T00:01:00.000Z', 150, 250, 20);
      const diff = diffSnapshots(earlier, later);
      expect(Object.isFrozen(diff)).toBe(true);
    });
  });
});
