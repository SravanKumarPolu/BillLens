/**
 * Compliance framework tests.
 *
 * Phase 10 Prompt 97.
 *
 * CRITICAL: these tests assert that BillLens does NOT claim SOC 2 /
 * ISO 27001 certification in Phase 10. If a future change accidentally
 * marks a program as 'certified', these tests will fail loudly.
 */

import { describe, expect, it } from '@jest/globals';

import {
  COMPLIANCE_PROGRAMS,
  type ComplianceProgram,
  getClaimedStandards,
  getComplianceProgram,
  getComplianceReadiness,
  getInProgressStandards,
  isComplianceClaimed,
} from '../compliance-framework';

describe('COMPLIANCE_PROGRAMS registry', () => {
  it('contains all 10 standards', () => {
    expect(COMPLIANCE_PROGRAMS).toHaveLength(10);
    const standards = COMPLIANCE_PROGRAMS.map((p) => p.standard);
    expect(standards).toEqual(
      expect.arrayContaining([
        'SOC2_Type1',
        'SOC2_Type2',
        'ISO27001',
        'ISO27017',
        'ISO27018',
        'GDPR',
        'CCPA',
        'LGPD',
        'HIPAA',
        'PCI_DSS',
      ]),
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(COMPLIANCE_PROGRAMS)).toBe(true);
  });

  it('SOC 2 Type II is in_progress, NOT certified', () => {
    const soc2t2 = getComplianceProgram('SOC2_Type2');
    expect(soc2t2).not.toBeNull();
    expect(soc2t2?.status).toBe('in_progress');
    expect(soc2t2?.certifiedDate).toBeUndefined();
  });

  it('ISO 27001 is not_started', () => {
    const iso = getComplianceProgram('ISO27001');
    expect(iso).not.toBeNull();
    expect(iso?.status).toBe('not_started');
  });

  it('SOC 2 Type I is audit_ready (not certified)', () => {
    const soc2t1 = getComplianceProgram('SOC2_Type1');
    expect(soc2t1).not.toBeNull();
    expect(soc2t1?.status).toBe('audit_ready');
  });

  it('PCI-DSS is not_applicable (no cardholder data)', () => {
    const pci = getComplianceProgram('PCI_DSS');
    expect(pci).not.toBeNull();
    expect(pci?.status).toBe('not_applicable');
  });

  it('HIPAA is not_applicable (no PHI)', () => {
    const hipaa = getComplianceProgram('HIPAA');
    expect(hipaa).not.toBeNull();
    expect(hipaa?.status).toBe('not_applicable');
  });

  it('GDPR/CCPA/LGPD are in_progress (regulatory, not certifiable)', () => {
    expect(getComplianceProgram('GDPR')?.status).toBe('in_progress');
    expect(getComplianceProgram('CCPA')?.status).toBe('in_progress');
    expect(getComplianceProgram('LGPD')?.status).toBe('in_progress');
  });
});

describe('isComplianceClaimed — CRITICAL', () => {
  it('returns false for SOC 2 Type II (in_progress)', () => {
    const soc2t2 = getComplianceProgram('SOC2_Type2')!;
    expect(isComplianceClaimed(soc2t2)).toBe(false);
  });

  it('returns false for ISO 27001 (not_started)', () => {
    const iso = getComplianceProgram('ISO27001')!;
    expect(isComplianceClaimed(iso)).toBe(false);
  });

  it('returns false for SOC 2 Type I (audit_ready, not certified)', () => {
    const soc2t1 = getComplianceProgram('SOC2_Type1')!;
    expect(isComplianceClaimed(soc2t1)).toBe(false);
  });

  it('returns false when status is certified but certifiedDate is missing', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(false);
  });

  it('returns false when status is certified but certifiedDate is empty string', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: '',
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(false);
  });

  it('returns false when status is certified but certifiedDate is unparseable', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: 'not-a-date',
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(false);
  });

  it('returns true when status is certified and certifiedDate is valid + not expired', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: '2026-01-01T00:00:00.000Z',
      expiryDate: '2099-12-31T00:00:00.000Z',
      auditor: 'Prescient Assurance',
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(true);
  });

  it('returns false when status is certified but certificate has expired', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: '2020-01-01T00:00:00.000Z',
      expiryDate: '2020-12-31T00:00:00.000Z', // expired
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(false);
  });

  it('returns false for not_applicable status (cannot claim a non-applicable standard)', () => {
    const hipaa = getComplianceProgram('HIPAA')!;
    expect(isComplianceClaimed(hipaa)).toBe(false);
  });

  it('returns false for expired status', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'expired',
      certifiedDate: '2020-01-01T00:00:00.000Z',
      expiryDate: '2020-12-31T00:00:00.000Z',
      scope: 'production',
      notes: '',
    };
    expect(isComplianceClaimed(program)).toBe(false);
  });
});

