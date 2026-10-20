/**
 * useReducedMotion tests.
 *
 * The hook binds React state to the native AccessibilityInfo
 * "reduce motion" setting. In the Jest environment the native module
 * resolves to `false` (or is absent entirely) — these tests verify:
 *
 *   1. The default is `false` (motion allowed) when the platform
 *      reports nothing / throws.
 *   2. The initial async query result is applied when available.
 *   3. Live changes via `reduceMotionChanged` update the hook.
 *   4. The subscription is removed on unmount (no leak, no setState
 *      after unmount).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '@presentation/hooks/use-reduced-motion';

type Listener = (value: boolean) => void;

describe('useReducedMotion', () => {
  let listeners: Map<string, Listener>;
  let initialValue: boolean | Error;

  beforeEach(() => {
    listeners = new Map();
    initialValue = false;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(() =>
        initialValue instanceof Error
          ? Promise.reject(initialValue)
          : Promise.resolve(initialValue),
      );
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(
      ((event: string, listener: Listener) => {
        listeners.set(event, listener);
        return { remove: () => listeners.delete(event) };
      }) as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to false when the platform reports motion allowed', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it('applies the async initial value (reduce motion ON)', async () => {
    initialValue = true;
    const { result } = renderHook(() => useReducedMotion());
    // Before the async query resolves it is still false.
    expect(result.current).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it('stays false when the platform query rejects (test/native absence)', async () => {
    initialValue = new Error('native module unavailable');
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it('updates live when reduceMotionChanged fires', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);

    await act(async () => {
      listeners.get('reduceMotionChanged')?.(true);
    });
    expect(result.current).toBe(true);

    await act(async () => {
      listeners.get('reduceMotionChanged')?.(false);
    });
    expect(result.current).toBe(false);
  });

  it('removes the subscription on unmount', async () => {
    const { unmount } = renderHook(() => useReducedMotion());
    await act(async () => {
      await Promise.resolve();
    });
    expect(listeners.has('reduceMotionChanged')).toBe(true);
    unmount();
    expect(listeners.has('reduceMotionChanged')).toBe(false);
  });
});
