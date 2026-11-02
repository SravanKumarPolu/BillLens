/**
 * Deterministic hash-based assignment engine.
 *
 * CRITICAL CONTRACT:
 *   - The SAME (experimentId, participantId) pair MUST ALWAYS produce the
 *     SAME variant assignment. This is essential for reproducibility —
 *     a user must see the same experiment variant on every app launch,
 *     every sync, every device.
 *   - Assignment is a pure function — no I/O, no randomness, no globals.
 *   - Assignment respects the experiment's traffic allocation: if the
 *     participant falls outside the allocated bucket, they are excluded
 *     (returns `null`).
 *   - Assignment respects per-variant weights: a variant with weight 0
 *     is never assigned; variants with higher weights get proportionally
 *     more traffic.
 *
 * The hash function is a small, dependency-free FNV-1a 32-bit variant.
 * It is NOT cryptographically secure — its only requirement is that
 * small changes in the input produce well-distributed hash values.
 */

import type { Experiment, ExperimentVariant } from './experiment-model';

// ---------------------------------------------------------------------------
// FNV-1a 32-bit hash (deterministic, dependency-free)
// ---------------------------------------------------------------------------

const FNV_32_PRIME = 0x01000193;
const FNV_32_OFFSET = 0x811c9dc5;

/**
 * Computes a 32-bit FNV-1a hash of the given string.
 *
 * Returns an unsigned 32-bit integer in the range [0, 2^32 - 1].
 * Pure function — same input always produces same output.
 */
export function fnv1aHash(input: string): number {
  let hash = FNV_32_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by FNV prime, keeping it as a 32-bit unsigned integer.
    hash = Math.imul(hash, FNV_32_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Returns a float in [0, 1) derived from a hash. Used for traffic
 * allocation and variant selection.
 *
 * Pure function.
 */
export function hashToUnitInterval(hash: number): number {
  // Use the upper 24 bits as the fractional part of a float in [0, 1).
  // 2^24 = 16777216. Dividing by 2^24 yields a value in [0, 1).
  // We avoid the lower 8 bits because some hash functions (not FNV-1a,
  // but defensively) have less avalanche in the low bits.
  return ((hash >>> 8) & 0xffffff) / 0x1000000;
}

// ---------------------------------------------------------------------------
// Traffic allocation
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the participant falls within the experiment's
 * allocated traffic bucket.
 *
 * The function hashes `${experimentId}:${participantId}` to a float in
 * [0, 1). The participant is included iff that float is less than
 * `experiment.trafficAllocationPercent / 100`.
 *
 * Pure + deterministic.
 */
export function isInExperimentTraffic(
  experimentId: string,
  participantId: string,
  trafficAllocationPercent: number,
): boolean {
  if (trafficAllocationPercent <= 0) return false;
  if (trafficAllocationPercent >= 100) return true;
  const hash = fnv1aHash(`${experimentId}:${participantId}`);
  const bucket = hashToUnitInterval(hash);
  // bucket is in [0, 1). threshold is in [0, 1]. If bucket < threshold,
  // the participant is in the experiment.
  return bucket < trafficAllocationPercent / 100;
}

// ---------------------------------------------------------------------------
// Variant assignment
// ---------------------------------------------------------------------------

/**
 * Maps a hash to a variant based on per-variant weights.
 *
 * Weights are normalised to a cumulative distribution. The hash is
 * converted to a float in [0, 1) and the first variant whose cumulative
 * weight exceeds the float is selected.
 *
 * Pure + deterministic.
 */
export function pickVariantByWeight(
  weights: readonly { readonly variant: ExperimentVariant; readonly weight: number }[],
  hash: number,
): ExperimentVariant {
  if (weights.length === 0) {
    throw new Error('Cannot pick variant from empty weight list');
  }
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Total variant weight must be > 0');
  }

  const bucket = hashToUnitInterval(hash) * totalWeight;
  let cumulative = 0;
  for (const w of weights) {
    cumulative += w.weight;
    if (bucket < cumulative) {
      return w.variant;
    }
  }
  // Floating-point safety — return the last variant with a positive weight.
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i]!.weight > 0) return weights[i]!.variant;
  }
  return weights[0]!.variant;
}

/**
 * Returns the variant the participant is assigned to for the given
 * experiment, or `null` if the participant is excluded from the
 * experiment's traffic allocation.
 *
 * Pure + deterministic — same (experiment, participant) always yields
 * the same variant (or null).
 *
 * The experiment MUST be in a `running` status for assignment to succeed.
 * Draft / paused / completed / cancelled experiments return `null`.
 */
export function assignVariant(
  experiment: Experiment,
  participantId: string,
): ExperimentVariant | null {
  // Only running experiments assign variants.
  if (experiment.status !== 'running') return null;

  // Traffic allocation — exclude participants outside the bucket.
  if (
    !isInExperimentTraffic(
      experiment.id,
      participantId,
      experiment.trafficAllocationPercent,
    )
  ) {
    return null;
  }

  // Variant selection.
  const hash = fnv1aHash(`${experiment.id}:${participantId}:variant`);
  return pickVariantByWeight(experiment.variantWeights, hash);
}

// ---------------------------------------------------------------------------
// Verification helpers (used by tests + use cases)
// ---------------------------------------------------------------------------

/**
 * Returns the assignment fingerprint — a deterministic string that uniquely
 * identifies the (experiment, participant) → variant decision. Used in
 * tests to verify reproducibility.
 */
export function assignmentFingerprint(
  experimentId: string,
  participantId: string,
): string {
  const hash = fnv1aHash(`${experimentId}:${participantId}`);
  return `exp=${experimentId};participant=${participantId};hash=${hash.toString(16).padStart(8, '0')}`;
}
