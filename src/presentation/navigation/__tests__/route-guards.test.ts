/**
 * Tests for route guards.
 *
 * The guards read navigation state (and validate identifier shapes for
 * the stubbed guards). Tests cover:
 *   - `requireOnboardingComplete` reads the current store flag.
 *   - `useRequireOnboardingComplete` waits for persisted hydration and
 *     subscribes to subsequent store changes.
 *   - `requireGroupExists` / `requireDraftExists` validate the
 *     identifier shape only (Phase 2 stub behaviour).
 */

import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigationStore } from '@store/navigation-store';

import {
  requireDraftExists,
  requireGroupExists,
  requireOnboardingComplete,
  useRequireOnboardingComplete,
} from '../route-guards';

describe('requireOnboardingComplete', () => {
  beforeEach(() => {
    useNavigationStore.setState({ onboardingComplete: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when onboarding is not complete', () => {
    useNavigationStore.setState({ onboardingComplete: false });
    expect(requireOnboardingComplete()).toBe(false);
  });

  it('returns true when onboarding is complete', () => {
    useNavigationStore.setState({ onboardingComplete: true });
    expect(requireOnboardingComplete()).toBe(true);
  });

  it('reflects live updates to the store', () => {
    expect(requireOnboardingComplete()).toBe(false);
    useNavigationStore.getState().setOnboardingComplete(true);
    expect(requireOnboardingComplete()).toBe(true);
    useNavigationStore.getState().setOnboardingComplete(false);
    expect(requireOnboardingComplete()).toBe(false);
  });

  it('waits for hydration and then uses the persisted onboarding decision', async () => {
    jest.spyOn(useNavigationStore.persist, 'hasHydrated').mockReturnValue(false);
    await AsyncStorage.setItem(
      'billlens.navigation-state',
      JSON.stringify({ state: { onboardingComplete: true }, version: 0 }),
    );

    const { result } = renderHook(() => useRequireOnboardingComplete());
    expect(result.current).toBeNull();

    await act(async () => {
      await useNavigationStore.persist.rehydrate();
    });

    expect(result.current).toBe(true);
  });

  it('subscribes to onboarding updates after hydration', async () => {
    const { result } = renderHook(() => useRequireOnboardingComplete());
    await act(async () => {
      await useNavigationStore.persist.rehydrate();
    });
    expect(result.current).toBe(false);

    act(() => {
      useNavigationStore.getState().setOnboardingComplete(true);
    });
    expect(result.current).toBe(true);
  });
});

describe('requireGroupExists', () => {
  it('returns true for a non-empty string', () => {
    expect(requireGroupExists('group-123')).toBe(true);
  });

  it('returns true for a UUID-like string', () => {
    expect(requireGroupExists('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(requireGroupExists('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(requireGroupExists('   ')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(requireGroupExists(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(requireGroupExists(null)).toBe(false);
  });
});

describe('requireDraftExists', () => {
  it('returns true for a non-empty string', () => {
    expect(requireDraftExists('draft-abc')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(requireDraftExists('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(requireDraftExists('\t')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(requireDraftExists(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(requireDraftExists(null)).toBe(false);
  });
});
