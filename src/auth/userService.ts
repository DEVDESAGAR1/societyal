/**
 * SocietyFix AI — User Identity and Platform Super Admin Service
 * Handles internal user record resolution, race-safe provisioning, and Super Admin authorization.
 */

import { eq } from 'drizzle-orm';
import { getDb, getDatabasePool } from '../db/client.ts';
import { users, platformAdmins, type User, type PlatformAdmin } from '../db/schema.ts';
import { logger } from '../infrastructure/logger.ts';
import type { VerifiedTokenClaims } from './firebaseAdmin.ts';

// In-memory fallback repository when running unit tests without live PostgreSQL database
const mockUserStore = new Map<string, User>();
const mockAdminStore = new Map<string, PlatformAdmin>();

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Parses configured Super Admin emails from environment variable.
 * Format: comma-separated list of emails, e.g. "admin@societyfix.ai,devdesagar@gmail.com"
 */
export function getConfiguredSuperAdminEmails(): Set<string> {
  const envVal = process.env.SUPER_ADMIN_EMAILS || 'devdesagar@gmail.com,admin@societyfix.ai';
  const set = new Set<string>();
  for (const email of envVal.split(',')) {
    const trimmed = email.trim().toLowerCase();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return set;
}

/**
 * Finds user by Firebase UID.
 */
export async function findUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
  if (!isDatabaseConfigured()) {
    return Array.from(mockUserStore.values()).find(u => u.firebaseUid === firebaseUid) || null;
  }

  const db = getDb();
  const results = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
  return results[0] || null;
}

/**
 * Finds user by internal UUID.
 */
export async function findUserById(id: string): Promise<User | null> {
  if (!isDatabaseConfigured()) {
    return mockUserStore.get(id) || null;
  }

  const db = getDb();
  const results = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return results[0] || null;
}

/**
 * Resolves whether a given user is an active Platform Super Admin.
 */
export async function isPlatformSuperAdmin(userId: string, email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check in-memory store if DB not available
  if (!isDatabaseConfigured()) {
    const inMock = Array.from(mockAdminStore.values()).some(
      a => (a.userId === userId || a.email.toLowerCase() === normalizedEmail) && a.isActive
    );
    if (inMock) return true;
  } else {
    // 2. Check platform_admins table in PostgreSQL
    const db = getDb();
    const adminRecords = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.email, normalizedEmail))
      .limit(1);

    if (adminRecords.length > 0 && adminRecords[0]?.isActive) {
      return true;
    }
  }

  // 3. Check if email is in configured SUPER_ADMIN_EMAILS allowlist
  const allowlist = getConfiguredSuperAdminEmails();
  return allowlist.has(normalizedEmail);
}

/**
 * Race-safe, idempotent user provisioning from verified Firebase token claims.
 * - Does NOT trust any client-supplied role or accountStatus.
 * - Preserves existing accountStatus (SUSPENDED or DISABLED will NOT be reactivated).
 * - Synchronizes verified name and avatar.
 */
