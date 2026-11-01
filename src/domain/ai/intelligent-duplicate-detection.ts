/**
 * Intelligent duplicate detection — similarity-based duplicate finder.
 *
 * Phase 10 Prompt 96: AI Evolution.
 *
 * CRITICAL CONSTRAINTS:
 *   - This module is ADVISORY ONLY. It returns `{ isDuplicate, confidence,
 *     signals }` — the application layer presents this to the user as a
 *     warning. The user decides whether to keep both, merge, or delete.
 *   - It NEVER auto-deletes or auto-merges expenses.
 *   - Every signal includes a `reason` field (explainable).
 *   - Confidence is 0-1; the application layer typically treats
 *     confidence >= 0.85 as "very likely duplicate" and confidence
 *     0.5-0.85 as "possibly duplicate".
 *
 * Detection signals:
 *   - Title similarity (Levenshtein-based, 0-1).
 *   - Amount exactness (1.0 if exact, 0.5 if within ±2%).
 *   - Date proximity (1.0 if same date, scaled by threshold hours).
 *   - Merchant similarity (1.0 if canonical names match).
 *
 * The combined confidence is a weighted average of the signals.
 *
 * This module is PURE: similarity computation is done via string-distance
 * and date arithmetic. No I/O.
 *
 * See `docs/ai-evolution.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateSignal {
  readonly field: string;
  readonly similarity: number; // 0-1
  readonly reason: string;
}

export interface DuplicateDetectionResult {
  readonly isDuplicate: boolean;
  readonly confidence: number; // 0-1
  readonly signals: readonly DuplicateSignal[];
}

export interface ExpenseForDuplicateDetection {
  readonly title: string;
  readonly amountMinor: number;
  /** ISO date-time. */
  readonly date: string;
  readonly merchantName?: string;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const SIGNAL_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  amount: 0.40,
  date: 0.30,
  title: 0.20,
  merchant: 0.10,
});

// ---------------------------------------------------------------------------
// Title similarity (Levenshtein-based, normalised to 0-1)
// ---------------------------------------------------------------------------

/**
 * Computes the title similarity between two strings.
 *
 * Uses the Levenshtein distance, normalised so that:
 *   - identical strings → 1.0
 *   - completely different strings → 0.0
 *
 *   similarity = 1 - (levenshtein / max(len(s1), len(s2)))
 *
 * The function is case-insensitive and trims whitespace.
 *
 * Examples:
 *   - ('Lunch at Cafe', 'lunch at cafe') → 1.0
 *   - ('Lunch at Cafe', 'Lunch at Cafeteria') → ~0.7
 *   - ('Lunch', 'Dinner') → ~0.17
 */
export function computeTitleSimilarity(title1: string, title2: string): number {
  if (typeof title1 !== 'string' || typeof title2 !== 'string') {
    throw new Error('title1 and title2 must be strings');
  }
  const s1 = title1.trim().toLowerCase();
  const s2 = title2.trim().toLowerCase();
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshtein(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Classic Levenshtein distance (edit distance) between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Use a single-row DP table.
  const previousRow: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) {
    previousRow[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    const aChar = a.charCodeAt(i - 1);
    let previousDiagonal = previousRow[0]!;
    previousRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const bChar = b.charCodeAt(j - 1);
      const substitutionCost = aChar === bChar ? 0 : 1;
      const deletion = previousRow[j - 1]! + 1;
      const insertion = previousRow[j]! + 1;
      const substitution = previousDiagonal + substitutionCost;
      const min = Math.min(deletion, insertion, substitution);
      previousDiagonal = previousRow[j]!;
      previousRow[j] = min;
    }
  }
  return previousRow[b.length]!;
}

// ---------------------------------------------------------------------------
// Date proximity
// ---------------------------------------------------------------------------

/**
 * Computes the date proximity between two ISO date-times.
 *
 *   proximity = 1 - (hoursApart / thresholdHours)
 *
 *   - Same instant → 1.0
 *   - thresholdHours apart → 0.0
 *   - More than thresholdHours apart → 0.0 (clamped)
 *
 * @example computeDateProximity('2026-07-15T12:00:00Z', '2026-07-15T12:00:00Z', 24) → 1.0
 * @example computeDateProximity('2026-07-15T12:00:00Z', '2026-07-16T12:00:00Z', 24) → 0.0
 */
export function computeDateProximity(
  date1: string,
  date2: string,
  thresholdHours: number,
): number {
  if (typeof date1 !== 'string' || typeof date2 !== 'string') {
    throw new Error('date1 and date2 must be ISO date-time strings');
  }
  if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
    throw new Error(`thresholdHours must be positive, got ${thresholdHours}`);
  }
  const t1 = Date.parse(date1);
  const t2 = Date.parse(date2);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) {
    throw new Error('date1 and date2 must be valid ISO date-times');
  }
  const hoursApart = Math.abs(t1 - t2) / (60 * 60 * 1000);
  if (hoursApart >= thresholdHours) return 0;
  return 1 - hoursApart / thresholdHours;
}

