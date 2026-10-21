/**
 * Port: remove a group's LOCAL rows only.
 *
 * Deliberately separate from `GroupRepository.softDelete`, which enqueues a
 * sync operation (a *shared* deletion). This port is the "remove my
 * device's copy" path and must never touch the sync queue.
 */
export interface LocalGroupPurgePort {
  /** Hard-delete the group and cascade its local children. */
  purgeLocalGroup(groupId: string): Promise<void>;
}
