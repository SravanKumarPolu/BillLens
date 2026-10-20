import { describe, expect, it } from '@jest/globals';

import {
  OUTDATED_LEVELS,
  SEVERITY_WEIGHT,
  VULNERABILITY_SEVERITIES,
  auditDependencies,
  auditDependency,
  classifyCvssScore,
  classifyExpoNativeModuleRisk,
  classifyRiskLevel,
  compareOutdatedLevel,
  isAbandoned,
  isVulnerabilitySeverity,
  type DependencyAdvisory,
  type DependencyMetadata,
} from '../dependency-audit';

const NOW = '2025-01-01T00:00:00.000Z';

function makeMetadata(overrides: Partial<DependencyMetadata> = {}): DependencyMetadata {
  return {
    name: 'sample-package',
    installedVersion: '1.0.0',
    latestVersion: '1.0.0',
    latestPublishDate: '2024-12-01T00:00:00.000Z',
    maintainerCount: 3,
    hasNativeCode: false,
    compatibleExpoSdk: null,
    advisories: [],
    ...overrides,
  };
}

describe('dependency-audit', () => {
  describe('VULNERABILITY_SEVERITIES + SEVERITY_WEIGHT', () => {
    it('exposes 4 severities: low / medium / high / critical', () => {
      expect(VULNERABILITY_SEVERITIES).toEqual(['low', 'medium', 'high', 'critical']);
    });

    it('weights severities on a log-ish curve', () => {
      expect(SEVERITY_WEIGHT.low).toBe(1);
      expect(SEVERITY_WEIGHT.medium).toBe(5);
      expect(SEVERITY_WEIGHT.high).toBe(25);
      expect(SEVERITY_WEIGHT.critical).toBe(100);
    });

    it('isVulnerabilitySeverity accepts known severities', () => {
      for (const s of VULNERABILITY_SEVERITIES) {
        expect(isVulnerabilitySeverity(s)).toBe(true);
      }
    });

    it('isVulnerabilitySeverity rejects unknown values', () => {
      expect(isVulnerabilitySeverity('none')).toBe(false);
      expect(isVulnerabilitySeverity(42)).toBe(false);
      expect(isVulnerabilitySeverity(null)).toBe(false);
    });
  });

  describe('classifyCvssScore', () => {
    it.each<[number, 'low' | 'medium' | 'high' | 'critical']>([
      [0, 'low'],
      [3.9, 'low'],
      [4.0, 'medium'],
      [6.9, 'medium'],
      [7.0, 'high'],
      [8.9, 'high'],
      [9.0, 'critical'],
      [10, 'critical'],
    ])('classifies CVSS %f → %s', (cvss, expected) => {
      expect(classifyCvssScore(cvss)).toBe(expected);
    });

    it('rejects invalid CVSS scores', () => {
      expect(() => classifyCvssScore(NaN)).toThrow();
      expect(() => classifyCvssScore(-1)).toThrow();
      expect(() => classifyCvssScore(Infinity)).toThrow();
    });
  });

  describe('compareOutdatedLevel', () => {
    it('returns "current" when versions match', () => {
      expect(compareOutdatedLevel('1.2.3', '1.2.3')).toBe('current');
    });

    it('returns "patch" when only patch differs', () => {
      expect(compareOutdatedLevel('1.2.3', '1.2.5')).toBe('patch');
    });

    it('returns "minor" when minor differs', () => {
      expect(compareOutdatedLevel('1.2.3', '1.3.0')).toBe('minor');
    });

    it('returns "major" when major differs', () => {
      expect(compareOutdatedLevel('1.2.3', '2.0.0')).toBe('major');
    });

    it('strips pre-release suffixes before comparing', () => {
      expect(compareOutdatedLevel('1.2.3-beta.1', '1.2.3')).toBe('current');
    });

    it('returns "major" when versions cannot be parsed', () => {
      expect(compareOutdatedLevel('latest', '1.2.3')).toBe('major');
      expect(compareOutdatedLevel('1.2.3', '')).toBe('major');
    });

    it('OUTDATED_LEVELS exposes the 4 levels', () => {
      expect(OUTDATED_LEVELS).toEqual(['current', 'patch', 'minor', 'major']);
    });
  });

  describe('isAbandoned', () => {
    it('returns true when maintainerCount is 0', () => {
      const m = makeMetadata({ maintainerCount: 0 });
      expect(isAbandoned(m, NOW)).toBe(true);
    });

    it('returns true when latest publish is 2+ years ago', () => {
      const m = makeMetadata({
        maintainerCount: 5,
        latestPublishDate: '2022-01-01T00:00:00.000Z',
      });
      expect(isAbandoned(m, NOW)).toBe(true);
    });

    it('returns false when published within the last 2 years and has maintainers', () => {
      const m = makeMetadata({
        maintainerCount: 2,
        latestPublishDate: '2024-06-01T00:00:00.000Z',
      });
      expect(isAbandoned(m, NOW)).toBe(false);
    });

    it('returns false when dates cannot be parsed (conservative)', () => {
      const m = makeMetadata({ latestPublishDate: 'not-a-date' });
      expect(isAbandoned(m, NOW)).toBe(false);
    });
  });

  describe('classifyExpoNativeModuleRisk', () => {
    it('returns "none" for pure-JS packages', () => {
      const m = makeMetadata({ hasNativeCode: false });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('none');
    });

    it('returns "high" for native packages without a declared compatibleExpoSdk', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: null });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('high');
    });

    it('returns "medium" when runningExpoSdk is null but compatibleExpoSdk is set', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: '50' });
      expect(classifyExpoNativeModuleRisk(m, null)).toBe('medium');
    });

    it('returns "low" when SDK majors match', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: '51' });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('low');
    });

    it('returns "medium" when SDK majors differ by 1', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: '50' });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('medium');
    });

    it('returns "high" when SDK majors differ by 2+', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: '48' });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('high');
    });

    it('parses "sdk-51" and "51" alike', () => {
      const m = makeMetadata({ hasNativeCode: true, compatibleExpoSdk: 'sdk-51' });
      expect(classifyExpoNativeModuleRisk(m, '51')).toBe('low');
    });
  });

  describe('classifyRiskLevel', () => {
    it('returns "urgent" when hasCritical is true', () => {
      expect(classifyRiskLevel(0, true)).toBe('urgent');
    });

    it('returns "urgent" when riskScore >= 100', () => {
      expect(classifyRiskLevel(100, false)).toBe('urgent');
      expect(classifyRiskLevel(150, false)).toBe('urgent');
    });

    it('returns "review" when 25 <= riskScore < 100', () => {
      expect(classifyRiskLevel(25, false)).toBe('review');
      expect(classifyRiskLevel(99, false)).toBe('review');
    });

    it('returns "safe" when riskScore < 25', () => {
      expect(classifyRiskLevel(0, false)).toBe('safe');
      expect(classifyRiskLevel(24, false)).toBe('safe');
    });
  });

  describe('auditDependency', () => {
    it('returns safe finding for an up-to-date, pure-JS package with no advisories', () => {
      const m = makeMetadata();
      const f = auditDependency(m, NOW, '51');
      expect(f.riskLevel).toBe('safe');
      expect(f.riskScore).toBe(0);
      expect(f.abandoned).toBe(false);
      expect(f.expoNativeModuleRisk).toBe('none');
      expect(f.outdatedLevel).toBe('current');
    });

    it('multiplies risk score by 2 when the package is abandoned', () => {
      const advisory: DependencyAdvisory = {
        id: 'GHSA-1',
        severity: 'medium',
        patchAvailable: true,
      };
      const m = makeMetadata({
        advisories: [advisory],
        latestPublishDate: '2020-01-01T00:00:00.000Z',
        maintainerCount: 0,
      });
      const f = auditDependency(m, NOW, null);
      // medium base = 5, abandoned doubles to 10
      expect(f.abandoned).toBe(true);
      expect(f.riskScore).toBe(10);
    });

    it('escalates to "urgent" when a critical advisory exists', () => {
      const m = makeMetadata({
        advisories: [{ id: 'GHSA-2', severity: 'critical', patchAvailable: true }],
      });
      const f = auditDependency(m, NOW, '51');
      expect(f.criticalAdvisories).toBe(1);
      expect(f.riskLevel).toBe('urgent');
    });

    it('counts advisories per severity', () => {
      const m = makeMetadata({
        advisories: [
          { id: 'a', severity: 'low', patchAvailable: true },
          { id: 'b', severity: 'low', patchAvailable: true },
          { id: 'c', severity: 'medium', patchAvailable: true },
          { id: 'd', severity: 'high', patchAvailable: true },
          { id: 'e', severity: 'critical', patchAvailable: true },
        ],
      });
      const f = auditDependency(m, NOW, '51');
      expect(f.lowAdvisories).toBe(2);
      expect(f.mediumAdvisories).toBe(1);
      expect(f.highAdvisories).toBe(1);
      expect(f.criticalAdvisories).toBe(1);
    });

    it('adds drift + native-module risk to the score', () => {
      const m = makeMetadata({
        installedVersion: '1.0.0',
        latestVersion: '2.0.0',
        hasNativeCode: true,
        compatibleExpoSdk: '48',
      });
      const f = auditDependency(m, NOW, '51');
      // major drift (+10) + high native-module risk (+50) = 60
      expect(f.outdatedLevel).toBe('major');
      expect(f.expoNativeModuleRisk).toBe('high');
      expect(f.riskScore).toBe(60);
      expect(f.riskLevel).toBe('review');
    });
  });

  describe('auditDependencies (aggregate)', () => {
    it('aggregates findings into a summary', () => {
      const pkgs = [
        makeMetadata({ name: 'safe-pkg' }),
        makeMetadata({
          name: 'risky-pkg',
          advisories: [{ id: 'a', severity: 'high', patchAvailable: true }],
        }),
        makeMetadata({
          name: 'critical-pkg',
          advisories: [{ id: 'b', severity: 'critical', patchAvailable: false }],
        }),
      ];
      const summary = auditDependencies(pkgs, NOW, '51');
      expect(summary.totalPackages).toBe(3);
      expect(summary.urgentCount).toBe(1);
      expect(summary.reviewCount).toBe(1);
      expect(summary.safeCount).toBe(1);
      expect(summary.totalCriticalAdvisories).toBe(1);
      expect(summary.totalHighAdvisories).toBe(1);
      expect(summary.overallRiskLevel).toBe('urgent');
    });

    it('reports no Expo native-module risks when all packages are pure-JS', () => {
      const summary = auditDependencies([makeMetadata({ name: 'a' })], NOW, '51');
      expect(summary.expoNativeModuleRiskPackages).toEqual([]);
    });

    it('reports Expo native-module risk packages', () => {
      const summary = auditDependencies(
        [
          makeMetadata({ name: 'native-pkg', hasNativeCode: true, compatibleExpoSdk: '48' }),
          makeMetadata({ name: 'js-pkg' }),
        ],
        NOW,
        '51',
      );
      expect(summary.expoNativeModuleRiskPackages).toEqual(['native-pkg']);
    });

    it('reports abandoned package count', () => {
      const summary = auditDependencies(
        [
          makeMetadata({ name: 'recent', latestPublishDate: '2024-12-01T00:00:00.000Z' }),
          makeMetadata({
            name: 'old',
            latestPublishDate: '2020-01-01T00:00:00.000Z',
            maintainerCount: 0,
          }),
        ],
        NOW,
        '51',
      );
      expect(summary.abandonedCount).toBe(1);
    });

    it('overallRiskLevel is "safe" when no packages have findings', () => {
      const summary = auditDependencies([makeMetadata()], NOW, '51');
      expect(summary.overallRiskLevel).toBe('safe');
    });

    it('overallRiskLevel is "review" when at least one package is review-level', () => {
      const summary = auditDependencies(
        [
          makeMetadata(),
          makeMetadata({
            name: 'risky',
            advisories: [{ id: 'a', severity: 'high', patchAvailable: true }],
          }),
        ],
        NOW,
        '51',
      );
      expect(summary.overallRiskLevel).toBe('review');
    });

    it('returns frozen arrays', () => {
      const summary = auditDependencies([makeMetadata()], NOW, '51');
      expect(Object.isFrozen(summary.findings)).toBe(true);
      expect(Object.isFrozen(summary.expoNativeModuleRiskPackages)).toBe(true);
    });
  });
});
