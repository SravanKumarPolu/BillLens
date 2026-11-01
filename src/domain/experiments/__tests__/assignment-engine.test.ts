import { describe, expect, it } from '@jest/globals';

import { createExperiment } from '../experiment-model';
import {
  assignmentFingerprint,
  assignVariant,
  fnv1aHash,
  hashToUnitInterval,
  isInExperimentTraffic,
  pickVariantByWeight,
  type Experiment,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return createExperiment({
    id: overrides.id ?? 'exp-onboarding-001',
    name: overrides.name ?? 'Onboarding flow A/B',
    description: overrides.description ?? 'Test 3-step vs 5-step onboarding.',
    surface: overrides.surface ?? 'onboarding_flow',
    status: overrides.status ?? 'running',
    variantWeights: overrides.variantWeights ?? [
      { variant: 'control', weight: 50 },
      { variant: 'treatment_a', weight: 50 },
    ],
    trafficAllocationPercent: overrides.trafficAllocationPercent ?? 100,
    overriddenFlags: overrides.overriddenFlags ?? [],
    startsAt: overrides.startsAt ?? '2025-01-01T00:00:00.000Z',
    endsAt: overrides.endsAt ?? '2025-12-31T23:59:59.000Z',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assignment-engine', () => {
  describe('fnv1aHash', () => {
    it('returns a 32-bit unsigned integer', () => {
      const hash = fnv1aHash('hello');
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    });

    it('is deterministic — same input always yields same output', () => {
      expect(fnv1aHash('hello')).toBe(fnv1aHash('hello'));
      expect(fnv1aHash('participant-123:experiment-abc')).toBe(
        fnv1aHash('participant-123:experiment-abc'),
      );
    });

    it('produces different hashes for different inputs', () => {
      expect(fnv1aHash('hello')).not.toBe(fnv1aHash('world'));
      expect(fnv1aHash('a')).not.toBe(fnv1aHash('b'));
    });

    it('produces different hashes for similar inputs', () => {
      expect(fnv1aHash('participant-1')).not.toBe(fnv1aHash('participant-2'));
      expect(fnv1aHash('exp-1:user-1')).not.toBe(fnv1aHash('exp-1:user-2'));
    });

    it('handles empty string', () => {
      const hash = fnv1aHash('');
      expect(Number.isInteger(hash)).toBe(true);
      // FNV-1a of empty string = the offset basis.
      expect(hash).toBe(0x811c9dc5);
    });
  });

  describe('hashToUnitInterval', () => {
    it('returns a float in [0, 1)', () => {
      for (const input of ['', 'a', 'participant-1', 'experiment-x:user-y']) {
        const hash = fnv1aHash(input);
        const bucket = hashToUnitInterval(hash);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(1);
      }
    });

    it('is deterministic', () => {
      const h = fnv1aHash('hello');
      expect(hashToUnitInterval(h)).toBe(hashToUnitInterval(h));
    });
  });

  describe('isInExperimentTraffic', () => {
    it('returns true for 100% allocation regardless of participant', () => {
      for (const p of ['p1', 'p2', 'p3', 'p4', 'p5']) {
        expect(isInExperimentTraffic('exp-1', p, 100)).toBe(true);
      }
    });

    it('returns false for 0% allocation', () => {
      for (const p of ['p1', 'p2', 'p3', 'p4', 'p5']) {
        expect(isInExperimentTraffic('exp-1', p, 0)).toBe(false);
      }
    });

    it('splits roughly 50/50 for 50% allocation', () => {
      let included = 0;
      let excluded = 0;
      for (let i = 0; i < 1000; i++) {
        const p = `participant-${i}`;
        if (isInExperimentTraffic('exp-1', p, 50)) {
          included++;
        } else {
          excluded++;
        }
      }
      // Should be roughly 50/50. Allow generous bounds to avoid flakiness.
      expect(included).toBeGreaterThan(400);
      expect(included).toBeLessThan(600);
      expect(included + excluded).toBe(1000);
    });

    it('splits roughly 10/90 for 10% allocation', () => {
      let included = 0;
      for (let i = 0; i < 1000; i++) {
        const p = `participant-${i}`;
        if (isInExperimentTraffic('exp-1', p, 10)) included++;
      }
      // Should be roughly 100/1000.
      expect(included).toBeGreaterThan(50);
      expect(included).toBeLessThan(150);
    });

    it('is deterministic — same participant always gets same bucket', () => {
      for (let i = 0; i < 50; i++) {
        const p = `participant-${i}`;
        const first = isInExperimentTraffic('exp-1', p, 50);
        const second = isInExperimentTraffic('exp-1', p, 50);
        expect(first).toBe(second);
      }
    });

    it('produces different buckets for different experiment IDs', () => {
      // Same participant, different experiments — buckets should differ.
      let differences = 0;
      for (let i = 0; i < 100; i++) {
        const p = `participant-${i}`;
        const a = isInExperimentTraffic('exp-A', p, 50);
        const b = isInExperimentTraffic('exp-B', p, 50);
        if (a !== b) differences++;
      }
      expect(differences).toBeGreaterThan(20);
    });
  });

  describe('pickVariantByWeight', () => {
    it('returns control when control has weight 1 and others 0', () => {
      const hash = fnv1aHash('whatever');
      const variant = pickVariantByWeight(
        [
          { variant: 'control', weight: 1 },
          { variant: 'treatment_a', weight: 0 },
        ],
        hash,
      );
      expect(variant).toBe('control');
    });

    it('returns treatment_a when treatment has all the weight', () => {
      const hash = fnv1aHash('whatever');
      const variant = pickVariantByWeight(
        [
          { variant: 'control', weight: 0 },
          { variant: 'treatment_a', weight: 1 },
        ],
        hash,
      );
      expect(variant).toBe('treatment_a');
    });

    it('throws on empty weights', () => {
      expect(() => pickVariantByWeight([], 0)).toThrow();
    });

    it('throws when total weight is 0', () => {
      expect(() =>
        pickVariantByWeight(
          [
            { variant: 'control', weight: 0 },
            { variant: 'treatment_a', weight: 0 },
          ],
          0,
        ),
      ).toThrow();
    });

    it('splits roughly 50/50 between control and treatment_a', () => {
      const counts: Record<string, number> = {
        control: 0,
        treatment_a: 0,
      };
      for (let i = 0; i < 1000; i++) {
        const hash = fnv1aHash(`participant-${i}:variant`);
        const v = pickVariantByWeight(
          [
            { variant: 'control', weight: 50 },
            { variant: 'treatment_a', weight: 50 },
          ],
          hash,
        );
        counts[v] = (counts[v] ?? 0) + 1;
      }
      expect(counts.control).toBeGreaterThan(400);
      expect(counts.control).toBeLessThan(600);
      expect(counts.treatment_a).toBeGreaterThan(400);
      expect(counts.treatment_a).toBeLessThan(600);
    });

    it('respects unequal weights (75/25 split)', () => {
      const counts: Record<string, number> = {
        control: 0,
        treatment_a: 0,
      };
      for (let i = 0; i < 2000; i++) {
        const hash = fnv1aHash(`participant-${i}:variant`);
        const v = pickVariantByWeight(
          [
            { variant: 'control', weight: 75 },
            { variant: 'treatment_a', weight: 25 },
          ],
          hash,
        );
        counts[v] = (counts[v] ?? 0) + 1;
      }
      // 75% control.
      expect(counts.control).toBeGreaterThan(1300);
      expect(counts.control).toBeLessThan(1700);
    });

    it('handles 4-way equal split', () => {
      const counts: Record<string, number> = {
        control: 0,
        treatment_a: 0,
        treatment_b: 0,
        treatment_c: 0,
      };
      for (let i = 0; i < 4000; i++) {
        const hash = fnv1aHash(`participant-${i}:variant`);
        const v = pickVariantByWeight(
          [
            { variant: 'control', weight: 25 },
            { variant: 'treatment_a', weight: 25 },
            { variant: 'treatment_b', weight: 25 },
            { variant: 'treatment_c', weight: 25 },
          ],
          hash,
        );
        counts[v] = (counts[v] ?? 0) + 1;
      }
      // Each variant should have ~1000.
      for (const v of Object.keys(counts)) {
        expect(counts[v]).toBeGreaterThan(800);
        expect(counts[v]).toBeLessThan(1200);
      }
    });
  });

  describe('assignVariant', () => {
    const exp = makeExperiment({ trafficAllocationPercent: 100 });

    it('returns null for non-running experiments', () => {
      const draft = makeExperiment({ status: 'draft' });
      expect(assignVariant(draft, 'p1')).toBe(null);
      const paused = makeExperiment({ status: 'paused' });
      expect(assignVariant(paused, 'p1')).toBe(null);
      const completed = makeExperiment({ status: 'completed' });
      expect(assignVariant(completed, 'p1')).toBe(null);
      const cancelled = makeExperiment({ status: 'cancelled' });
      expect(assignVariant(cancelled, 'p1')).toBe(null);
    });

    it('returns null for 0% traffic allocation', () => {
      const exp0 = makeExperiment({ trafficAllocationPercent: 0 });
      expect(assignVariant(exp0, 'p1')).toBe(null);
    });

    it('is deterministic — same participant always gets same variant', () => {
      for (let i = 0; i < 100; i++) {
        const p = `participant-${i}`;
        const first = assignVariant(exp, p);
        const second = assignVariant(exp, p);
        expect(first).toBe(second);
      }
    });

    it('returns only valid variant values', () => {
      for (let i = 0; i < 100; i++) {
        const v = assignVariant(exp, `participant-${i}`);
        expect(v === null || ['control', 'treatment_a', 'treatment_b', 'treatment_c'].includes(v as string)).toBe(true);
      }
    });

    it('returns null when participant is excluded from traffic', () => {
      // 1% allocation — most participants should be excluded.
      const lowTrafficExp = makeExperiment({ trafficAllocationPercent: 1 });
      let excluded = 0;
      for (let i = 0; i < 1000; i++) {
        if (assignVariant(lowTrafficExp, `participant-${i}`) === null) {
          excluded++;
        }
      }
      // Should be roughly 990/1000 excluded.
      expect(excluded).toBeGreaterThan(900);
    });

    it('respects variant weights', () => {
      const weightedExp = makeExperiment({
        variantWeights: [
          { variant: 'control', weight: 90 },
          { variant: 'treatment_a', weight: 10 },
        ],
        trafficAllocationPercent: 100,
      });
      const counts: Record<string, number> = { control: 0, treatment_a: 0 };
      for (let i = 0; i < 2000; i++) {
        const v = assignVariant(weightedExp, `participant-${i}`);
        if (v !== null) counts[v] = (counts[v] ?? 0) + 1;
      }
      // 90% control.
      expect(counts.control).toBeGreaterThan(1600);
      expect(counts.control).toBeLessThan(2000);
    });
  });

  describe('assignmentFingerprint', () => {
    it('produces a stable, deterministic string', () => {
      const fp1 = assignmentFingerprint('exp-1', 'p-1');
      const fp2 = assignmentFingerprint('exp-1', 'p-1');
      expect(fp1).toBe(fp2);
    });

    it('differs across experiments for the same participant', () => {
      const fp1 = assignmentFingerprint('exp-1', 'p-1');
      const fp2 = assignmentFingerprint('exp-2', 'p-1');
      expect(fp1).not.toBe(fp2);
    });

    it('differs across participants for the same experiment', () => {
      const fp1 = assignmentFingerprint('exp-1', 'p-1');
      const fp2 = assignmentFingerprint('exp-1', 'p-2');
      expect(fp1).not.toBe(fp2);
    });

    it('includes the experiment id and participant id', () => {
      const fp = assignmentFingerprint('exp-1', 'p-1');
      expect(fp).toContain('exp-1');
      expect(fp).toContain('p-1');
    });
  });

  describe('Distribution smoke test', () => {
    it('produces a balanced distribution across 10000 participants', () => {
      const exp = makeExperiment({
        variantWeights: [
          { variant: 'control', weight: 50 },
          { variant: 'treatment_a', weight: 50 },
        ],
        trafficAllocationPercent: 100,
      });
      const counts: Record<string, number> = { control: 0, treatment_a: 0 };
      for (let i = 0; i < 10000; i++) {
        const v = assignVariant(exp, `user-${i}`);
        if (v !== null) counts[v] = (counts[v] ?? 0) + 1;
      }
      // 10000 total, ~5000 each.
      const controlCount = counts['control'] ?? 0;
      const treatmentCount = counts['treatment_a'] ?? 0;
      expect(controlCount + treatmentCount).toBe(10000);
      expect(Math.abs(controlCount - 5000)).toBeLessThan(300);
    });
  });
});
