/**
 * SocietyFix AI — Housing Societies & Membership REST API Routes
 * Implements society onboarding, membership request workflows,
 * tenant isolation, role governance, and security audit logs.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/authMiddleware.ts';
import {
  requireSocietyMembership,
  requireSocietyPermission,
} from '../society/societyMiddleware.ts';
import {
  createSociety,
  getSocietiesForUser,
  listDiscoverableSocieties,
  updateSocietyProfile,
  requestMembership,
  listSocietyMembers,
  listPendingRequests,
  reviewMembershipRequest,
  updateMemberStatus,
  changeMemberRole,
  getSocietyAuditLogs,
} from '../society/societyService.ts';
import { isValidSocietyRole, isValidMembershipStatus, type SocietyRole, type MembershipStatus } from '../society/societyRbac.ts';
import { logger } from '../infrastructure/logger.ts';

const router = Router();

// ==========================================
// Society Discovery & Creation Endpoints
// ==========================================

/**
 * POST /api/societies
 * Creates a new housing society.
 * The creator is assigned initial ADMIN membership in the society.
 */
router.post('/societies', requireAuth, async (req: Request, res: Response) => {
  const { name, slug, address, city, state, postalCode, country, societyType, contactEmail, contactPhone } = req.body || {};

  if (!name || !address || !city || !state || !postalCode) {
    return res.status(400).json({
      error: 'Missing required society fields: name, address, city, state, and postalCode are required.',
    });
  }

  try {
    const result = await createSociety(
      {
        name,
        slug,
        address,
        city,
        state,
        postalCode,
        country,
        societyType,
        contactEmail,
        contactPhone,
      },
      req.user!
    );

    return res.status(201).json({
      success: true,
      message: 'Housing society created successfully.',
      society: result.society,
      membership: result.membership,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to create society', { error: msg, userId: req.user?.id });
    return res.status(400).json({ error: msg });
  }
});

/**
 * GET /api/societies
 * Lists discoverable housing societies with the user's membership status.
 */
router.get('/societies', requireAuth, async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  try {
    const societies = await listDiscoverableSocieties(req.user!.id, search);
    return res.status(200).json({ societies });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/societies/my
 * Returns the authenticated user's active society memberships and pending join requests.
 */
router.get('/societies/my', requireAuth, async (req: Request, res: Response) => {
  try {
    const { active, pending } = await getSocietiesForUser(req.user!.id);
    return res.status(200).json({
      activeSocieties: active,
      pendingRequests: pending,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// ==========================================
// Society-Scoped Protected Endpoints
// ==========================================

/**
 * GET /api/societies/:societyId
 * Retrieves detailed society information for an authorized member or Super Admin.
 */
router.get('/societies/:societyId', requireAuth, requireSocietyMembership, async (req: Request, res: Response) => {
  return res.status(200).json({
    society: req.society,
    membership: req.membership,
    role: req.societyRole,
  });
});

/**
 * PATCH /api/societies/:societyId
 * Updates permitted society profile information (Admin / Chairman only).
 */
router.patch(
  '/societies/:societyId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('UPDATE_SOCIETY_PROFILE'),
  async (req: Request, res: Response) => {
    const { name, address, city, state, postalCode, contactEmail, contactPhone } = req.body || {};

    try {
      const updated = await updateSocietyProfile(
        req.society!.id,
        { name, address, city, state, postalCode, contactEmail, contactPhone },
        req.user!.id
      );

      return res.status(200).json({
        success: true,
        message: 'Society profile updated successfully.',
        society: updated,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/join
 * Submits a new membership request to join a housing society.
 */
router.post('/societies/:societyId', requireAuth, async (req: Request, res: Response) => {
  const { societyId } = req.params;
  const { unitNumber, wing, memberType, notes } = req.body || {};

  if (!societyId) {
    return res.status(400).json({ error: 'Missing societyId parameter.' });
  }

  const validMemberTypes = ['OWNER', 'TENANT', 'FAMILY_MEMBER', 'VENDOR_REPRESENTATIVE', 'FACILITY_STAFF'];
  if (memberType && !validMemberTypes.includes(memberType)) {
    return res.status(400).json({
      error: `Invalid memberType. Must be one of: ${validMemberTypes.join(', ')}`,
    });
  }

  try {
    const membership = await requestMembership(societyId, req.user!.id, {
      unitNumber,
      wing,
      memberType,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Membership request submitted successfully. Awaiting committee review.',
      membership,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: msg });
  }
});

// Also support POST /api/societies/:societyId/join explicit alias
router.post('/societies/:societyId/join', requireAuth, async (req: Request, res: Response) => {
  const { societyId } = req.params;
  const { unitNumber, wing, memberType, notes } = req.body || {};

  if (!societyId) {
    return res.status(400).json({ error: 'Missing societyId parameter.' });
  }

  const validMemberTypes = ['OWNER', 'TENANT', 'FAMILY_MEMBER', 'VENDOR_REPRESENTATIVE', 'FACILITY_STAFF'];
  if (memberType && !validMemberTypes.includes(memberType)) {
    return res.status(400).json({
      error: `Invalid memberType. Must be one of: ${validMemberTypes.join(', ')}`,
    });
  }

  try {
    const membership = await requestMembership(societyId, req.user!.id, {
      unitNumber,
      wing,
      memberType,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Membership request submitted successfully. Awaiting committee review.',
      membership,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: msg });
  }
});

/**
 * GET /api/societies/:societyId/members
 * Lists approved members of the housing society.
 * Enforces VIEW_MEMBER_DIRECTORY permission (Vendors and Staff are restricted).
 */
router.get(
  '/societies/:societyId/members',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('VIEW_MEMBER_DIRECTORY'),
  async (req: Request, res: Response) => {
    try {
      const members = await listSocietyMembers(req.society!.id);
      return res.status(200).json({ members });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * GET /api/societies/:societyId/requests
 * Lists pending membership requests for committee review.
 */
router.get(
  '/societies/:societyId/requests',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEMBERSHIPS'),
  async (req: Request, res: Response) => {
    try {
      const requests = await listPendingRequests(req.society!.id);
      return res.status(200).json({ requests });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/requests/:membershipId/review
 * Approves or rejects a pending membership request.
 * Enforces that reviewers CANNOT approve their own requests.
 */
router.post(
  '/societies/:societyId/requests/:membershipId/review',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEMBERSHIPS'),
  async (req: Request, res: Response) => {
    const { membershipId } = req.params;
    const { decision, role, unitNumber, wing, rejectionReason } = req.body || {};

    if (!membershipId) {
      return res.status(400).json({ error: 'Missing membershipId parameter.' });
    }

    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      return res.status(400).json({
        error: "Invalid decision. Must be either 'APPROVE' or 'REJECT'.",
      });
    }

    if (role && !isValidSocietyRole(role)) {
      return res.status(400).json({
        error: `Invalid role assignment '${role}'.`,
      });
    }

    try {
      const updated = await reviewMembershipRequest(
        req.society!.id,
        membershipId,
        decision,
        req.user!,
        {
          role: role as SocietyRole,
          unitNumber,
          wing,
          rejectionReason,
        }
      );

      return res.status(200).json({
        success: true,
        message: `Membership request ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`,
        membership: updated,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/members/:membershipId/status
 * Suspends, revokes, or reactivates a member's status.
 */
router.patch(
  '/societies/:societyId/members/:membershipId/status',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_MEMBERSHIPS'),
  async (req: Request, res: Response) => {
    const { membershipId } = req.params;
    const { status } = req.body || {};

    if (!membershipId) {
      return res.status(400).json({ error: 'Missing membershipId parameter.' });
    }

    if (!isValidMembershipStatus(status)) {
      return res.status(400).json({
        error: `Invalid membership status '${status}'. Must be APPROVED, SUSPENDED, or REVOKED.`,
      });
    }

    try {
      const updated = await updateMemberStatus(
        req.society!.id,
        membershipId,
        status as MembershipStatus,
        req.user!
      );

      return res.status(200).json({
        success: true,
        message: `Member status updated to '${status}'.`,
        membership: updated,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/members/:membershipId/role
 * Changes a member's society role (ADMIN, CHAIRMAN, TREASURER, etc.).
 */
router.patch(
  '/societies/:societyId/members/:membershipId/role',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('ASSIGN_ROLES'),
  async (req: Request, res: Response) => {
    const { membershipId } = req.params;
    const { role } = req.body || {};

    if (!membershipId) {
      return res.status(400).json({ error: 'Missing membershipId parameter.' });
    }

    if (!isValidSocietyRole(role)) {
      return res.status(400).json({
        error: `Invalid society role '${role}'.`,
      });
    }

    try {
      const updated = await changeMemberRole(
        req.society!.id,
        membershipId,
        role as SocietyRole,
        req.societyRole,
        req.user!,
        Boolean(req.isSuperAdmin)
      );

      return res.status(200).json({
        success: true,
        message: `Member role updated to '${role}'.`,
        membership: updated,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * GET /api/societies/:societyId/audit-logs
 * Retrieves security audit logs for the society.
 */
router.get(
  '/societies/:societyId/audit-logs',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('VIEW_AUDIT_LOGS'),
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string || '50', 10);
    try {
      const auditLogs = await getSocietyAuditLogs(req.society!.id, limit);
      return res.status(200).json({ auditLogs });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }
);

export default router;
