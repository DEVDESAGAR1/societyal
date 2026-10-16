/**
 * SocietyFix AI — Housing Societies & Membership Lifecycle Service
 * Manages society creation, membership requests, role assignments,
 * tenant scoping, and tamper-evident security audit logging.
 */

import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { getDb } from '../db/client.ts';
import {
  societies,
  societyMemberships,
  societyAuditLogs,
  users,
  type Society,
  type SocietyMembership,
  type SocietyAuditLog,
  type User,
} from '../db/schema.ts';
import {
  type SocietyRole,
  type MembershipStatus,
  validateMembershipTransition,
  canAssignRole,
  isValidSocietyRole,
} from './societyRbac.ts';
import { logger } from '../infrastructure/logger.ts';

// In-memory fallback stores for unit/integration tests without PostgreSQL instance
const mockSocieties = new Map<string, Society>();
const mockMemberships = new Map<string, SocietyMembership>();
const mockAuditLogs = new Map<string, SocietyAuditLog>();

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function resetMockSocietyStores(): void {
  mockSocieties.clear();
  mockMemberships.clear();
  mockAuditLogs.clear();
}

/**
 * Normalizes a society name into a URL-friendly slug.
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'society'}-${Math.random().toString(36).substring(2, 6)}`;
}

export interface CreateSocietyInput {
  name: string;
  slug?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  societyType?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface RequestMembershipInput {
  unitNumber?: string;
  wing?: string;
  memberType?: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER' | 'VENDOR_REPRESENTATIVE' | 'FACILITY_STAFF';
  notes?: string;
}

export interface EnrichedMember {
  id: string;
  societyId: string;
  userId: string;
  role: SocietyRole;
  status: MembershipStatus;
  unitNumber: string | null;
  wing: string | null;
  memberType: string;
  notes: string | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    accountStatus: string;
  };
}

/**
 * 1. Creates a new housing society.
 * - Creator automatically receives the initial ADMIN role in the society (status APPROVED).
 * - Creator does NOT receive platform Super Admin authority.
 * - Transactional and audited.
 */
export async function createSociety(
  input: CreateSocietyInput,
  creatorUser: User
): Promise<{ society: Society; membership: SocietyMembership }> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Society name is required');
  }

  const slug = input.slug
    ? input.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '')
    : generateSlug(name);

  if (!isDatabaseConfigured()) {
    // Check slug uniqueness in mock
    const existingSlug = Array.from(mockSocieties.values()).find(s => s.slug === slug);
    if (existingSlug) {
      throw new Error(`Society code or slug '${slug}' is already taken.`);
    }

    const societyId = `mock-soc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newSociety: Society = {
      id: societyId,
      name,
      slug,
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      postalCode: input.postalCode.trim(),
      country: input.country || 'India',
      societyType: input.societyType || 'HOUSING_COOPERATIVE',
      status: 'ACTIVE',
      contactEmail: input.contactEmail || creatorUser.email,
      contactPhone: input.contactPhone || null,
      createdById: creatorUser.id,
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSocieties.set(societyId, newSociety);

    // Initial creator membership as ADMIN
    const membershipId = `mock-mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const adminMembership: SocietyMembership = {
      id: membershipId,
      societyId,
      userId: creatorUser.id,
      role: 'ADMIN',
      status: 'APPROVED',
      unitNumber: null,
      wing: null,
      memberType: 'OWNER',
      notes: 'Initial Society Founder & Administrator',
      reviewedById: creatorUser.id,
      reviewedAt: new Date(),
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockMemberships.set(membershipId, adminMembership);

    await recordAuditLog({
      societyId,
      actorUserId: creatorUser.id,
      action: 'SOCIETY_CREATED',
      targetType: 'SOCIETY',
      targetId: societyId,
      metadata: { name, slug, creatorEmail: creatorUser.email },
    });

    return { society: newSociety, membership: adminMembership };
  }

  const db = getDb();

  return await db.transaction(async (tx) => {
    // Check slug uniqueness
    const existing = await tx.select().from(societies).where(eq(societies.slug, slug)).limit(1);
    if (existing.length > 0) {
      throw new Error(`Society code or slug '${slug}' is already taken.`);
    }

    const [newSociety] = await tx
      .insert(societies)
      .values({
        name,
        slug,
        address: input.address.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        postalCode: input.postalCode.trim(),
        country: input.country || 'India',
        societyType: input.societyType || 'HOUSING_COOPERATIVE',
        status: 'ACTIVE',
        contactEmail: input.contactEmail || creatorUser.email,
        contactPhone: input.contactPhone || null,
        createdById: creatorUser.id,
        settings: {},
      })
      .returning();

    // Assign creator as initial approved ADMIN
    const [adminMembership] = await tx
      .insert(societyMemberships)
      .values({
        societyId: newSociety.id,
        userId: creatorUser.id,
        role: 'ADMIN',
        status: 'APPROVED',
        unitNumber: null,
        wing: null,
        memberType: 'OWNER',
        notes: 'Initial Society Founder & Administrator',
        reviewedById: creatorUser.id,
        reviewedAt: new Date(),
      })
      .returning();

    // Record audit event
    await tx.insert(societyAuditLogs).values({
      societyId: newSociety.id,
      actorUserId: creatorUser.id,
      action: 'SOCIETY_CREATED',
      targetType: 'SOCIETY',
      targetId: newSociety.id,
      metadata: { name, slug, creatorEmail: creatorUser.email },
    });

    logger.info('Housing society created successfully', {
      societyId: newSociety.id,
      name: newSociety.name,
      creatorId: creatorUser.id,
    });

    return { society: newSociety, membership: adminMembership };
  });
}

