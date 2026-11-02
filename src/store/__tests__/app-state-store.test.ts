/**
 * Tests for the app-state store.
 *
 * The store is non-persistent (it reflects real-time device / sync
 * status), so it can be tested directly without mocking AsyncStorage.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { useAppState } from '../app-state-store';

describe('app-state store', () => {
  beforeEach(() => {
    // Reset to defaults before each test.
    useAppState.setState({
      isOnline: true,
      pendingSyncCount: 0,
      hasFailedSync: false,
      hasPendingDrafts: false,
    });
  });

  describe('default state', () => {
    it('starts online', () => {
      expect(useAppState.getState().isOnline).toBe(true);
    });

    it('starts with zero pending syncs', () => {
      expect(useAppState.getState().pendingSyncCount).toBe(0);
    });

    it('starts without failed sync', () => {
      expect(useAppState.getState().hasFailedSync).toBe(false);
    });

    it('starts without pending drafts', () => {
      expect(useAppState.getState().hasPendingDrafts).toBe(false);
    });
  });

  describe('setIsOnline', () => {
    it('updates isOnline to false', () => {
      useAppState.getState().setIsOnline(false);
      expect(useAppState.getState().isOnline).toBe(false);
    });

    it('updates isOnline back to true', () => {
      useAppState.getState().setIsOnline(false);
      useAppState.getState().setIsOnline(true);
      expect(useAppState.getState().isOnline).toBe(true);
    });
  });

  describe('setPendingSyncCount', () => {
    it('updates the count', () => {
      useAppState.getState().setPendingSyncCount(5);
      expect(useAppState.getState().pendingSyncCount).toBe(5);
    });

    it('clamps negative values to zero', () => {
      useAppState.getState().setPendingSyncCount(-3);
      expect(useAppState.getState().pendingSyncCount).toBe(0);
    });

    it('accepts zero', () => {
      useAppState.getState().setPendingSyncCount(7);
      useAppState.getState().setPendingSyncCount(0);
      expect(useAppState.getState().pendingSyncCount).toBe(0);
    });
  });

  describe('setHasFailedSync', () => {
    it('updates hasFailedSync to true', () => {
      useAppState.getState().setHasFailedSync(true);
      expect(useAppState.getState().hasFailedSync).toBe(true);
    });
  });

  describe('setHasPendingDrafts', () => {
    it('updates hasPendingDrafts to true', () => {
      useAppState.getState().setHasPendingDrafts(true);
      expect(useAppState.getState().hasPendingDrafts).toBe(true);
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers when isOnline changes', () => {
      const values: boolean[] = [];
      const unsub = useAppState.subscribe((s) => values.push(s.isOnline));
      useAppState.getState().setIsOnline(false);
      useAppState.getState().setIsOnline(true);
      unsub();
      // The subscribe callback fires on every state change, including
      // unrelated ones — but we only call setIsOnline here, so the
      // recorded values should match.
      expect(values).toContain(false);
      expect(values).toContain(true);
    });
  });
});
