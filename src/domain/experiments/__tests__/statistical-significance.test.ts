import { describe, expect, it } from '@jest/globals';

import {
  computeExperimentResults,
  differenceConfidenceInterval,
  inverseNormalCdf,
  minimumSampleSize,
  normalCdf,
  twoProportionZTest,
  type VariantConversionStats,
} from '../index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('statistical-significance', () => {
  describe('normalCdf', () => {
    it('returns 0.5 for z=0', () => {
      expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    });

    it('returns ~1 for large positive z', () => {
      expect(normalCdf(10)).toBeCloseTo(1, 5);
      expect(normalCdf(5)).toBeGreaterThan(0.99999);
    });

    it('returns ~0 for large negative z', () => {
      expect(normalCdf(-10)).toBeCloseTo(0, 5);
      expect(normalCdf(-5)).toBeLessThan(0.00001);
    });

    it('returns ~0.975 for z=1.96 (95% two-sided)', () => {
      expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    });

    it('returns ~0.84 for z=1 (one sigma)', () => {
      expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    });

    it('is symmetric around 0', () => {
      for (const z of [0.5, 1, 1.5, 2, 2.5, 3]) {
        expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 5);
      }
    });
  });

  describe('inverseNormalCdf', () => {
    it('returns 0 for p=0.5', () => {
      expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 5);
    });

    it('returns ~1.96 for p=0.975', () => {
      expect(inverseNormalCdf(0.975)).toBeCloseTo(1.96, 3);
    });

    it('returns ~-1.96 for p=0.025', () => {
      expect(inverseNormalCdf(0.025)).toBeCloseTo(-1.96, 3);
    });

    it('returns ~2.576 for p=0.995 (99% two-sided)', () => {
      expect(inverseNormalCdf(0.995)).toBeCloseTo(2.576, 2);
    });

    it('throws for p outside (0, 1)', () => {
      expect(() => inverseNormalCdf(0)).toThrow();
      expect(() => inverseNormalCdf(1)).toThrow();
      expect(() => inverseNormalCdf(-0.1)).toThrow();
      expect(() => inverseNormalCdf(1.1)).toThrow();
    });

    it('round-trips with normalCdf', () => {
      for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
        const z = inverseNormalCdf(p);
        const recovered = normalCdf(z);
        expect(recovered).toBeCloseTo(p, 4);
      }
    });
  });

  describe('twoProportionZTest', () => {
    const control: VariantConversionStats = {
      variant: 'control',
      trials: 1000,
      successes: 100, // 10%
    };

    it('returns a non-significant result when treatment matches control', () => {
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 1000,
        successes: 100, // also 10%
      };
      const result = twoProportionZTest(control, treatment);
      expect(result.z).toBeCloseTo(0, 5);
      expect(result.pValue).toBeCloseTo(1, 5);
      expect(result.significant).toBe(false);
      expect(result.alpha).toBe(0.05);
    });

    it('returns a significant result when treatment clearly beats control', () => {
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 1000,
        successes: 150, // 15% — 50% relative lift
      };
      const result = twoProportionZTest(control, treatment);
      expect(result.z).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.significant).toBe(true);
    });

    it('returns a significant result when treatment clearly underperforms', () => {
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 1000,
        successes: 60, // 6% — 40% relative drop
      };
      const result = twoProportionZTest(control, treatment);
      expect(result.z).toBeLessThan(0);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.significant).toBe(true);
    });

    it('returns NaN when trials are zero', () => {
      const noTrials: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 0,
        successes: 0,
      };
      const result = twoProportionZTest(control, noTrials);
      expect(Number.isNaN(result.z)).toBe(true);
      expect(Number.isNaN(result.pValue)).toBe(true);
      expect(result.significant).toBe(false);
    });

    it('returns NaN when pooled proportion is 0', () => {
      const zeroSuccess: VariantConversionStats = {
        variant: 'control',
        trials: 100,
        successes: 0,
      };
      const zeroSuccessT: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 100,
        successes: 0,
      };
      const result = twoProportionZTest(zeroSuccess, zeroSuccessT);
      expect(Number.isNaN(result.z)).toBe(true);
      expect(result.significant).toBe(false);
    });

    it('returns NaN when pooled proportion is 1', () => {
      const allSuccessC: VariantConversionStats = {
        variant: 'control',
        trials: 100,
        successes: 100,
      };
      const allSuccessT: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 100,
        successes: 100,
      };
      const result = twoProportionZTest(allSuccessC, allSuccessT);
      expect(Number.isNaN(result.z)).toBe(true);
      expect(result.significant).toBe(false);
    });

    it('uses alpha = 0.05 by default', () => {
      const result = twoProportionZTest(control, control);
      expect(result.alpha).toBe(0.05);
    });

    it('p-value is always in [0, 1]', () => {
      // Try many scenarios.
      for (let s = 0; s <= 200; s += 10) {
        const t: VariantConversionStats = {
          variant: 'treatment_a',
          trials: 200,
          successes: s,
        };
        const result = twoProportionZTest(
          { variant: 'control', trials: 200, successes: 50 },
          t,
        );
        if (!Number.isNaN(result.pValue)) {
          expect(result.pValue).toBeGreaterThanOrEqual(0);
          expect(result.pValue).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('differenceConfidenceInterval', () => {
    it('returns a CI centered on the point estimate', () => {
      const control: VariantConversionStats = {
        variant: 'control',
        trials: 1000,
        successes: 100,
      };
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 1000,
        successes: 150,
      };
      const ci = differenceConfidenceInterval(control, treatment, 0.95);
      expect(ci.pointEstimate).toBeCloseTo(0.05, 5);
      expect(ci.lower).toBeLessThan(ci.pointEstimate);
      expect(ci.upper).toBeGreaterThan(ci.pointEstimate);
      expect(ci.confidenceLevel).toBe(0.95);
    });

    it('widens the CI when sample sizes shrink', () => {
      const bigControl: VariantConversionStats = {
        variant: 'control',
        trials: 10000,
        successes: 1000,
      };
      const bigTreatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 10000,
        successes: 1500,
      };
      const smallControl: VariantConversionStats = {
        variant: 'control',
        trials: 100,
        successes: 10,
      };
      const smallTreatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 100,
        successes: 15,
      };
      const bigCi = differenceConfidenceInterval(bigControl, bigTreatment, 0.95);
      const smallCi = differenceConfidenceInterval(smallControl, smallTreatment, 0.95);
      const bigWidth = bigCi.upper - bigCi.lower;
      const smallWidth = smallCi.upper - smallCi.lower;
      expect(smallWidth).toBeGreaterThan(bigWidth);
    });

    it('returns NaN when trials are zero', () => {
      const control: VariantConversionStats = {
        variant: 'control',
        trials: 0,
        successes: 0,
      };
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 100,
        successes: 10,
      };
      const ci = differenceConfidenceInterval(control, treatment, 0.95);
      expect(Number.isNaN(ci.lower)).toBe(true);
      expect(Number.isNaN(ci.upper)).toBe(true);
      expect(Number.isNaN(ci.pointEstimate)).toBe(true);
    });

    it('throws for invalid confidence levels', () => {
      const control: VariantConversionStats = {
        variant: 'control',
        trials: 100,
        successes: 10,
      };
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 100,
        successes: 15,
      };
      expect(() => differenceConfidenceInterval(control, treatment, 0)).toThrow();
      expect(() => differenceConfidenceInterval(control, treatment, 1)).toThrow();
      expect(() => differenceConfidenceInterval(control, treatment, -0.5)).toThrow();
      expect(() => differenceConfidenceInterval(control, treatment, 1.5)).toThrow();
    });

    it('uses 0.95 as default confidence level', () => {
      const control: VariantConversionStats = {
        variant: 'control',
        trials: 1000,
        successes: 100,
      };
      const treatment: VariantConversionStats = {
        variant: 'treatment_a',
        trials: 1000,
        successes: 150,
      };
      const ci = differenceConfidenceInterval(control, treatment);
      expect(ci.confidenceLevel).toBe(0.95);
    });
  });

  describe('minimumSampleSize', () => {
    it('returns a positive integer', () => {
      const n = minimumSampleSize(0.1, 0.05);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    });

    it('requires larger samples for smaller detectable effects', () => {
      const bigEffect = minimumSampleSize(0.1, 0.1);
      const smallEffect = minimumSampleSize(0.1, 0.02);
      expect(smallEffect).toBeGreaterThan(bigEffect);
    });

    it('requires larger samples for higher power', () => {
      const lowPower = minimumSampleSize(0.1, 0.05, 0.95, 0.5);
      const highPower = minimumSampleSize(0.1, 0.05, 0.95, 0.9);
      expect(highPower).toBeGreaterThan(lowPower);
    });

    it('requires larger samples for higher confidence', () => {
      const lowConf = minimumSampleSize(0.1, 0.05, 0.9, 0.8);
      const highConf = minimumSampleSize(0.1, 0.05, 0.99, 0.8);
      expect(highConf).toBeGreaterThan(lowConf);
    });

    it('throws for baseline rate outside (0, 1)', () => {
      expect(() => minimumSampleSize(0, 0.05)).toThrow();
      expect(() => minimumSampleSize(1, 0.05)).toThrow();
      expect(() => minimumSampleSize(-0.1, 0.05)).toThrow();
      expect(() => minimumSampleSize(1.1, 0.05)).toThrow();
    });

    it('throws for zero detectable effect', () => {
      expect(() => minimumSampleSize(0.1, 0)).toThrow();
    });

    it('throws for baseline + effect outside (0, 1)', () => {
      // baseline 0.5 + effect 0.6 = 1.1, outside (0, 1).
      expect(() => minimumSampleSize(0.5, 0.6)).toThrow();
      // baseline 0.1 + effect -0.2 = -0.1, outside (0, 1).
      expect(() => minimumSampleSize(0.1, -0.2)).toThrow();
    });

    it('matches textbook example for 10% baseline, 5% effect, 95%/80%', () => {
      // Standard sample-size formula yields roughly 720 per variant for
      // p1=0.1, p2=0.15, alpha=0.05, power=0.8.
      const n = minimumSampleSize(0.1, 0.05, 0.95, 0.8);
      expect(n).toBeGreaterThan(600);
      expect(n).toBeLessThan(900);
    });
  });

  describe('computeExperimentResults', () => {
    it('aggregates control + treatment into a result object', () => {
      const result = computeExperimentResults('exp-1', [
        { variant: 'control', trials: 1000, successes: 100 },
        { variant: 'treatment_a', trials: 1000, successes: 150 },
      ]);
      expect(result.experimentId).toBe('exp-1');
      expect(result.control.variant).toBe('control');
      expect(result.control.trials).toBe(1000);
      expect(result.control.conversionRate).toBeCloseTo(0.1, 5);
      expect(result.treatments.length).toBe(1);
      expect(result.treatments[0]!.variant).toBe('treatment_a');
      expect(result.treatments[0]!.conversionRate).toBeCloseTo(0.15, 5);
      expect(result.treatments[0]!.significant).toBe(true);
      expect(result.totalTrials).toBe(2000);
    });

    it('computes lift relative to control', () => {
      const result = computeExperimentResults('exp-1', [
        { variant: 'control', trials: 1000, successes: 100 },
        { variant: 'treatment_a', trials: 1000, successes: 150 },
      ]);
      // (0.15 - 0.10) / 0.10 = 0.5 (50% lift).
      expect(result.treatments[0]!.lift).toBeCloseTo(0.5, 3);
    });

    it('reports meetsMinimumSampleSize correctly', () => {
      const small = computeExperimentResults(
        'exp-1',
        [
          { variant: 'control', trials: 10, successes: 1 },
          { variant: 'treatment_a', trials: 10, successes: 2 },
        ],
        30,
      );
      expect(small.meetsMinimumSampleSize).toBe(false);

      const big = computeExperimentResults(
        'exp-1',
        [
          { variant: 'control', trials: 100, successes: 10 },
          { variant: 'treatment_a', trials: 100, successes: 15 },
        ],
        30,
      );
      expect(big.meetsMinimumSampleSize).toBe(true);
    });

    it('handles multiple treatments', () => {
      const result = computeExperimentResults('exp-1', [
        { variant: 'control', trials: 1000, successes: 100 },
        { variant: 'treatment_a', trials: 1000, successes: 150 },
        { variant: 'treatment_b', trials: 1000, successes: 80 },
        { variant: 'treatment_c', trials: 1000, successes: 100 },
      ]);
      expect(result.treatments.length).toBe(3);
      // treatment_b underperforms — lift should be negative.
      expect(result.treatments[1]!.lift).toBeLessThan(0);
    });

    it('throws when fewer than 2 variants are provided', () => {
      expect(() =>
        computeExperimentResults('exp-1', [
          { variant: 'control', trials: 100, successes: 10 },
        ]),
      ).toThrow();
    });

    it('handles zero-success variants without crashing', () => {
      const result = computeExperimentResults('exp-1', [
        { variant: 'control', trials: 100, successes: 0 },
        { variant: 'treatment_a', trials: 100, successes: 5 },
      ]);
      // Control rate is 0 → lift is 0 (guard).
      expect(result.control.conversionRate).toBe(0);
      expect(result.treatments[0]!.lift).toBe(0);
    });
  });
});
