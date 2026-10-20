/**
 * Vendor management tests.
 *
 * Phase 10 Prompt 97.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type Vendor,
  assessVendorRisk,
  getDpiaGaps,
  getHighRiskVendors,
  isContractExpiringSoon,
  isDpiaRequired,
} from '../vendor-management';

function makeVendor(overrides: Partial<Vendor>): Vendor {
  return {
    id: 'vendor-1',
    name: 'Test Vendor',
    service: 'Test Service',
    riskLevel: 'medium',
    dataAccess: 'limited',
    dpiaCompleted: false,
    ...overrides,
  };
}

describe('assessVendorRisk', () => {
  it('returns "low" for dataAccess=none', () => {
    const vendor = makeVendor({ dataAccess: 'none', riskLevel: 'low' });
    expect(assessVendorRisk(vendor)).toBe('low');
  });

  it('returns "medium" for dataAccess=limited', () => {
    const vendor = makeVendor({ dataAccess: 'limited', riskLevel: 'medium' });
    expect(assessVendorRisk(vendor)).toBe('medium');
  });

  it('returns "high" for dataAccess=extensive', () => {
    const vendor = makeVendor({
      dataAccess: 'extensive',
      riskLevel: 'high',
    });
    expect(assessVendorRisk(vendor)).toBe('high');
  });

  it('returns "critical" for dataAccess=full', () => {
    const vendor = makeVendor({
      dataAccess: 'full',
      riskLevel: 'critical',
    });
    expect(assessVendorRisk(vendor)).toBe('critical');
  });

  it('returns the COMPUTED baseline when declared risk is LOWER than baseline', () => {
    // dataAccess=full should be critical, even if declared as medium
    const vendor = makeVendor({
      dataAccess: 'full',
      riskLevel: 'medium',
    });
    expect(assessVendorRisk(vendor)).toBe('critical');
  });

  it('returns the DECLARED risk when it is HIGHER than the computed baseline', () => {
    // dataAccess=limited would be medium, but declared as critical
    const vendor = makeVendor({
      dataAccess: 'limited',
      riskLevel: 'critical',
    });
    expect(assessVendorRisk(vendor)).toBe('critical');
  });

  it('returns the declared risk when equal to baseline', () => {
    const vendor = makeVendor({
      dataAccess: 'extensive',
      riskLevel: 'high',
    });
    expect(assessVendorRisk(vendor)).toBe('high');
  });
});

describe('getHighRiskVendors', () => {
  it('returns only high and critical vendors', () => {
    const vendors: readonly Vendor[] = [
      makeVendor({ id: '1', dataAccess: 'none', riskLevel: 'low' }),
      makeVendor({ id: '2', dataAccess: 'limited', riskLevel: 'medium' }),
      makeVendor({ id: '3', dataAccess: 'extensive', riskLevel: 'high' }),
      makeVendor({ id: '4', dataAccess: 'full', riskLevel: 'critical' }),
    ];
    const highRisk = getHighRiskVendors(vendors);
    expect(highRisk.map((v) => v.id)).toEqual(['3', '4']);
  });

  it('includes vendors whose declared risk is high even if dataAccess is lower', () => {
    const vendors: readonly Vendor[] = [
      makeVendor({
        id: '5',
        dataAccess: 'limited',
        riskLevel: 'high',
      }),
    ];
    const highRisk = getHighRiskVendors(vendors);
    expect(highRisk.map((v) => v.id)).toEqual(['5']);
  });

  it('returns an empty list when no vendors are high risk', () => {
    const vendors: readonly Vendor[] = [
      makeVendor({ id: '1', dataAccess: 'none', riskLevel: 'low' }),
      makeVendor({ id: '2', dataAccess: 'limited', riskLevel: 'medium' }),
    ];
    expect(getHighRiskVendors(vendors)).toEqual([]);
  });

  it('returns an empty list for an empty input', () => {
    expect(getHighRiskVendors([])).toEqual([]);
  });
});

describe('isDpiaRequired', () => {
  it('returns true for dataAccess=extensive', () => {
    expect(isDpiaRequired(makeVendor({ dataAccess: 'extensive' }))).toBe(true);
  });

  it('returns true for dataAccess=full', () => {
    expect(isDpiaRequired(makeVendor({ dataAccess: 'full' }))).toBe(true);
  });

  it('returns false for dataAccess=none', () => {
    expect(isDpiaRequired(makeVendor({ dataAccess: 'none' }))).toBe(false);
  });

  it('returns false for dataAccess=limited', () => {
    expect(isDpiaRequired(makeVendor({ dataAccess: 'limited' }))).toBe(false);
  });
});

describe('getDpiaGaps', () => {
  it('returns vendors requiring DPIA that have not completed one', () => {
    const vendors: readonly Vendor[] = [
      makeVendor({
        id: '1',
        dataAccess: 'full',
        dpiaCompleted: false,
      }),
      makeVendor({
        id: '2',
        dataAccess: 'extensive',
        dpiaCompleted: true,
      }),
      makeVendor({
        id: '3',
        dataAccess: 'limited',
        dpiaCompleted: false,
      }),
    ];
    const gaps = getDpiaGaps(vendors);
    expect(gaps.map((v) => v.id)).toEqual(['1']);
  });

  it('returns an empty list when all required DPIAs are complete', () => {
    const vendors: readonly Vendor[] = [
      makeVendor({
        id: '1',
        dataAccess: 'full',
        dpiaCompleted: true,
      }),
      makeVendor({
        id: '2',
        dataAccess: 'extensive',
        dpiaCompleted: true,
      }),
    ];
    expect(getDpiaGaps(vendors)).toEqual([]);
  });

  it('returns an empty list for an empty input', () => {
    expect(getDpiaGaps([])).toEqual([]);
  });
});

describe('isContractExpiringSoon', () => {
  const NOW = '2026-07-15T00:00:00.000Z';

  it('returns true when contract expires within the window', () => {
    const vendor = makeVendor({
      contractExpiresAt: '2026-07-20T00:00:00.000Z', // 5 days out
    });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(true);
  });

  it('returns false when contract expires after the window', () => {
    const vendor = makeVendor({
      contractExpiresAt: '2026-12-31T00:00:00.000Z', // ~170 days out
    });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(false);
  });

  it('returns false when there is no contract expiry date', () => {
    const vendor = makeVendor({ contractExpiresAt: undefined });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(false);
  });

  it('returns false when the contract has already expired (different alert)', () => {
    const vendor = makeVendor({
      contractExpiresAt: '2026-01-01T00:00:00.000Z',
    });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(false);
  });

  it('returns true at the boundary (expires exactly at window end)', () => {
    const vendor = makeVendor({
      contractExpiresAt: '2026-08-14T00:00:00.000Z', // 30 days out
    });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(true);
  });

  it('returns false for an invalid expiry date', () => {
    const vendor = makeVendor({ contractExpiresAt: 'not-a-date' });
    expect(isContractExpiringSoon(vendor, 30, NOW)).toBe(false);
  });

  it('returns false for an invalid now', () => {
    const vendor = makeVendor({
      contractExpiresAt: '2026-08-14T00:00:00.000Z',
    });
    expect(isContractExpiringSoon(vendor, 30, 'not-a-date')).toBe(false);
  });
});

describe('BillLens vendor inventory (regression)', () => {
  it('Supabase is critical (full data access) and requires DPIA', () => {
    const supabase: Vendor = {
      id: 'vendor-supabase',
      name: 'Supabase',
      service: 'Supabase',
      riskLevel: 'critical',
      dataAccess: 'full',
      dpiaCompleted: true,
      dpiaDate: '2026-03-01T00:00:00.000Z',
      soc2Report: 'https://supabase.com/soc2',
      iso27001: true,
      scope: '',
    } as unknown as Vendor;
    expect(assessVendorRisk(supabase)).toBe('critical');
    expect(isDpiaRequired(supabase)).toBe(true);
    expect(supabase.dpiaCompleted).toBe(true);
  });

  it('OCR Provider is high risk and requires DPIA', () => {
    const ocr: Vendor = {
      id: 'vendor-ocr',
      name: 'Google Vision',
      service: 'OCR Provider',
      riskLevel: 'high',
      dataAccess: 'extensive',
      dpiaCompleted: true,
      dpiaDate: '2026-04-01T00:00:00.000Z',
      scope: '',
    } as unknown as Vendor;
    expect(assessVendorRisk(ocr)).toBe('high');
    expect(isDpiaRequired(ocr)).toBe(true);
  });

  it('Push Notifications is low/medium risk (no DPIA)', () => {
    const push: Vendor = {
      id: 'vendor-push',
      name: 'Expo Notifications',
      service: 'Push Notifications',
      riskLevel: 'medium',
      dataAccess: 'limited',
      dpiaCompleted: false,
      scope: '',
    } as unknown as Vendor;
    expect(isDpiaRequired(push)).toBe(false);
  });
});