describe('getClaimedStandards — CRITICAL', () => {
  it('returns an EMPTY list in Phase 10 (no certifications claimed)', () => {
    expect(getClaimedStandards()).toEqual([]);
  });
});

describe('getInProgressStandards', () => {
  it('returns GDPR, CCPA, LGPD, and SOC 2 Type II', () => {
    const inProgress = getInProgressStandards();
    expect(inProgress).toEqual(
      expect.arrayContaining([
        'SOC2_Type2',
        'GDPR',
        'CCPA',
        'LGPD',
      ]),
    );
  });

  it('does NOT include not_started standards (ISO 27001)', () => {
    const inProgress = getInProgressStandards();
    expect(inProgress).not.toContain('ISO27001');
  });
});

describe('getComplianceReadiness', () => {
  it('returns 100 for not_applicable (HIPAA, PCI-DSS)', () => {
    expect(getComplianceReadiness(getComplianceProgram('HIPAA')!)).toBe(100);
    expect(getComplianceReadiness(getComplianceProgram('PCI_DSS')!)).toBe(100);
  });

  it('returns 90 for audit_ready (SOC 2 Type I)', () => {
    expect(getComplianceReadiness(getComplianceProgram('SOC2_Type1')!)).toBe(90);
  });

  it('returns at most 89 for in_progress (SOC 2 Type II)', () => {
    const readiness = getComplianceReadiness(
      getComplianceProgram('SOC2_Type2')!,
    );
    expect(readiness).toBeGreaterThan(0);
    expect(readiness).toBeLessThanOrEqual(89);
  });

  it('returns 5 for not_started (ISO 27001)', () => {
    expect(getComplianceReadiness(getComplianceProgram('ISO27001')!)).toBe(5);
  });

  it('returns 100 for a valid certified program (not expired)', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: '2026-01-01T00:00:00.000Z',
      expiryDate: '2099-12-31T00:00:00.000Z',
      scope: 'production',
      notes: '',
    };
    expect(getComplianceReadiness(program)).toBe(100);
  });

  it('returns 60 for an expired-but-certified program', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'certified',
      certifiedDate: '2020-01-01T00:00:00.000Z',
      expiryDate: '2020-12-31T00:00:00.000Z',
      scope: 'production',
      notes: '',
    };
    expect(getComplianceReadiness(program)).toBe(60);
  });

  it('returns 30 for an expired-status program', () => {
    const program: ComplianceProgram = {
      standard: 'SOC2_Type2',
      status: 'expired',
      scope: 'production',
      notes: '',
    };
    expect(getComplianceReadiness(program)).toBe(30);
  });

  it('returns higher readiness when target+start+auditor are all set', () => {
    const withTarget: ComplianceProgram = {
      standard: 'ISO27001',
      status: 'in_progress',
      startDate: '2026-01-01T00:00:00.000Z',
      targetDate: '2027-01-01T00:00:00.000Z',
      auditor: 'BSI',
      scope: 'production',
      notes: '',
    };
    const withoutTarget: ComplianceProgram = {
      standard: 'ISO27001',
      status: 'in_progress',
      scope: 'production',
      notes: '',
    };
    expect(getComplianceReadiness(withTarget)).toBeGreaterThan(
      getComplianceReadiness(withoutTarget),
    );
  });

  it('GDPR/CCPA/LGPD (regulatory) return non-zero readiness', () => {
    expect(getComplianceReadiness(getComplianceProgram('GDPR')!)).toBeGreaterThan(
      0,
    );
    expect(getComplianceReadiness(getComplianceProgram('CCPA')!)).toBeGreaterThan(
      0,
    );
    expect(getComplianceReadiness(getComplianceProgram('LGPD')!)).toBeGreaterThan(
      0,
    );
  });
});

describe('getComplianceProgram', () => {
  it('returns null for an unknown standard', () => {
    expect(
      getComplianceProgram('FAKE_STANDARD' as unknown as Parameters<typeof getComplianceProgram>[0]),
    ).toBeNull();
  });

  it('returns the program for a known standard', () => {
    expect(getComplianceProgram('SOC2_Type2')?.standard).toBe('SOC2_Type2');
  });
});
