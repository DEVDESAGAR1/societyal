/**
 * SocietyFix AI — Authentication & Platform Super Admin Authorization Middleware
 * Enforces verified Firebase JWT identity, active account status, and Super Admin checks.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyFirebaseIdToken } from './firebaseAdmin.ts';
import { upsertUserFromFirebase, isPlatformSuperAdmin } from './userService.ts';
import type { User } from '../db/schema.ts';
import { logger } from '../infrastructure/logger.ts';

// Extend Express Request interface with authenticated context
declare global {
  namespace Express {
    interface Request {
      user?: User;
      isSuperAdmin?: boolean;
    }
  }
}

/**
 * Extracts and verifies the Firebase Bearer token, provisions/loads the internal user,
 * and enforces account active status.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header. Expected Bearer <token>',
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Bearer token is empty',
    });
    return;
  }

  try {
    // 1. Verify token cryptographically via Firebase Admin SDK
    const claims = await verifyFirebaseIdToken(token);

    // 2. Race-safe internal user resolution / provisioning
    const { user } = await upsertUserFromFirebase(claims);

    // 3. Enforce Account Status Lifecycle
    if (user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DISABLED') {
      logger.warn('Blocked suspended or disabled account from accessing API', {
        userId: user.id,
        email: user.email,
        accountStatus: user.accountStatus,
      });

      res.status(403).json({
        error: `Forbidden: Account is ${user.accountStatus.toLowerCase()}. Please contact the platform administrator.`,
        accountStatus: user.accountStatus,
      });
      return;
    }

    // 4. Resolve Platform Super Admin status
    const isSuperAdmin = await isPlatformSuperAdmin(user.id, user.email);

    // Attach to request
    req.user = user;
    req.isSuperAdmin = isSuperAdmin;

    next();
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    logger.warn('Authentication token verification failed', {
      code: err.code,
      message: err.message,
    });

    const isExpired = err.code === 'auth/id-token-expired';
    res.status(401).json({
      error: isExpired ? 'Unauthorized: Token has expired' : 'Unauthorized: Invalid authentication token',
      code: err.code || 'UNAUTHORIZED',
    });
  }
}

/**
 * Enforces that the authenticated user possesses Platform Super Admin privileges.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.isSuperAdmin) {
      logger.warn('Non-admin user attempted to access Super Admin endpoint', {
        userId: req.user?.id,
        email: req.user?.email,
        path: req.originalUrl,
      });

      res.status(403).json({
        error: 'Forbidden: Platform Super Admin privileges required',
      });
      return;
    }
    next();
  });
}
