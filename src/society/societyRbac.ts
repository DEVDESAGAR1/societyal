/**
 * SocietyFix AI — Society-Level Role-Based Access Control (RBAC) & State Machine
 * Implements centralized permission checking, least privilege enforcement,
 * and valid membership lifecycle transitions.
 */

export type SocietyRole =
  | 'ADMIN'             // Society Admin / Secretary (Full society management)
  | 'CHAIRMAN'          // Society Chairman (Executive governance)
  | 'TREASURER'         // Society Treasurer (Financial administration)
  | 'COMMITTEE_MEMBER'  // Managing Committee Member
  | 'RESIDENT'          // Verified Flat Owner / Resident
  | 'VENDOR'            // Contracted external service provider
  | 'STAFF';            // Facility / maintenance / security staff

export type MembershipStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'REVOKED';

export type SocietyPermission =
  | 'VIEW_SOCIETY_PROFILE'
  | 'UPDATE_SOCIETY_PROFILE'
  | 'VIEW_MEMBER_DIRECTORY'
  | 'REQUEST_MEMBERSHIP'
  | 'REVIEW_MEMBERSHIPS'
  | 'MANAGE_MEMBERSHIPS'
  | 'ASSIGN_ROLES'
  | 'VIEW_FINANCIALS'
  | 'MANAGE_SETTINGS'
  | 'VIEW_AUDIT_LOGS'
  | 'ASK_SOCIETY_MEMORY'
  | 'MANAGE_SOCIETY_MEMORY'
  | 'EXTRACT_MEETING_MINUTES'
  | 'VIEW_MEETINGS'
  | 'CREATE_MEETINGS'
  | 'MANAGE_MEETING_NOTES'
  | 'GENERATE_MEETING_DRAFT'
  | 'REVIEW_MEETING_MINUTES'
  | 'APPROVE_MEETING_MINUTES'
  | 'ARCHIVE_MEETINGS';

/**
 * Society Role to Permission Mapping Matrix
 * Enforces least privilege across society stakeholders.
 */
export const ROLE_PERMISSIONS: Record<SocietyRole, readonly SocietyPermission[]> = {
  ADMIN: [
    'VIEW_SOCIETY_PROFILE',
    'UPDATE_SOCIETY_PROFILE',
    'VIEW_MEMBER_DIRECTORY',
    'REQUEST_MEMBERSHIP',
    'REVIEW_MEMBERSHIPS',
    'MANAGE_MEMBERSHIPS',
    'ASSIGN_ROLES',
    'VIEW_FINANCIALS',
    'MANAGE_SETTINGS',
    'VIEW_AUDIT_LOGS',
    'ASK_SOCIETY_MEMORY',
    'MANAGE_SOCIETY_MEMORY',
    'EXTRACT_MEETING_MINUTES',
    'VIEW_MEETINGS',
    'CREATE_MEETINGS',
    'MANAGE_MEETING_NOTES',
    'GENERATE_MEETING_DRAFT',
    'REVIEW_MEETING_MINUTES',
    'APPROVE_MEETING_MINUTES',
    'ARCHIVE_MEETINGS',
  ],
  CHAIRMAN: [
    'VIEW_SOCIETY_PROFILE',
    'UPDATE_SOCIETY_PROFILE',
    'VIEW_MEMBER_DIRECTORY',
    'REQUEST_MEMBERSHIP',
    'REVIEW_MEMBERSHIPS',
    'MANAGE_MEMBERSHIPS',
    'ASSIGN_ROLES',
    'VIEW_FINANCIALS',
    'MANAGE_SETTINGS',
    'VIEW_AUDIT_LOGS',
    'ASK_SOCIETY_MEMORY',
    'MANAGE_SOCIETY_MEMORY',
    'EXTRACT_MEETING_MINUTES',
    'VIEW_MEETINGS',
    'CREATE_MEETINGS',
    'MANAGE_MEETING_NOTES',
    'GENERATE_MEETING_DRAFT',
    'REVIEW_MEETING_MINUTES',
    'APPROVE_MEETING_MINUTES',
    'ARCHIVE_MEETINGS',
  ],
  TREASURER: [
    'VIEW_SOCIETY_PROFILE',
    'VIEW_MEMBER_DIRECTORY',
    'REQUEST_MEMBERSHIP',
    'VIEW_FINANCIALS',
    'ASK_SOCIETY_MEMORY',
    'VIEW_MEETINGS',
    'MANAGE_MEETING_NOTES',
    'REVIEW_MEETING_MINUTES',
  ],
  COMMITTEE_MEMBER: [
    'VIEW_SOCIETY_PROFILE',
    'VIEW_MEMBER_DIRECTORY',
    'REQUEST_MEMBERSHIP',
    'ASK_SOCIETY_MEMORY',
    'MANAGE_SOCIETY_MEMORY',
    'EXTRACT_MEETING_MINUTES',
    'VIEW_MEETINGS',
    'CREATE_MEETINGS',
    'MANAGE_MEETING_NOTES',
    'GENERATE_MEETING_DRAFT',
    'REVIEW_MEETING_MINUTES',
  ],
  RESIDENT: [
    'VIEW_SOCIETY_PROFILE',
    'VIEW_MEMBER_DIRECTORY',
    'REQUEST_MEMBERSHIP',
    'ASK_SOCIETY_MEMORY',
    'VIEW_MEETINGS',
  ],
  VENDOR: [
    'VIEW_SOCIETY_PROFILE',
    'ASK_SOCIETY_MEMORY',
    // Vendors CANNOT view resident directories or financial administrative information
  ],
  STAFF: [
    'VIEW_SOCIETY_PROFILE',
    'ASK_SOCIETY_MEMORY',
    'VIEW_MEETINGS',
    // Staff CANNOT view resident directories or financial administrative information
  ],
};

