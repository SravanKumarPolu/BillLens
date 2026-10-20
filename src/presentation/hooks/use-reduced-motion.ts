/**
 * useReducedMotion — React binding for the OS "reduce motion" setting.
 *
 * iOS: Settings → Accessibility → Motion → Reduce Motion.
 * Android: Settings → Accessibility → Remove animations.
 *
 * Animations that are purely decorative (pulses, press-scale effects,
 * looping indeterminate indicators) should be skipped or reduced to
 * opacity-only when this returns `true` — the app must remain fully
 * usable for motion-sensitive users (Phase 6 accessibility).
 *
 * Implementation notes:
 *   - `AccessibilityInfo.isReduceMotionEnabled()` resolves the initial
 *     value; `reduceMotionChanged` subscriptions keep it live.
 *   - The listener is registered once (empty deps) so re-renders do not
 *     churn subscriptions; cleanup removes it on unmount.
 *   - In Jest (no native module), the query resolves to `false` and the
 *     listener API is optional-chained — tests stay deterministic.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo?.isReduceMotionEnabled?.()
      .then((value: boolean) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // Native module unavailable (test environment) — keep false.
      });

    const subscription = AccessibilityInfo?.addEventListener?.(
      'reduceMotionChanged',
      (value: boolean) => {
        if (mounted) setReduced(value);
      },
    );

    return () => {
      mounted = false;
      // RN ≥ 0.65 (we target 0.81) returns an EmitterSubscription with
      // remove(); the legacy removeEventListener API was removed from
      // the type surface in RN 0.81.
      subscription?.remove();
    };
  }, []);

  return reduced;
}
