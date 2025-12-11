/**
 * Admin Service
 * 
 * Manages group admin controls and permissions
 * - Check if user is admin
 * - Admin can manage members
 * - Admin can settle on behalf of others
 * - Admin can manage group settings
 */

import { Group, Member } from '../types/models';

/**
 * Check if a user is admin of a group
 */
export const isGroupAdmin = (group: Group, userId: string = 'you'): boolean => {
  // If adminId is set, check if it matches
  if (group.adminId) {
    return group.adminId === userId;
  }

  // Fallback: First member is admin (for backward compatibility)
  if (group.members.length > 0) {
    return group.members[0].id === userId;
  }

  return false;
};

/**
 * Check if a member has admin role
 */
export const hasAdminRole = (member: Member): boolean => {
  return member.role === 'admin';
};

/**
 * Check if user can manage group (admin only)
 */
export const canManageGroup = (group: Group, userId: string = 'you'): boolean => {
  return isGroupAdmin(group, userId);
};

/**
 * Check if user can add/remove members (admin only)
 */
export const canManageMembers = (group: Group, userId: string = 'you'): boolean => {
  return isGroupAdmin(group, userId);
};

/**
 * Check if user can settle on behalf of others (admin only)
 */
export const canSettleOnBehalf = (group: Group, userId: string = 'you'): boolean => {
  return isGroupAdmin(group, userId);
};

/**
 * Check if user can edit expenses (admin or member with edit permission)
 */
export const canEditExpenses = (group: Group, userId: string = 'you'): boolean => {
  // Admin can always edit
  if (isGroupAdmin(group, userId)) {
    return true;
  }

  // Check member role
  const member = group.members.find(m => m.id === userId);
  if (!member) return false;

  // Admin and member roles can edit, viewer cannot
  return member.role === 'admin' || member.role === 'member' || !member.role;
};

/**
 * Check if user can view group (all members can view)
 */
export const canViewGroup = (group: Group, userId: string = 'you'): boolean => {
  return group.members.some(m => m.id === userId);
};

/**
 * Set group admin
 */
export const setGroupAdmin = (group: Group, adminId: string): Group => {
  return {
    ...group,
    adminId,
    members: group.members.map(m => ({
      ...m,
      role: m.id === adminId ? 'admin' : (m.role === 'admin' ? 'member' : m.role || 'member'),
    })),
  };
};

/**
 * Transfer admin to another member
 */
export const transferAdmin = (group: Group, newAdminId: string, currentAdminId: string = 'you'): Group | null => {
  // Only current admin can transfer
  if (!isGroupAdmin(group, currentAdminId)) {
    return null;
  }

  // New admin must be a member
  if (!group.members.some(m => m.id === newAdminId)) {
    return null;
  }

  return setGroupAdmin(group, newAdminId);
};

/**
 * Update member role
 */
export const updateMemberRole = (
  group: Group,
  memberId: string,
  role: 'admin' | 'member' | 'viewer',
  adminId: string = 'you'
): Group | null => {
  // Only admin can update roles
  if (!isGroupAdmin(group, adminId)) {
    return null;
  }

  // Can't change admin's own role
  if (memberId === adminId) {
    return null;
  }

  return {
    ...group,
    members: group.members.map(m =>
      m.id === memberId ? { ...m, role } : m
    ),
  };
};