// ---------------------------------------------------------------------------
// Amount similarity
// ---------------------------------------------------------------------------

function computeAmountSimilarity(
  amount1Minor: number,
  amount2Minor: number,
): { similarity: number; reason: string } {
  if (amount1Minor === amount2Minor) {
    return { similarity: 1.0, reason: 'Exact amount match' };
  }
  const diff = Math.abs(amount1Minor - amount2Minor);
  const max = Math.max(Math.abs(amount1Minor), Math.abs(amount2Minor));
  if (max === 0) {
    return { similarity: 1.0, reason: 'Both amounts are zero' };
  }
  const pctDiff = diff / max;
  if (pctDiff <= 0.02) {
    return { similarity: 0.95, reason: `Amounts within 2% (diff=${diff} minor units)` };
  }
  if (pctDiff <= 0.10) {
    return { similarity: 0.50, reason: `Amounts within 10% (diff=${diff} minor units)` };
  }
  return { similarity: 0.0, reason: `Amounts differ by ${pctDiff * 100}% (diff=${diff} minor units)` };
}

// ---------------------------------------------------------------------------
// Merchant similarity
// ---------------------------------------------------------------------------

function computeMerchantSimilarity(
  name1: string | undefined,
  name2: string | undefined,
): { similarity: number; reason: string } {
  if (name1 === undefined && name2 === undefined) {
    return { similarity: 0.0, reason: 'No merchant on either expense' };
  }
  if (name1 === undefined || name2 === undefined) {
    return { similarity: 0.0, reason: 'Merchant present on only one expense' };
  }
  const sim = computeTitleSimilarity(name1, name2);
  if (sim === 1) {
    return { similarity: 1.0, reason: 'Merchant names are identical' };
  }
  if (sim >= 0.85) {
    return { similarity: sim, reason: `Merchant names are very similar (${(sim * 100).toFixed(0)}% match)` };
  }
  return {
    similarity: sim,
    reason: `Merchant names differ (${(sim * 100).toFixed(0)}% match)`,
  };
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Detects whether two expenses are likely duplicates.
 *
 * Returns `{ isDuplicate, confidence, signals }`:
 *   - `isDuplicate = true` when `confidence >= 0.85`.
 *   - `confidence` is a weighted average of the signal similarities.
 *   - `signals` is a list of every signal considered, with its field,
 *     similarity, and reason.
 *
 * CRITICAL: the function returns a SUGGESTION. The application layer must
 * present this to the user as a warning and let the user decide what to
 * do. The function does NOT auto-merge or auto-delete expenses.
 */
export function detectDuplicates(
  expense1: ExpenseForDuplicateDetection,
  expense2: ExpenseForDuplicateDetection,
): DuplicateDetectionResult {
  if (!expense1 || !expense2) {
    throw new Error('expense1 and expense2 must be provided');
  }

  const signals: DuplicateSignal[] = [];

  // Amount signal.
  const amountSim = computeAmountSimilarity(
    expense1.amountMinor,
    expense2.amountMinor,
  );
  signals.push({
    field: 'amount',
    similarity: amountSim.similarity,
    reason: amountSim.reason,
  });

  // Date signal (24-hour threshold — duplicates usually happen within a day).
  const dateSim = computeDateProximity(expense1.date, expense2.date, 24);
  signals.push({
    field: 'date',
    similarity: dateSim,
    reason: dateSim === 1
      ? 'Same date/time'
      : dateSim === 0
        ? 'More than 24 hours apart'
        : `Within 24 hours (${(dateSim * 24).toFixed(1)}h proximity)`,
  });

  // Title signal.
  const titleSim = computeTitleSimilarity(expense1.title, expense2.title);
  signals.push({
    field: 'title',
    similarity: titleSim,
    reason: titleSim === 1
      ? 'Titles are identical'
      : titleSim >= 0.85
        ? `Titles are very similar (${(titleSim * 100).toFixed(0)}% match)`
        : `Titles differ (${(titleSim * 100).toFixed(0)}% match)`,
  });

  // Merchant signal.
  const merchantSim = computeMerchantSimilarity(
    expense1.merchantName,
    expense2.merchantName,
  );
  signals.push({
    field: 'merchant',
    similarity: merchantSim.similarity,
    reason: merchantSim.reason,
  });

  // Combined confidence (weighted average).
  let weightedSum = 0;
  let weightTotal = 0;
  for (const sig of signals) {
    const weight = SIGNAL_WEIGHTS[sig.field] ?? 0;
    weightedSum += sig.similarity * weight;
    weightTotal += weight;
  }
  const confidence = weightTotal === 0 ? 0 : weightedSum / weightTotal;

  return Object.freeze({
    isDuplicate: confidence >= 0.85,
    confidence,
    signals: Object.freeze(signals),
  });
}