/**
 * 2. Retrieves a society by its unique ID.
 */
export async function getSocietyById(societyId: string): Promise<Society | null> {
  if (!isDatabaseConfigured()) {
    return mockSocieties.get(societyId) || null;
  }
  const db = getDb();
  const rows = await db.select().from(societies).where(eq(societies.id, societyId)).limit(1);
  return rows[0] || null;
}

/**
 * 3. Retrieves a user's active societies and pending membership requests.
 */
export async function getSocietiesForUser(userId: string): Promise<{
  active: Array<{ society: Society; membership: SocietyMembership }>;
  pending: Array<{ society: Society; membership: SocietyMembership }>;
}> {
  if (!isDatabaseConfigured()) {
    const userMems = Array.from(mockMemberships.values()).filter(m => m.userId === userId);
    const active: Array<{ society: Society; membership: SocietyMembership }> = [];
    const pending: Array<{ society: Society; membership: SocietyMembership }> = [];

    for (const mem of userMems) {
      const soc = mockSocieties.get(mem.societyId);
      if (soc) {
        if (mem.status === 'APPROVED') {
          active.push({ society: soc, membership: mem });
        } else if (mem.status === 'PENDING') {
          pending.push({ society: soc, membership: mem });
        }
      }
    }

    return { active, pending };
  }

  const db = getDb();
  const rows = await db
    .select({
      society: societies,
      membership: societyMemberships,
    })
    .from(societyMemberships)
    .innerJoin(societies, eq(societyMemberships.societyId, societies.id))
    .where(eq(societyMemberships.userId, userId))
    .orderBy(desc(societyMemberships.updatedAt));

  const active: Array<{ society: Society; membership: SocietyMembership }> = [];
  const pending: Array<{ society: Society; membership: SocietyMembership }> = [];

  for (const row of rows) {
    if (row.membership.status === 'APPROVED') {
      active.push(row);
    } else if (row.membership.status === 'PENDING') {
      pending.push(row);
    }
  }

  return { active, pending };
}

/**
 * 4. Lists public discoverable societies for joining.
 */