export const ALL_SOCIETY_ROLES: SocietyRole[] = [
  'ADMIN',
  'CHAIRMAN',
  'TREASURER',
  'COMMITTEE_MEMBER',
  'RESIDENT',
  'VENDOR',
  'STAFF',
];

export const ALL_MEMBERSHIP_STATUSES: MembershipStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'REVOKED',
];

/**
 * Validates whether an actor with a given society role or platform Super Admin status
 * possesses the required permission.
 */
export function hasSocietyPermission(
  role: SocietyRole | string | undefined | null,
  permission: SocietyPermission,
  isSuperAdmin = false
): boolean {
  // Platform Super Admins possess universal operational oversight
  if (isSuperAdmin) {
    return true;
  }

  if (!role || !isValidSocietyRole(role)) {
    return false;
  }

  const permissions = ROLE_PERMISSIONS[role as SocietyRole];
  return permissions.includes(permission);
}

/**
 * Validates whether a string is a valid SocietyRole.
 */
export function isValidSocietyRole(role: string): role is SocietyRole {
  return ALL_SOCIETY_ROLES.includes(role as SocietyRole);
}

/**
 * Validates whether a string is a valid MembershipStatus.
 */
export function isValidMembershipStatus(status: string): status is MembershipStatus {
  return ALL_MEMBERSHIP_STATUSES.includes(status as MembershipStatus);
}

/**
 * Valid State Machine Transitions for Memberships.
 * Reject all invalid or out-of-order state transitions.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUSPENDED', 'REVOKED'],
  SUSPENDED: ['APPROVED', 'REVOKED'],
  REJECTED: ['PENDING'], // Allowed to re-apply if previously rejected
  REVOKED: [],           // Terminal state: requires new membership request if allowed by policy
};

/**
 * Validates if transition from currentStatus to targetStatus is permitted.
 */
export function validateMembershipTransition(
  currentStatus: MembershipStatus,
  targetStatus: MembershipStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return {
      valid: false,
      reason: `Invalid membership state transition from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  return { valid: true };
}

/**
 * Checks whether an actor can assign a target role to a member.
 * - Only ADMIN, CHAIRMAN, or Platform Super Admin can assign roles.
 * - Cannot assign platform roles (e.g. SUPER_ADMIN).
 */
export function canAssignRole(
  actorRole: SocietyRole | undefined | null,
  targetRole: string,
  isSuperAdmin = false
): boolean {
  if (!isValidSocietyRole(targetRole)) {
    return false;
  }

  if (isSuperAdmin) {
    return true;
  }

  if (actorRole === 'ADMIN' || actorRole === 'CHAIRMAN') {
    return true;
  }

  return false;
}

// ==========================================
// Milestone M5: Meeting Lifecycle & State Machine
// ==========================================

export type MeetingStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'MINUTES_DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ARCHIVED'
  | 'CANCELLED';

export const ALL_MEETING_STATUSES: MeetingStatus[] = [
  'SCHEDULED',
  'IN_PROGRESS',
  'MINUTES_DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'ARCHIVED',
  'CANCELLED',
];

export const ALLOWED_MEETING_TRANSITIONS: Record<MeetingStatus, readonly MeetingStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['MINUTES_DRAFT', 'CANCELLED'],
  MINUTES_DRAFT: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'MINUTES_DRAFT', 'CANCELLED'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
};

/**
 * Validates whether transition from currentStatus to targetStatus is permitted.
 */
export function validateMeetingTransition(
  currentStatus: MeetingStatus,
  targetStatus: MeetingStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  const allowed = ALLOWED_MEETING_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return {
      valid: false,
      reason: `Invalid meeting state transition from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  return { valid: true };
}

/**
 * Verifies if an actor role is authorized to approve official minutes.
 * Only ADMIN (Hon. Secretary), CHAIRMAN, or Platform Super Admin possess statutory authority.
 */
export function canApproveMinutes(
  actorRole: SocietyRole | undefined | null,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) {
    return true;
  }

  return actorRole === 'ADMIN' || actorRole === 'CHAIRMAN';
}
