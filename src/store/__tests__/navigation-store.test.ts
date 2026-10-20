/**
 * Tests for the navigation store.
 *
 * The store is persisted to AsyncStorage. The Jest setup file mocks
 * AsyncStorage with an in-memory implementation, so persistence can be
 * exercised end-to-end here.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { useNavigationStore } from '../navigation-store';

describe('navigation store', () => {
  beforeEach(() => {
    // Reset to defaults before each test.
    useNavigationStore.setState({
      onboardingComplete: false,
      hasUnsavedDraftChanges: false,
    });
  });

  describe('default state', () => {
    it('starts with onboarding not complete', () => {
      expect(useNavigationStore.getState().onboardingComplete).toBe(false);
    });

    it('starts without unsaved draft changes', () => {
      expect(useNavigationStore.getState().hasUnsavedDraftChanges).toBe(false);
    });
  });

  describe('setOnboardingComplete', () => {
    it('sets onboardingComplete to true', () => {
      useNavigationStore.getState().setOnboardingComplete(true);
      expect(useNavigationStore.getState().onboardingComplete).toBe(true);
    });

    it('can reset onboardingComplete back to false', () => {
      useNavigationStore.getState().setOnboardingComplete(true);
      useNavigationStore.getState().setOnboardingComplete(false);
      expect(useNavigationStore.getState().onboardingComplete).toBe(false);
    });
  });

  describe('setHasUnsavedDraftChanges', () => {
    it('sets hasUnsavedDraftChanges to true', () => {
      useNavigationStore.getState().setHasUnsavedDraftChanges(true);
      expect(useNavigationStore.getState().hasUnsavedDraftChanges).toBe(true);
    });

    it('can reset hasUnsavedDraftChanges back to false', () => {
      useNavigationStore.getState().setHasUnsavedDraftChanges(true);
      useNavigationStore.getState().setHasUnsavedDraftChanges(false);
      expect(useNavigationStore.getState().hasUnsavedDraftChanges).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers when onboardingComplete changes', () => {
      const values: boolean[] = [];
      const unsub = useNavigationStore.subscribe((s) => values.push(s.onboardingComplete));
      useNavigationStore.getState().setOnboardingComplete(true);
      unsub();
      expect(values).toContain(true);
    });
  });
});
