/**
 * Horizontal (autoscaling) configuration.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * Defines per-service autoscaling targets and a pure function that
 * computes the desired instance count given the current load, target
 * load, and current instance count.
 *
 * The function respects min/max bounds and cooldowns are enforced by
 * the orchestrator (not by this pure module).
 *
 * See `docs/scalability-architecture.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceScalingConfig {
  readonly serviceName: string;
  readonly minInstances: number;
  readonly maxInstances: number;
  /** Target CPU utilisation percentage (e.g. 60). */
  readonly targetCpuPercent: number;
  /** Target memory utilisation percentage (e.g. 65). */
  readonly targetMemoryPercent: number;
  /** Min seconds between scale-up events. */
  readonly scaleUpCooldownSeconds: number;
  /** Min seconds between scale-down events. */
  readonly scaleDownCooldownSeconds: number;
}

// ---------------------------------------------------------------------------
// Service scaling registry
// ---------------------------------------------------------------------------

export const SERVICE_SCALING_CONFIGS: readonly ServiceScalingConfig[] =
  Object.freeze([
    {
      serviceName: 'api',
      minInstances: 3,
      maxInstances: 60,
      targetCpuPercent: 60,
      targetMemoryPercent: 65,
      scaleUpCooldownSeconds: 60,
      scaleDownCooldownSeconds: 300,
    },
    {
      serviceName: 'sync_worker',
      minInstances: 2,
      maxInstances: 30,
      targetCpuPercent: 70,
      targetMemoryPercent: 70,
      scaleUpCooldownSeconds: 90,
      scaleDownCooldownSeconds: 600,
    },
    {
      serviceName: 'ocr_worker',
      minInstances: 2,
      maxInstances: 40,
      targetCpuPercent: 75,
      targetMemoryPercent: 80,
      scaleUpCooldownSeconds: 120,
      scaleDownCooldownSeconds: 600,
    },
    {
      serviceName: 'push_worker',
      minInstances: 1,
      maxInstances: 20,
      targetCpuPercent: 60,
      targetMemoryPercent: 60,
      scaleUpCooldownSeconds: 120,
      scaleDownCooldownSeconds: 300,
    },
    {
      serviceName: 'webhook_worker',
      minInstances: 1,
      maxInstances: 15,
      targetCpuPercent: 65,
      targetMemoryPercent: 65,
      scaleUpCooldownSeconds: 120,
      scaleDownCooldownSeconds: 300,
    },
    {
      serviceName: 'analytics_worker',
      minInstances: 1,
      maxInstances: 12,
      targetCpuPercent: 70,
      targetMemoryPercent: 75,
      scaleUpCooldownSeconds: 180,
      scaleDownCooldownSeconds: 600,
    },
  ]);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Computes the desired instance count for a service.
 *
 * Strategy: scale proportionally to current/target load ratio.
 *   desired = round(currentInstances * (currentLoad / targetLoad))
 *
 * Special cases:
 *  - If `currentLoad <= 0` → return `minInstances` (no demand).
 *  - If `targetLoad <= 0`  → return `maxInstances` (defensive: target
 *    misconfigured, scale up to absorb unknown load).
 *  - Result is clamped to [minInstances, maxInstances].
 *  - If `currentInstances` is 0 (cold start), return `minInstances`.
 *
 * This function never returns a value outside [min, max] regardless
 * of inputs.
 */
export function computeDesiredInstances(
  currentLoad: number,
  targetLoad: number,
  currentInstances: number,
  config: ServiceScalingConfig,
): number {
  if (!Number.isFinite(currentLoad) || !Number.isFinite(targetLoad)) {
    return clamp(config.minInstances, config.maxInstances, currentInstances);
  }
  if (currentInstances <= 0) {
    return config.minInstances;
  }
  if (currentLoad <= 0) {
    return config.minInstances;
  }
  if (targetLoad <= 0) {
    return config.maxInstances;
  }
  const ratio = currentLoad / targetLoad;
  const raw = Math.round(currentInstances * ratio);
  return clamp(config.minInstances, config.maxInstances, raw);
}

/**
 * Returns the scaling config for a service, or null when unknown.
 */
export function getServiceScalingConfig(
  serviceName: string,
): ServiceScalingConfig | null {
  return (
    SERVICE_SCALING_CONFIGS.find((c) => c.serviceName === serviceName) ?? null
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function clamp(min: number, max: number, value: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
