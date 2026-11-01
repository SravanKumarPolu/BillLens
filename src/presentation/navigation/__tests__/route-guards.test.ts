/**
 * Tests for route guards.
 *
 * The guards are pure synchronous functions that read the navigation
 * store (and validate identifier shapes for the stubbed guards). Tests
 * cover:
 *   - `requireOnboardingComplete` reads the persisted store flag.
 *   - `requireGroupExists` / `requireDraftExists` validate the
 *     identifier shape only (Phase 2 stub behaviour).
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { useNavigationStore } from '@store/navigation-store';

import {
  requireDraftExists,
  requireGroupExists,
  requireOnboardingComplete,
} from '../route-guards';

describe('requireOnboardingComplete', () => {
  beforeEach(() => {
    useNavigationStore.setState({ onboardingComplete: false });
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