export async function listDiscoverableSocieties(
  userId: string,
  search?: string
): Promise<Array<Society & { userMembershipStatus: MembershipStatus | null }>> {
  if (!isDatabaseConfigured()) {
    const query = search ? search.toLowerCase().trim() : '';
    const all = Array.from(mockSocieties.values()).filter(s => {
      if (s.status !== 'ACTIVE') return false;
      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        s.city.toLowerCase().includes(query) ||
        s.slug.toLowerCase().includes(query)
      );
    });

    return all.map(s => {
      const userMem = Array.from(mockMemberships.values()).find(
        m => m.societyId === s.id && m.userId === userId
      );
      return {
        ...s,
        userMembershipStatus: (userMem?.status as MembershipStatus) || null,
      };
    });
  }

  const db = getDb();
  const condition = search
    ? and(
        eq(societies.status, 'ACTIVE'),
        or(
          ilike(societies.name, `%${search}%`),
          ilike(societies.city, `%${search}%`),
          ilike(societies.slug, `%${search}%`)
        )
      )
    : eq(societies.status, 'ACTIVE');

  const rows = await db.select().from(societies).where(condition).limit(50);

  // Fetch user's memberships for these societies
  const userMems = await db
    .select()
    .from(societyMemberships)
    .where(eq(societyMemberships.userId, userId));

  const memMap = new Map<string, MembershipStatus>();
  for (const m of userMems) {
    memMap.set(m.societyId, m.status as MembershipStatus);
  }

  return rows.map(s => ({
    ...s,
    userMembershipStatus: memMap.get(s.id) || null,
  }));
}

/**
 * 5. Updates society profile details.
 */
export async function updateSocietyProfile(
  societyId: string,
  updates: Partial<Pick<Society, 'name' | 'address' | 'city' | 'state' | 'postalCode' | 'contactEmail' | 'contactPhone'>>,
  actorUserId: string
): Promise<Society> {
  if (!isDatabaseConfigured()) {
    const soc = mockSocieties.get(societyId);
    if (!soc) throw new Error('Society not found');

    if (updates.name) soc.name = updates.name.trim();
    if (updates.address) soc.address = updates.address.trim();
    if (updates.city) soc.city = updates.city.trim();
    if (updates.state) soc.state = updates.state.trim();
    if (updates.postalCode) soc.postalCode = updates.postalCode.trim();
    if (updates.contactEmail !== undefined) soc.contactEmail = updates.contactEmail;
    if (updates.contactPhone !== undefined) soc.contactPhone = updates.contactPhone;
    soc.updatedAt = new Date();

    mockSocieties.set(societyId, soc);

    await recordAuditLog({
      societyId,
      actorUserId,
      action: 'SOCIETY_PROFILE_UPDATED',
      targetType: 'SOCIETY',
      targetId: societyId,
      metadata: updates,
    });

    return soc;
  }

  const db = getDb();
  const [updated] = await db
    .update(societies)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(societies.id, societyId))
    .returning();

  if (!updated) {
    throw new Error('Society not found');
  }

  await recordAuditLog({
    societyId,
    actorUserId,
    action: 'SOCIETY_PROFILE_UPDATED',
    targetType: 'SOCIETY',
    targetId: societyId,
    metadata: updates,
  });

  return updated;
}

/**
 * 6. Requests membership in a housing society.
 * - Prevents duplicate requests.
 * - Enforces PENDING status.
 */
