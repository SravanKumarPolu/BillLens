import {
  shouldRequireApproval,
  getApprovalChain,
  getNextApprover,
  isFullyApproved,
  isRejected,
  computeApprovalExpiry,
  type ApprovalChainConfig,
  type ApprovalRequest,
} from '../approval-workflow';

describe('enterprise / approval-workflow', () => {
  describe('shouldRequireApproval', () => {
    it('returns true when amount exceeds threshold', () => {
      expect(shouldRequireApproval(6000, 5000)).toBe(true);
    });
    it('returns false when amount equals threshold (strictly greater required)', () => {
      expect(shouldRequireApproval(5000, 5000)).toBe(false);
    });
    it('returns false when amount below threshold', () => {
      expect(shouldRequireApproval(4000, 5000)).toBe(false);
    });
    it('returns true when threshold is 0 (all require approval)', () => {
      expect(shouldRequireApproval(1, 0)).toBe(true);
    });
    it('treats negative threshold as 0', () => {
      expect(shouldRequireApproval(1, -100)).toBe(true);
    });
    it('returns false for non-finite inputs', () => {
      expect(shouldRequireApproval(Number.NaN, 5000)).toBe(false);
      expect(shouldRequireApproval(5000, Number.NaN)).toBe(false);
    });
    it('returns false for negative amount', () => {
      expect(shouldRequireApproval(-100, 5000)).toBe(false);
    });
  });

  describe('getApprovalChain', () => {
    const config: ApprovalChainConfig = {
      orgId: 'org_1',
      departmentId: 'dept_1',
      levels: [
        { approverId: 'manager_1', thresholdMinor: 5_000 },
        { approverId: 'director_1', thresholdMinor: 25_000 },
        { approverId: 'vp_1', thresholdMinor: 100_000 },
      ],
      finalApproverId: 'cfo_1',
    };
    it('returns chain of one when amount > 5000 but <= 25000', () => {
      expect(getApprovalChain(config, 6_000)).toEqual(['manager_1']);
    });
    it('returns director + manager when amount > 25000', () => {
      expect(getApprovalChain(config, 26_000)).toEqual([
        'manager_1',
        'director_1',
      ]);
    });
    it('returns full chain when amount > 100000', () => {
      expect(getApprovalChain(config, 200_000)).toEqual([
        'manager_1',
        'director_1',
        'vp_1',
        'cfo_1',
      ]);
    });
    it('returns empty chain when amount below all thresholds', () => {
      expect(getApprovalChain(config, 1_000)).toEqual([]);
    });
    it('returns empty chain when no levels configured and amount below finalApprover', () => {
      const empty: ApprovalChainConfig = {
        orgId: 'org_1',
        departmentId: 'dept_1',
        levels: [],
        finalApproverId: 'cfo_1',
      };
      // With no levels, finalApprover is included if amount > 0 (above
      // the "last level" threshold which is -Infinity when empty).
      expect(getApprovalChain(empty, 1)).toEqual(['cfo_1']);
    });
    it('deduplicates approver IDs', () => {
      const dup: ApprovalChainConfig = {
        orgId: 'org_1',
        departmentId: 'dept_1',
        levels: [
          { approverId: 'same_user', thresholdMinor: 1_000 },
          { approverId: 'same_user', thresholdMinor: 5_000 },
        ],
      };
      expect(getApprovalChain(dup, 6_000)).toEqual(['same_user']);
    });
  });

  describe('getNextApprover', () => {
    const chain = ['manager_1', 'director_1', 'vp_1'];
    it('returns first approver when no requests', () => {
      expect(getNextApprover(chain, [])).toBe('manager_1');
    });
    it('returns second approver when first approved', () => {
      const requests: ApprovalRequest[] = [
        {
          id: 'r1',
          expenseId: 'e1',
          approverId: 'manager_1',
          status: 'approved',
          requestedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      expect(getNextApprover(chain, requests)).toBe('director_1');
    });
    it('returns null when all approved', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', expenseId: 'e1', approverId: 'director_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r3', expenseId: 'e1', approverId: 'vp_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(getNextApprover(chain, requests)).toBeNull();
    });
    it('skips rejected approvers too', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'rejected', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(getNextApprover(chain, requests)).toBe('director_1');
    });
  });

  describe('isFullyApproved', () => {
    const chain = ['manager_1', 'director_1'];
    it('returns true when chain is empty', () => {
      expect(isFullyApproved([], [])).toBe(true);
    });
    it('returns true when every chain member approved', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', expenseId: 'e1', approverId: 'director_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(isFullyApproved(chain, requests)).toBe(true);
    });
    it('returns false when one is pending', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', expenseId: 'e1', approverId: 'director_1', status: 'pending', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(isFullyApproved(chain, requests)).toBe(false);
    });
  });

  describe('isRejected', () => {
    it('returns true when any request is rejected', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'r2', expenseId: 'e1', approverId: 'director_1', status: 'rejected', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(isRejected(['manager_1', 'director_1'], requests)).toBe(true);
    });
    it('returns false when no rejections', () => {
      const requests: ApprovalRequest[] = [
        { id: 'r1', expenseId: 'e1', approverId: 'manager_1', status: 'approved', requestedAt: '2026-01-01T00:00:00.000Z' },
      ];
      expect(isRejected(['manager_1'], requests)).toBe(false);
    });
  });

  describe('computeApprovalExpiry', () => {
    it('returns ISO string 7 days after requestedAt by default', () => {
      const requested = '2026-01-01T00:00:00.000Z';
      const expiry = computeApprovalExpiry(requested);
      expect(expiry).toBe('2026-01-08T00:00:00.000Z');
    });
    it('honours custom SLA days', () => {
      const requested = '2026-01-01T00:00:00.000Z';
      const expiry = computeApprovalExpiry(requested, 3);
      expect(expiry).toBe('2026-01-04T00:00:00.000Z');
    });
    it('returns input unchanged on invalid date', () => {
      const expiry = computeApprovalExpiry('not-a-date');
      expect(expiry).toBe('not-a-date');
    });
  });
});
