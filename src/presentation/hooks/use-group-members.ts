/**
 * use-group-members — loads the active members of a group through
 * the services registry, projected into a presentation-friendly
 * shape that the settlement form, manual expense form, and member
 * pickers all consume.
 *
 * Architecture:
 *   - Reads ONLY from the services registry (`@store/services-registry`)
 *     — never imports `@infrastructure/*`.
 *   - Returns an honest "not ready" state when the services gate is
 *     still initializing; the hook re-runs when `useAppServicesReady()`
 *     flips true.
 *   - Re-loads on screen focus (returning from a sibling screen after
 *     adding a member must refresh the picker).
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

/** One row of the member picker. */
export interface GroupMemberPickerEntry {
  readonly id: string;
  readonly displayName: string;
  /** The member's role within the group ('owner', 'admin', or 'member'). */
  readonly role: 'owner' | 'admin' | 'member';
  /** True when this device's signed-in profile is linked to this member. */
  readonly isCurrentUser: boolean;
}

export interface UseGroupMembersResult {
  readonly loading: boolean;
  readonly error: string | null;
  readonly groupName: string | null;
  readonly currencyCode: string | null;
  readonly members: readonly GroupMemberPickerEntry[];
  /** True once at least one load attempt has completed. */
  readonly loadedOnce: boolean;
}

const INITIAL: UseGroupMembersResult = {
  loading: true,
  error: null,
  groupName: null,
  currencyCode: null,
  members: [],
  loadedOnce: false,
};

/**
 * Load a group's name, default currency, and active members through
 * the composition-root use case `ListGroupMembersUseCase`.
 *
 * @param groupId — the group to load. When empty, the hook returns
 *   the initial empty state without throwing.
 */
export function useGroupMembers(groupId: string | undefined | null): UseGroupMembersResult {
  const servicesReady = useAppServicesReady();
  const [state, setState] = useState<UseGroupMembersResult>(INITIAL);

  const load = useCallback(async (): Promise<void> => {
    if (groupId === undefined || groupId === null || groupId.length === 0) {
      setState({
        loading: false,
        error: null,
        groupName: null,
        currencyCode: null,
        members: [],
        loadedOnce: true,
      });
      return;
    }
    const services = tryGetAppServices();
    if (services === null) {
      // Gate still initializing — keep loading; the readiness
      // subscription re-triggers this effect once ready.
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await services.groups.listGroupMembers.execute(groupId);
      setState({
        loading: false,
        error: null,
        groupName: result.groupName,
        currencyCode: result.currencyCode,
        members: result.members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          role: m.role,
          // Pre-identity: no member is linked to "the current user" on
          // this device yet — the flag stays false (honest default).
          isCurrentUser: false,
        })),
        loadedOnce: true,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not load group members.',
        groupName: null,
        currencyCode: null,
        members: [],
        loadedOnce: true,
      });
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  // Re-load on focus — returning from a sibling screen (e.g. an
  // invite screen that added a member) must refresh the picker.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return state;
}