export async function requestMembership(
  societyId: string,
  userId: string,
  details: RequestMembershipInput
): Promise<SocietyMembership> {
  const society = await getSocietyById(societyId);
  if (!society) {
    throw new Error('Housing society not found');
  }
  if (society.status !== 'ACTIVE') {
    throw new Error('This society is currently inactive or suspended');
  }

  if (!isDatabaseConfigured()) {
    const existing = Array.from(mockMemberships.values()).find(
      m => m.societyId === societyId && m.userId === userId
    );

    if (existing) {
      if (existing.status === 'APPROVED') {
        throw new Error('You are already an approved member of this society.');
      }
      if (existing.status === 'PENDING') {
        throw new Error('You already have a pending membership request for this society.');
      }
      if (existing.status === 'SUSPENDED' || existing.status === 'REVOKED') {
        throw new Error(`Your membership is currently ${existing.status.toLowerCase()}. Please contact the committee.`);
      }
      if (existing.status === 'REJECTED') {
        // Re-application allowed
        existing.status = 'PENDING';
        existing.unitNumber = details.unitNumber?.trim() || null;
        existing.wing = details.wing?.trim() || null;
        existing.memberType = details.memberType || 'OWNER';
        existing.notes = details.notes?.trim() || null;
        existing.rejectionReason = null;
        existing.reviewedById = null;
        existing.reviewedAt = null;
        existing.updatedAt = new Date();
        mockMemberships.set(existing.id, existing);

        await recordAuditLog({
          societyId,
          actorUserId: userId,
          action: 'MEMBERSHIP_REQUESTED',
          targetType: 'MEMBERSHIP',
          targetId: existing.id,
          metadata: { unitNumber: details.unitNumber, memberType: details.memberType },
        });

        return existing;
      }
    }

    const membershipId = `mock-mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newMem: SocietyMembership = {
      id: membershipId,
      societyId,
      userId,
      role: 'RESIDENT',
      status: 'PENDING',
      unitNumber: details.unitNumber?.trim() || null,
      wing: details.wing?.trim() || null,
      memberType: details.memberType || 'OWNER',
      notes: details.notes?.trim() || null,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockMemberships.set(membershipId, newMem);

    await recordAuditLog({
      societyId,
      actorUserId: userId,
      action: 'MEMBERSHIP_REQUESTED',
      targetType: 'MEMBERSHIP',
      targetId: membershipId,
      metadata: { unitNumber: details.unitNumber, memberType: details.memberType },
    });

    return newMem;
  }

  const db = getDb();

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.societyId, societyId),
          eq(societyMemberships.userId, userId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0]!;
      if (current.status === 'APPROVED') {
        throw new Error('You are already an approved member of this society.');
      }
      if (current.status === 'PENDING') {
        throw new Error('You already have a pending membership request for this society.');
      }
      if (current.status === 'SUSPENDED' || current.status === 'REVOKED') {
        throw new Error(`Your membership is currently ${current.status.toLowerCase()}. Please contact the committee.`);
      }
      if (current.status === 'REJECTED') {
        // Re-application
        const [reapplied] = await tx
          .update(societyMemberships)
          .set({
            status: 'PENDING',
            unitNumber: details.unitNumber?.trim() || null,
            wing: details.wing?.trim() || null,
            memberType: details.memberType || 'OWNER',
            notes: details.notes?.trim() || null,
            rejectionReason: null,
            reviewedById: null,
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(societyMemberships.id, current.id))
          .returning();

        await tx.insert(societyAuditLogs).values({
          societyId,
          actorUserId: userId,
          action: 'MEMBERSHIP_REQUESTED',
          targetType: 'MEMBERSHIP',
          targetId: reapplied.id,
          metadata: { unitNumber: details.unitNumber, memberType: details.memberType, isReapplication: true },
        });

        return reapplied;
      }
    }

    const [created] = await tx
      .insert(societyMemberships)
      .values({
        societyId,
        userId,
        role: 'RESIDENT',
        status: 'PENDING',
        unitNumber: details.unitNumber?.trim() || null,
        wing: details.wing?.trim() || null,
        memberType: details.memberType || 'OWNER',
        notes: details.notes?.trim() || null,
      })
      .returning();

    await tx.insert(societyAuditLogs).values({
      societyId,
      actorUserId: userId,
      action: 'MEMBERSHIP_REQUESTED',
      targetType: 'MEMBERSHIP',
      targetId: created.id,
      metadata: { unitNumber: details.unitNumber, memberType: details.memberType },
    });

    return created;
  });
}

/**
 * 7. Resolves a user's membership for a specific society.
 */
export async function getMembership(
  societyId: string,
  userId: string
): Promise<SocietyMembership | null> {
  if (!isDatabaseConfigured()) {
    return (
      Array.from(mockMemberships.values()).find(
        m => m.societyId === societyId && m.userId === userId
      ) || null
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(societyMemberships)
    .where(
      and(
        eq(societyMemberships.societyId, societyId),
        eq(societyMemberships.userId, userId)
      )
    )
    .limit(1);

  return rows[0] || null;
}

/**
 * 8. Lists approved society members with user directory information.
 */
export async function listSocietyMembers(societyId: string): Promise<EnrichedMember[]> {
  if (!isDatabaseConfigured()) {
    const mems = Array.from(mockMemberships.values()).filter(
      m => m.societyId === societyId && m.status === 'APPROVED'
    );

    return mems.map(m => {
      // In mock mode, find user from mock store
      const u = (globalThis as any).mockUserStore?.get(m.userId) || {
        id: m.userId,
        email: 'member@societyfix.test',
        fullName: 'Society Member',
        avatarUrl: null,
        accountStatus: 'ACTIVE',
      };
      return {
        id: m.id,
        societyId: m.societyId,
        userId: m.userId,
        role: m.role as SocietyRole,
        status: m.status as MembershipStatus,
        unitNumber: m.unitNumber,
        wing: m.wing,
        memberType: m.memberType,
        notes: m.notes,
        createdAt: m.createdAt,
        user: {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl,
          accountStatus: u.accountStatus,
        },
      };
    });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: societyMemberships.id,
      societyId: societyMemberships.societyId,
      userId: societyMemberships.userId,
      role: societyMemberships.role,
      status: societyMemberships.status,
      unitNumber: societyMemberships.unitNumber,
      wing: societyMemberships.wing,
      memberType: societyMemberships.memberType,
      notes: societyMemberships.notes,
      createdAt: societyMemberships.createdAt,
      user: {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        accountStatus: users.accountStatus,
      },
    })
    .from(societyMemberships)
    .innerJoin(users, eq(societyMemberships.userId, users.id))
    .where(
      and(
        eq(societyMemberships.societyId, societyId),
        eq(societyMemberships.status, 'APPROVED')
      )
    )
    .orderBy(desc(societyMemberships.createdAt));

  return rows as EnrichedMember[];
}

/**
 * 9. Lists pending membership requests for administrative review.
 */
export async function listPendingRequests(societyId: string): Promise<EnrichedMember[]> {
  if (!isDatabaseConfigured()) {
    const mems = Array.from(mockMemberships.values()).filter(
      m => m.societyId === societyId && m.status === 'PENDING'
    );

    return mems.map(m => {
      const u = (globalThis as any).mockUserStore?.get(m.userId) || {
        id: m.userId,
        email: 'applicant@societyfix.test',
        fullName: 'Pending Applicant',
        avatarUrl: null,
        accountStatus: 'ACTIVE',
      };
      return {
        id: m.id,
        societyId: m.societyId,
        userId: m.userId,
        role: m.role as SocietyRole,
        status: m.status as MembershipStatus,
        unitNumber: m.unitNumber,
        wing: m.wing,
        memberType: m.memberType,
        notes: m.notes,
        createdAt: m.createdAt,
        user: {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl,
          accountStatus: u.accountStatus,
        },
      };
    });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: societyMemberships.id,
      societyId: societyMemberships.societyId,
      userId: societyMemberships.userId,
      role: societyMemberships.role,
      status: societyMemberships.status,
      unitNumber: societyMemberships.unitNumber,
      wing: societyMemberships.wing,
      memberType: societyMemberships.memberType,
      notes: societyMemberships.notes,
      createdAt: societyMemberships.createdAt,
      user: {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        accountStatus: users.accountStatus,
      },
    })
    .from(societyMemberships)
    .innerJoin(users, eq(societyMemberships.userId, users.id))
    .where(
      and(
        eq(societyMemberships.societyId, societyId),
        eq(societyMemberships.status, 'PENDING')
      )
    )
    .orderBy(desc(societyMemberships.createdAt));

  return rows as EnrichedMember[];
}

/**
 * 10. Reviews a pending membership request (Approve or Reject).
 * - Self-approval is strictly forbidden (reviewer cannot be applicant).
 * - Enforces valid state transition PENDING -> APPROVED or PENDING -> REJECTED.
 * - Atomic and audited.
 */
export async function reviewMembershipRequest(
  societyId: string,
  membershipId: string,
  decision: 'APPROVE' | 'REJECT',
  reviewerUser: User,
  options?: { role?: SocietyRole; unitNumber?: string; wing?: string; rejectionReason?: string }
): Promise<SocietyMembership> {
  const targetStatus: MembershipStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  if (!isDatabaseConfigured()) {
    const mem = mockMemberships.get(membershipId);
    if (!mem || mem.societyId !== societyId) {
      throw new Error('Membership request not found in this society');
    }

    if (mem.userId === reviewerUser.id) {
      throw new Error('Self-approval forbidden: You cannot approve or reject your own membership request.');
    }

    const transitionCheck = validateMembershipTransition(mem.status as MembershipStatus, targetStatus);
    if (!transitionCheck.valid) {
      throw new Error(transitionCheck.reason || 'Invalid membership transition');
    }

    mem.status = targetStatus;
    mem.reviewedById = reviewerUser.id;
    mem.reviewedAt = new Date();
    mem.updatedAt = new Date();

    if (decision === 'APPROVE') {
      if (options?.role && isValidSocietyRole(options.role)) {
        mem.role = options.role;
      }
      if (options?.unitNumber) mem.unitNumber = options.unitNumber;
      if (options?.wing) mem.wing = options.wing;
    } else {
      mem.rejectionReason = options?.rejectionReason?.trim() || 'Request rejected by committee';
    }

    mockMemberships.set(membershipId, mem);

    await recordAuditLog({
      societyId,
      actorUserId: reviewerUser.id,
      action: decision === 'APPROVE' ? 'MEMBERSHIP_APPROVED' : 'MEMBERSHIP_REJECTED',
      targetType: 'MEMBERSHIP',
      targetId: membershipId,
      metadata: {
        applicantUserId: mem.userId,
        decision,
        assignedRole: mem.role,
        rejectionReason: mem.rejectionReason,
      },
    });

    return mem;
  }

  const db = getDb();

  return await db.transaction(async (tx) => {
    const [mem] = await tx
      .select()
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.id, membershipId),
          eq(societyMemberships.societyId, societyId)
        )
      )
      .limit(1);

    if (!mem) {
      throw new Error('Membership request not found in this society');
    }

    if (mem.userId === reviewerUser.id) {
      throw new Error('Self-approval forbidden: You cannot approve or reject your own membership request.');
    }

    const transitionCheck = validateMembershipTransition(mem.status as MembershipStatus, targetStatus);
    if (!transitionCheck.valid) {
      throw new Error(transitionCheck.reason || 'Invalid membership transition');
    }

    const updatePayload: Partial<SocietyMembership> = {
      status: targetStatus,
      reviewedById: reviewerUser.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    };

    if (decision === 'APPROVE') {
      if (options?.role && isValidSocietyRole(options.role)) {
        updatePayload.role = options.role;
      }
      if (options?.unitNumber) updatePayload.unitNumber = options.unitNumber;
      if (options?.wing) updatePayload.wing = options.wing;
    } else {
      updatePayload.rejectionReason = options?.rejectionReason?.trim() || 'Request rejected by committee';
    }

    const [updated] = await tx
      .update(societyMemberships)
      .set(updatePayload)
      .where(eq(societyMemberships.id, membershipId))
      .returning();

    await tx.insert(societyAuditLogs).values({
      societyId,
      actorUserId: reviewerUser.id,
      action: decision === 'APPROVE' ? 'MEMBERSHIP_APPROVED' : 'MEMBERSHIP_REJECTED',
      targetType: 'MEMBERSHIP',
      targetId: membershipId,
      metadata: {
        applicantUserId: mem.userId,
        decision,
        assignedRole: updated.role,
        rejectionReason: updated.rejectionReason,
      },
    });

    return updated;
  });
}

/**
 * 11. Suspends, revokes, or reactivates a member.
 * - Prevents suspending/revoking the only active ADMIN in the society.
 * - Enforces valid state transitions.
 */
export async function updateMemberStatus(
  societyId: string,
  membershipId: string,
  newStatus: MembershipStatus,
  actorUser: User
): Promise<SocietyMembership> {
  if (!isDatabaseConfigured()) {
    const mem = mockMemberships.get(membershipId);
    if (!mem || mem.societyId !== societyId) {
      throw new Error('Member record not found in this society');
    }

    const transitionCheck = validateMembershipTransition(mem.status as MembershipStatus, newStatus);
    if (!transitionCheck.valid) {
      throw new Error(transitionCheck.reason || 'Invalid status transition');
    }

    // Safety guard: cannot suspend or revoke the only active ADMIN
    if (mem.role === 'ADMIN' && (newStatus === 'SUSPENDED' || newStatus === 'REVOKED')) {
      const activeAdmins = Array.from(mockMemberships.values()).filter(
        m => m.societyId === societyId && m.role === 'ADMIN' && m.status === 'APPROVED' && m.id !== membershipId
      );
      if (activeAdmins.length === 0) {
        throw new Error('Cannot suspend or revoke the only active Administrator in the society.');
      }
    }

    mem.status = newStatus;
    mem.updatedAt = new Date();
    mockMemberships.set(membershipId, mem);

    await recordAuditLog({
      societyId,
      actorUserId: actorUser.id,
      action: `MEMBERSHIP_${newStatus}`,
      targetType: 'MEMBERSHIP',
      targetId: membershipId,
      metadata: { targetUserId: mem.userId, newStatus },
    });

    return mem;
  }

  const db = getDb();

  return await db.transaction(async (tx) => {
    const [mem] = await tx
      .select()
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.id, membershipId),
          eq(societyMemberships.societyId, societyId)
        )
      )
      .limit(1);

    if (!mem) {
      throw new Error('Member record not found in this society');
    }

    const transitionCheck = validateMembershipTransition(mem.status as MembershipStatus, newStatus);
    if (!transitionCheck.valid) {
      throw new Error(transitionCheck.reason || 'Invalid status transition');
    }

    // Guard last remaining active admin
    if (mem.role === 'ADMIN' && (newStatus === 'SUSPENDED' || newStatus === 'REVOKED')) {
      const remainingAdmins = await tx
        .select()
        .from(societyMemberships)
        .where(
          and(
            eq(societyMemberships.societyId, societyId),
            eq(societyMemberships.role, 'ADMIN'),
            eq(societyMemberships.status, 'APPROVED'),
            sql`${societyMemberships.id} != ${membershipId}`
          )
        );

      if (remainingAdmins.length === 0) {
        throw new Error('Cannot suspend or revoke the only active Administrator in the society.');
      }
    }

    const [updated] = await tx
      .update(societyMemberships)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(societyMemberships.id, membershipId))
      .returning();

    await tx.insert(societyAuditLogs).values({
      societyId,
      actorUserId: actorUser.id,
      action: `MEMBERSHIP_${newStatus}`,
      targetType: 'MEMBERSHIP',
      targetId: membershipId,
      metadata: { targetUserId: mem.userId, newStatus },
    });

    return updated;
  });
}

/**
 * 12. Changes a member's society role.
 * - Prevents demoting the last active ADMIN.
 * - Audited.
 */
export async function changeMemberRole(
  societyId: string,
  membershipId: string,
  newRole: SocietyRole,
  actorRole: SocietyRole | undefined | null,
  actorUser: User,
  isSuperAdmin = false
): Promise<SocietyMembership> {
  if (!canAssignRole(actorRole, newRole, isSuperAdmin)) {
    throw new Error(`Forbidden: You do not have permission to assign the role '${newRole}'.`);
  }

  if (!isDatabaseConfigured()) {
    const mem = mockMemberships.get(membershipId);
    if (!mem || mem.societyId !== societyId) {
      throw new Error('Member record not found in this society');
    }

    // Guard last remaining admin
    if (mem.role === 'ADMIN' && newRole !== 'ADMIN') {
      const remainingAdmins = Array.from(mockMemberships.values()).filter(
        m => m.societyId === societyId && m.role === 'ADMIN' && m.status === 'APPROVED' && m.id !== membershipId
      );
      if (remainingAdmins.length === 0) {
        throw new Error('Cannot demote the only active Administrator in the society.');
      }
    }

    const oldRole = mem.role;
    mem.role = newRole;
    mem.updatedAt = new Date();
    mockMemberships.set(membershipId, mem);

    await recordAuditLog({
      societyId,
      actorUserId: actorUser.id,
      action: 'ROLE_CHANGED',
      targetType: 'ROLE',
      targetId: membershipId,
      metadata: { targetUserId: mem.userId, oldRole, newRole },
    });

    return mem;
  }

  const db = getDb();

  return await db.transaction(async (tx) => {
    const [mem] = await tx
      .select()
      .from(societyMemberships)
      .where(
        and(
          eq(societyMemberships.id, membershipId),
          eq(societyMemberships.societyId, societyId)
        )
      )
      .limit(1);

    if (!mem) {
      throw new Error('Member record not found in this society');
    }

    // Guard last remaining admin
    if (mem.role === 'ADMIN' && newRole !== 'ADMIN') {
      const remainingAdmins = await tx
        .select()
        .from(societyMemberships)
        .where(
          and(
            eq(societyMemberships.societyId, societyId),
            eq(societyMemberships.role, 'ADMIN'),
            eq(societyMemberships.status, 'APPROVED'),
            sql`${societyMemberships.id} != ${membershipId}`
          )
        );

      if (remainingAdmins.length === 0) {
        throw new Error('Cannot demote the only active Administrator in the society.');
      }
    }

    const oldRole = mem.role;
    const [updated] = await tx
      .update(societyMemberships)
      .set({
        role: newRole,
        updatedAt: new Date(),
      })
      .where(eq(societyMemberships.id, membershipId))
      .returning();

    await tx.insert(societyAuditLogs).values({
      societyId,
      actorUserId: actorUser.id,
      action: 'ROLE_CHANGED',
      targetType: 'ROLE',
      targetId: membershipId,
      metadata: { targetUserId: mem.userId, oldRole, newRole },
    });

    return updated;
  });
}

/**
 * 13. Retrieves society security audit logs.
 */
export async function getSocietyAuditLogs(
  societyId: string,
  limit = 100
): Promise<SocietyAuditLog[]> {
  if (!isDatabaseConfigured()) {
    return Array.from(mockAuditLogs.values())
      .filter(l => l.societyId === societyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  const db = getDb();
  return db
    .select()
    .from(societyAuditLogs)
    .where(eq(societyAuditLogs.societyId, societyId))
    .orderBy(desc(societyAuditLogs.createdAt))
    .limit(limit);
}

/**
 * Helper to record safe audit logs.
 */
export async function recordAuditLog(params: {
  societyId?: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const safeMetadata = params.metadata ? { ...params.metadata } : {};

  // Strip sensitive keys from audit log metadata
  delete safeMetadata.token;
  delete safeMetadata.password;
  delete safeMetadata.secret;
  delete safeMetadata.bootstrapSecret;

  if (!isDatabaseConfigured()) {
    const id = `mock-audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const log: SocietyAuditLog = {
      id,
      societyId: params.societyId || null,
      actorUserId: params.actorUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: safeMetadata,
      createdAt: new Date(),
    };
    mockAuditLogs.set(id, log);
    return;
  }

  const db = getDb();
  await db.insert(societyAuditLogs).values({
    societyId: params.societyId || null,
    actorUserId: params.actorUserId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: safeMetadata,
  });
}