export async function upsertUserFromFirebase(claims: VerifiedTokenClaims): Promise<{ user: User; isNewUser: boolean }> {
  const normalizedEmail = claims.email.toLowerCase().trim();
  const fullName = claims.name || normalizedEmail.split('@')[0] || 'Resident';
  const avatarUrl = claims.picture || null;

  // In-memory fallback mode for testing without PostgreSQL
  if (!isDatabaseConfigured()) {
    let existing = Array.from(mockUserStore.values()).find(u => u.firebaseUid === claims.uid);
    if (existing) {
      existing.fullName = fullName;
      existing.avatarUrl = avatarUrl;
      existing.lastSignInAt = new Date();
      existing.updatedAt = new Date();
      mockUserStore.set(existing.id, existing);
      return { user: existing, isNewUser: false };
    }

    const newUser: User = {
      id: `mock-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      firebaseUid: claims.uid,
      email: normalizedEmail,
      fullName,
      avatarUrl,
      phoneNumber: null,
      preferredLanguage: 'en',
      accountStatus: 'ACTIVE',
      lastSignInAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockUserStore.set(newUser.id, newUser);

    // Auto-link to platform admins if in allowlist
    if (getConfiguredSuperAdminEmails().has(normalizedEmail)) {
      mockAdminStore.set(newUser.id, {
        id: `mock-admin-${newUser.id}`,
        userId: newUser.id,
        email: normalizedEmail,
        fullName,
        isActive: true,
        grantedBy: 'ALLOWLIST_SYNC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return { user: newUser, isNewUser: true };
  }

  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    // Execute atomic PostgreSQL upsert using ON CONFLICT (firebase_uid)
    // Preserves existing account_status!
    const query = `
      INSERT INTO users (
        firebase_uid,
        email,
        full_name,
        avatar_url,
        account_status,
        last_sign_in_at
      )
      VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())
      ON CONFLICT (firebase_uid) DO UPDATE
      SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        last_sign_in_at = clock_timestamp(),
        updated_at = clock_timestamp()
      RETURNING *, (xmax = 0) AS is_new_user;
    `;

    const res = await client.query(query, [claims.uid, normalizedEmail, fullName, avatarUrl]);
    const row = res.rows[0];
    const isNewUser = Boolean(row.is_new_user);

    const user: User = {
      id: row.id,
      firebaseUid: row.firebase_uid,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      phoneNumber: row.phone_number,
      preferredLanguage: row.preferred_language,
      accountStatus: row.account_status,
      lastSignInAt: row.last_sign_in_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // If email is in configured SUPER_ADMIN_EMAILS allowlist, ensure platform_admins record
    if (getConfiguredSuperAdminEmails().has(normalizedEmail)) {
      await client.query(`
        INSERT INTO platform_admins (user_id, email, full_name, is_active, granted_by)
        VALUES ($1, $2, $3, true, 'ENV_ALLOWLIST')
        ON CONFLICT (email) DO UPDATE
        SET user_id = EXCLUDED.user_id, full_name = EXCLUDED.full_name, is_active = true, updated_at = clock_timestamp();
      `, [user.id, user.email, user.fullName]);
    }

    return { user, isNewUser };
  } finally {
    client.release();
  }
}

/**
 * Bootstraps or elevates an authenticated user to Platform Super Admin.
 * Validates either:
 * 1. User's email is in SUPER_ADMIN_EMAILS
 * 2. Or caller provided a valid SUPER_ADMIN_BOOTSTRAP_SECRET matching process.env.
 */
export async function bootstrapSuperAdmin(user: User, secret?: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = user.email.toLowerCase().trim();
  const allowlist = getConfiguredSuperAdminEmails();
  const expectedSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET;

  const isEmailAllowed = allowlist.has(normalizedEmail);
  const isSecretValid = Boolean(expectedSecret && secret && secret === expectedSecret);

  if (!isEmailAllowed && !isSecretValid) {
    logger.warn('Unauthorized Super Admin bootstrap attempt', {
      userId: user.id,
      email: user.email,
      hasSecretProvided: Boolean(secret),
    });
    return {
      success: false,
      message: 'Unauthorized: User email is not in platform admin allowlist and invalid bootstrap secret provided.',
    };
  }

  const grantSource = isEmailAllowed ? 'ENV_ALLOWLIST' : 'BOOTSTRAP_SECRET';

  if (!isDatabaseConfigured()) {
    mockAdminStore.set(user.id, {
      id: `admin-${user.id}`,
      userId: user.id,
      email: normalizedEmail,
      fullName: user.fullName,
      isActive: true,
      grantedBy: grantSource,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { success: true, message: `Successfully provisioned Super Admin via ${grantSource}.` };
  }

  const db = getDb();
  await db.insert(platformAdmins).values({
    userId: user.id,
    email: normalizedEmail,
    fullName: user.fullName,
    isActive: true,
    grantedBy: grantSource,
  }).onConflictDoUpdate({
    target: platformAdmins.email,
    set: {
      userId: user.id,
      fullName: user.fullName,
      isActive: true,
      grantedBy: grantSource,
      updatedAt: new Date(),
    }
  });

  logger.info('Platform Super Admin successfully provisioned', {
    userId: user.id,
    email: normalizedEmail,
    grantedBy: grantSource,
  });

  return { success: true, message: `Successfully provisioned Super Admin via ${grantSource}.` };
}

/**
 * Lists all registered users for Super Admin oversight.
 */
export async function listUsers(): Promise<User[]> {
  if (!isDatabaseConfigured()) {
    return Array.from(mockUserStore.values());
  }
  const db = getDb();
  return db.select().from(users).orderBy(users.createdAt);
}

/**
 * Updates a user's account status (ACTIVE, SUSPENDED, DISABLED).
 * Super Admins cannot suspend themselves.
 */
export async function setUserAccountStatus(
  targetUserId: string,
  newStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
  adminUserId: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  if (targetUserId === adminUserId && newStatus !== 'ACTIVE') {
    return { success: false, error: 'Self-modification forbidden: You cannot suspend your own administrative account.' };
  }

  if (!isDatabaseConfigured()) {
    const target = mockUserStore.get(targetUserId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }
    target.accountStatus = newStatus;
    target.updatedAt = new Date();
    mockUserStore.set(targetUserId, target);
    return { success: true, user: target };
  }

  const db = getDb();
  const updated = await db
    .update(users)
    .set({ accountStatus: newStatus, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning();

  if (updated.length === 0) {
    return { success: false, error: 'User not found' };
  }

  logger.info('User account status updated by admin', {
    targetUserId,
    newStatus,
    adminUserId,
  });

  return { success: true, user: updated[0] };
}

/**
 * Resets in-memory stores for clean test isolation.
 */
export function resetMockStores(): void {
  mockUserStore.clear;
  mockAdminStore.clear();
}
