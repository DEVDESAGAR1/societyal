/**
 * SocietyFix AI — Authentication & Platform Administration API Routes
 * Implements user profile resolution, Super Admin bootstrap, and administrative oversight.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireSuperAdmin } from '../auth/authMiddleware.ts';
import { bootstrapSuperAdmin, listUsers, setUserAccountStatus, isPlatformSuperAdmin } from '../auth/userService.ts';
import { checkDatabaseHealth } from '../db/client.ts';
import { logger } from '../infrastructure/logger.ts';

const router = Router();

// ==========================================
// User Identity & Session Routes
// ==========================================

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and platform authorization status.
 */
router.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const isSuperAdmin = Boolean(req.isSuperAdmin);

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      phoneNumber: user.phoneNumber,
      accountStatus: user.accountStatus,
      preferredLanguage: user.preferredLanguage,
      lastSignInAt: user.lastSignInAt,
      createdAt: user.createdAt,
    },
    authorization: {
      isSuperAdmin,
      platformRoles: isSuperAdmin ? ['SUPER_ADMIN'] : ['STANDARD_USER'],
    },
    milestone: 'M4',
  });
});

/**
 * POST /api/auth/bootstrap
 * Secure server-side bootstrap to provision the initial Platform Super Admin.
 * Validates either configured environment allowlist (SUPER_ADMIN_EMAILS)
 * or trusted server-side bootstrap secret (SUPER_ADMIN_BOOTSTRAP_SECRET).
 */
router.post('/auth/bootstrap', requireAuth, async (req: Request, res: Response) => {
  const user = req.user!;
  const { bootstrapSecret } = req.body || {};

  const result = await bootstrapSuperAdmin(user, bootstrapSecret);

  if (!result.success) {
    return res.status(403).json({
      error: result.message,
    });
  }

  const updatedAdminStatus = await isPlatformSuperAdmin(user.id, user.email);

  return res.status(200).json({
    success: true,
    message: result.message,
    isSuperAdmin: updatedAdminStatus,
  });
});

/**
 * POST /api/auth/logout
 * Server-side logout endpoint for session auditing and client cache invalidation.
 */
router.post('/auth/logout', requireAuth, (req: Request, res: Response) => {
  logger.info('User signed out', { userId: req.user?.id, email: req.user?.email });
  return res.status(200).json({
    success: true,
    message: 'Signed out successfully',
  });
});

// ==========================================
// Platform Super Admin Routes
// ==========================================

/**
 * GET /api/admin/overview
 * Protected dashboard overview for Platform Super Admins.
 */
router.get('/admin/overview', requireSuperAdmin, async (_req: Request, res: Response) => {
  const allUsers = await listUsers();
  const dbHealth = await checkDatabaseHealth();

  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter(u => u.accountStatus === 'ACTIVE').length;
  const suspendedUsers = allUsers.filter(u => u.accountStatus === 'SUSPENDED').length;
  const disabledUsers = allUsers.filter(u => u.accountStatus === 'DISABLED').length;

  return res.status(200).json({
    platform: {
      name: 'SocietyFix AI',
      milestone: 'M2',
      status: dbHealth.status !== 'UNHEALTHY' ? 'OPERATIONAL' : 'DEGRADED',
      database: dbHealth,
    },
    metrics: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      disabledUsers,
    },
    societyAdministration: {
      status: 'M3_PENDING',
      totalSocieties: 0,
      notice: 'Society onboarding, wings, flats, and committee RBAC will be enabled in Milestone M3.',
    },
  });
});

/**
 * GET /api/admin/users
 * Returns list of registered platform users for Super Admin management.
 */
router.get('/admin/users', requireSuperAdmin, async (_req: Request, res: Response) => {
  const allUsers = await listUsers();
  return res.status(200).json({
    users: allUsers.map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      accountStatus: u.accountStatus,
      lastSignInAt: u.lastSignInAt,
      createdAt: u.createdAt,
    })),
  });
});

/**
 * PATCH /api/admin/users/:userId/status
 * Updates a user's account status (ACTIVE, SUSPENDED, DISABLED).
 */
router.patch('/admin/users/:userId/status', requireSuperAdmin, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { accountStatus } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(accountStatus)) {
    return res.status(400).json({
      error: 'Invalid accountStatus. Must be one of: ACTIVE, SUSPENDED, DISABLED',
    });
  }

  const result = await setUserAccountStatus(userId, accountStatus, req.user!.id);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(200).json({
    success: true,
    user: result.user,
  });
});

export default router;
