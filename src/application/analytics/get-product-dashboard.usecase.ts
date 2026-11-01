/**
 * Use case: Build a product analytics dashboard.
 *
 * Returns DAU/WAU/MAU counts, feature adoption rates, and manual-vs-OCR
 * breakdown. CRITICAL: no exact amounts, no merchant names, no UPI IDs,
 * no raw receipt text — the dashboard only carries aggregate counts and
 * ratios.
 */

import type { AnalyticsRepository } from './analytics-repository.port';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface ProductDashboard {
  readonly generatedAt: string;
  readonly dau: number;
  readonly wau: number;
  readonly mau: number;
  readonly groupsCreatedLast7Days: number;
  readonly expensesCreatedLast7Days: number;
  readonly receiptsScannedLast7Days: number;
  readonly manualVsOcrLast7Days: {
    readonly manual: number;
    readonly ocr: number;
    readonly bucket: 'manual' | 'ocr' | 'mixed';
  };
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class GetProductDashboardUseCase {
  constructor(private readonly repo: AnalyticsRepository) {}

  async execute(nowIso: string = new Date().toISOString()): Promise<ProductDashboard> {
    if (Number.isNaN(Date.parse(nowIso))) {
      throw new Error('nowIso must be a valid ISO date-time');
    }

    const [dau, wau, mau, groupsCreated, expensesCreated, receiptsScanned, manualCount, ocrCount] =
      await Promise.all([
        this.repo.countActiveAnonymousIds(1),
        this.repo.countActiveAnonymousIds(7),
        this.repo.countActiveAnonymousIds(30),
        this.repo.countEventsByName('group_created', 7),
        this.repo.countEventsByName('expense_created', 7),
        this.repo.countEventsByName('receipt_scanned', 7),
        this.repo.countEventsByName('expense_created_manual', 7),
        this.repo.countEventsByName('expense_created_ocr', 7),
      ]);

    const bucket: 'manual' | 'ocr' | 'mixed' =
      manualCount > 0 && ocrCount > 0
        ? 'mixed'
        : ocrCount > 0
          ? 'ocr'
          : 'manual';

    return {
      generatedAt: nowIso,
      dau,
      wau,
      mau,
      groupsCreatedLast7Days: groupsCreated,
      expensesCreatedLast7Days: expensesCreated,
      receiptsScannedLast7Days: receiptsScanned,
      manualVsOcrLast7Days: {
        manual: manualCount,
        ocr: ocrCount,
        bucket,
      },
    };
  }
}
