import { describe, expect, it } from '@jest/globals';

import { parseReceiptText } from '@domain/services/ocr/receipt-text-parser';

const UDUPI_RECEIPT = `Udupi's Upahar (Gowlidoddy)
Date: 20/10/2026   Time: 09:43
Bill No: 152000
Set Dosa  1 x 95.24 = 95.24
Subtotal: 95.24
SGST 2.5%: 2.38
CGST 2.5%: 2.38
Grand total: 100.00`;

describe('parseReceiptText', () => {
  it('parses the ₹100 Udupi receipt and reconciles the total', () => {
    const parsed = parseReceiptText(UDUPI_RECEIPT);
    expect(parsed.merchant).toContain("Udupi's Upahar");
    expect(parsed.date).toBe('2026-10-20');
    expect(parsed.currencyCode).toBe('INR');
    expect(parsed.subtotalMinor).toBe(9_524);
    expect(parsed.taxMinor).toBe(476);
    expect(parsed.totalMinor).toBe(10_000);
    expect(parsed.lineItems).toEqual([
      { name: 'Set Dosa', quantity: 1, unitPriceMinor: 9_524, totalAmountMinor: 9_524 },
    ]);
    expect(parsed.totalMatches).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it('flags a mismatched total instead of inventing one', () => {
    const parsed = parseReceiptText('Cafe\nSubtotal: 100.00\nTax: 5.00\nGrand total: 120.00');
    expect(parsed.totalMatches).toBe(false);
    expect(parsed.warnings.join(' ')).toMatch(/does not match/);
  });

  it('handles empty OCR output', () => {
    const parsed = parseReceiptText('   ');
    expect(parsed.totalMinor).toBeUndefined();
    expect(parsed.lineItems).toEqual([]);
    expect(parsed.warnings[0]).toMatch(/No text/);
  });

  it('detects a discount', () => {
    const parsed = parseReceiptText('Shop\nSubtotal: 200.00\nDiscount: 20.00\nTotal: 180.00');
    expect(parsed.discountMinor).toBe(2_000);
    expect(parsed.totalMatches).toBe(true);
  });
});
