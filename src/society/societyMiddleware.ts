/**
 * SocietyFix AI — Tenant Isolation & Society RBAC Middleware
 * Enforces verified tenant membership, active account status,
 * and least-privilege permission checks on all society-scoped routes.
 */

import type { Request, Response, NextFunction } from 'express';
import { getSocietyById, getMembership } from './societyService.ts';
import { hasSocietyPermission, type SocietyRole, type SocietyPermission } from './societyRbac.ts';
import type { Society, SocietyMembership } from '../db/schema.ts';
import { logger } from '../infrastructure/logger.ts';

declare global {
  namespace Express {
    interface Request {
      society?: Society;
      membership?: SocietyMembership;
      societyRole?: SocietyRole;
    }
  }
}

/**
 * Resolves societyId from URL params, body, or headers.
 */
function extractSocietyId(req: Request): string | null {
  return (
    req.params.societyId ||
    (req.body && req.body.societyId) ||
    (req.headers['x-society-id'] as string) ||
    null
  );
}

/**
 * Tenant Isolation Guard:
 * Verifies that the authenticated user possesses an APPROVED membership in the target society.
 * Universal Platform Super Admins are granted operational oversight.
 */
export async function requireSocietyMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const societyId = extractSocietyId(req);

  if (!societyId) {
    res.status(400).json({ error: 'Missing societyId parameter in request path or body.' });
    return;
  }

  try {
    const society = await getSocietyById(societyId);
    if (!society) {
      // Non-revealing 404 to prevent society enumeration
      res.status(404).json({ error: 'Housing society not found.' });
      return;
    }

    if (society.status !== 'ACTIVE' && !req.isSuperAdmin) {
      res.status(403).json({ error: `Housing society is currently ${society.status.toLowerCase()}.` });
      return;
    }

    // Platform Super Admins possess universal tenant oversight
    if (req.isSuperAdmin) {
      req.society = society;
      req.societyRole = 'ADMIN';
      next();
      return;
    }

    const membership = await getMembership(societyId, req.user!.id);

    if (!membership || membership.status !== 'APPROVED') {
      logger.warn('Blocked unauthorized tenant access attempt', {
        userId: req.user?.id,
        email: req.user?.email,
        societyId,
        membershipStatus: membership?.status || 'NO_RECORD',
        path: req.originalUrl,
      });

      const message = membership
        ? `Access denied: Your membership in this society is currently ${membership.status.toLowerCase()}.`
        : 'Access denied: You are not an approved member and do not have an approved membership in this housing society.';

      res.status(403).json({
        error: message,
        membershipStatus: membership?.status || 'NONE',
      });
      return;
    }

    req.society = society;
    req.membership = membership;
    req.societyRole = membership.role as SocietyRole;

    next();
  } catch (error) {
    logger.error('Error validating society membership context', {
      error: error instanceof Error ? error.message : String(error),
      societyId,
      userId: req.user?.id,
    });
    res.status(500).json({ error: 'Internal server error validating tenant permissions.' });
  }
}

/**
 * Society Role-Based Access Control (RBAC) Guard:
 * Enforces that the authenticated member's society role allows the specified action.
 */
export function requireSocietyPermission(permission: SocietyPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.societyRole;
    const isSuperAdmin = Boolean(req.isSuperAdmin);

    if (!hasSocietyPermission(role, permission, isSuperAdmin)) {
      logger.warn('Forbidden: User lacks required society permission', {
        userId: req.user?.id,
        societyId: req.society?.id,
        role,
        requiredPermission: permission,
        isSuperAdmin,
      });

      res.status(403).json({
        error: `Forbidden: Insufficient privileges. Required permission: '${permission}'.`,
        requiredPermission: permission,
        currentRole: role || 'UNKNOWN',
      });
      return;
    }

    next();
  };
}
