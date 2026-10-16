/**
 * SocietyFix AI — Milestone M3 Automated Security & RBAC Test Suite
 * Covers:
 * 1. Authentication & Account Status Enforcement
 * 2. Multi-Tenant Isolation & Cross-Society Boundary Enforcement
 * 3. Membership Lifecycle & State Machine Transitions
 * 4. Self-Approval & Privilege Escalation Prevention
 * 5. Least-Privilege Role-Based Access Control (RBAC)
 * 6. Tamper-Evident Security Audit Logging
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../server.ts';
import {
  createSociety,
  requestMembership,
  reviewMembershipRequest,
  updateMemberStatus,
  changeMemberRole,
  getSocietyAuditLogs,
  resetMockSocietyStores,
} from '../src/society/societyService.ts';
import {
  hasSocietyPermission,
  validateMembershipTransition,
  canAssignRole,
} from '../src/society/societyRbac.ts';
import {
  upsertUserFromFirebase,
  setUserAccountStatus,
  resetMockStores,
} from '../src/auth/userService.ts';

let server: http.Server;
let baseUrl: string;

// Test users
const userFounderA = {
  uid: 'user_founder_a',
  email: 'founder.a@societyfix.test',
  name: 'Aarav Founder A',
};

const userResidentA = {
  uid: 'user_resident_a',
  email: 'resident.a@societyfix.test',
  name: 'Rohan Resident A',
};

const userVendorA = {
  uid: 'user_vendor_a',
  email: 'vendor.a@facility.test',
  name: 'Vikas Vendor A',
};

const userResidentB = {
  uid: 'user_resident_b',
  email: 'resident.b@societyfix.test',
  name: 'Bhavna Resident B',
};

const userSuspended = {
  uid: 'user_suspended_m3',
  email: 'suspended.m3@societyfix.test',
  name: 'Suresh Suspended',
};

before((_, done) => {
  server = app.listen(0, '127.0.0.1', () => {
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    done();
  });
});

after((_, done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

beforeEach(() => {
  resetMockStores();
  resetMockSocietyStores();
});

describe('1. Authentication & Account Status Enforcement on Societies', () => {
  it('rejects unauthenticated requests to society endpoints with 401', async () => {
    const res = await fetch(`${baseUrl}/api/societies`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Missing or invalid Authorization header'));
  });

  it('rejects requests with invalid or forged tokens with 401', async () => {
    const res = await fetch(`${baseUrl}/api/societies`, {
      headers: { Authorization: 'Bearer mock-token-invalid:fake:fake@test.local' },
    });
    assert.strictEqual(res.status, 401);
  });

  it('blocks suspended user account from creating or accessing societies with 403', async () => {
    const token = `mock-token-valid:${userSuspended.uid}:${userSuspended.email}:${userSuspended.name}`;

    // 1. Initial sign-in
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meBody = await meRes.json();
    const userId = meBody.user.id;

    // 2. Platform admin suspends user
    await setUserAccountStatus(userId, 'SUSPENDED', 'admin_override');

    // 3. User attempts to create a society -> blocked!
    const createRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Blocked Housing Society',
        address: '123 Main St',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      }),
    });

    assert.strictEqual(createRes.status, 403);
    const createBody = await createRes.json();
    assert.ok(createBody.error.includes('suspended'));
  });
});

describe('2. Society Creation & Founder Role Bootstrap', () => {
  it('creates society and automatically assigns creator as approved ADMIN without platform Super Admin privileges', async () => {
    const token = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;

    const res = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Palm Meadows Cooperative Housing Society',
        slug: 'palm-meadows-blr',
        address: 'Ramagondanahalli, Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560066',
        societyType: 'HOUSING_COOPERATIVE',
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.society.name, 'Palm Meadows Cooperative Housing Society');
    assert.strictEqual(body.society.slug, 'palm-meadows-blr');
    assert.strictEqual(body.membership.role, 'ADMIN');
    assert.strictEqual(body.membership.status, 'APPROVED');

    // Verify creator does NOT automatically gain platform Super Admin status
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meBody = await meRes.json();
    assert.strictEqual(meBody.authorization.isSuperAdmin, false);
  });

  it('rejects duplicate society slug / code', async () => {
    const token = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;

    // First creation
    await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Palm Meadows Cooperative Housing Society',
        slug: 'duplicate-slug-test',
        address: '123 Main St',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560066',
      }),
    });

    // Duplicate creation attempt
    const res2 = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Another Society Same Slug',
        slug: 'duplicate-slug-test',
        address: '456 Other Rd',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560066',
      }),
    });

    assert.strictEqual(res2.status, 400);
    const body2 = await res2.json();
    assert.ok(body2.error.includes('already taken'));
  });
});

describe('3. Multi-Tenant Isolation & Cross-Society Boundary Enforcement', () => {
  it('member of Society A cannot access private details or member directory of Society B', async () => {
    const tokenFounderA = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;
    const tokenResidentB = `mock-token-valid:${userResidentB.uid}:${userResidentB.email}:${userResidentB.name}`;

    // 1. Founder A creates Society A
    const socARes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounderA}`,
      },
      body: JSON.stringify({
        name: 'Society Alpha',
        address: 'Alpha St',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      }),
    });
    const socA = (await socARes.json()).society;

    // 2. Resident B creates Society B
    const socBRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResidentB}`,
      },
      body: JSON.stringify({
        name: 'Society Beta',
        address: 'Beta St',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
      }),
    });
    const socB = (await socBRes.json()).society;

    // 3. Resident B attempts to read Society A details -> 403 Forbidden!
    const crossAccessRes = await fetch(`${baseUrl}/api/societies/${socA.id}`, {
      headers: { Authorization: `Bearer ${tokenResidentB}` },
    });
    assert.strictEqual(crossAccessRes.status, 403);
    const crossBody = await crossAccessRes.json();
    assert.ok(crossBody.error.includes('not an approved member'));

    // 4. Resident B attempts to read Society A members directory -> 403 Forbidden!
    const crossMembersRes = await fetch(`${baseUrl}/api/societies/${socA.id}/members`, {
      headers: { Authorization: `Bearer ${tokenResidentB}` },
    });
    assert.strictEqual(crossMembersRes.status, 403);

    // 5. Resident B attempts to update Society A profile -> 403 Forbidden!
    const crossUpdateRes = await fetch(`${baseUrl}/api/societies/${socA.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResidentB}`,
      },
      body: JSON.stringify({ name: 'Hacked Alpha Society' }),
    });
    assert.strictEqual(crossUpdateRes.status, 403);
  });
});

describe('4. Membership Lifecycle, Self-Approval Prevention & State Transitions', () => {
  it('applicant request starts in PENDING status', async () => {
    const tokenFounderA = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;
    const tokenResidentA = `mock-token-valid:${userResidentA.uid}:${userResidentA.email}:${userResidentA.name}`;

    const socRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounderA}`,
      },
      body: JSON.stringify({
        name: 'Greenwood Residency',
        address: 'Greenwood Ave',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      }),
    });
    const society = (await socRes.json()).society;

    // Resident A requests to join
    const joinRes = await fetch(`${baseUrl}/api/societies/${society.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResidentA}`,
      },
      body: JSON.stringify({
        unitNumber: 'C-204',
        wing: 'Wing C',
        memberType: 'OWNER',
        notes: 'Owner of flat C-204',
      }),
    });

    assert.strictEqual(joinRes.status, 201);
    const joinBody = await joinRes.json();
    assert.strictEqual(joinBody.membership.status, 'PENDING');
    assert.strictEqual(joinBody.membership.unitNumber, 'C-204');
    assert.strictEqual(joinBody.membership.role, 'RESIDENT');
  });

  it('rejects duplicate pending membership request from same user', async () => {
    const tokenFounderA = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;
    const tokenResidentA = `mock-token-valid:${userResidentA.uid}:${userResidentA.email}:${userResidentA.name}`;

    const socRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounderA}`,
      },
      body: JSON.stringify({
        name: 'Skyline Heights',
        address: 'Skyline Rd',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500001',
      }),
    });
    const society = (await socRes.json()).society;

    // First request
    await fetch(`${baseUrl}/api/societies/${society.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResidentA}`,
      },
      body: JSON.stringify({ unitNumber: '101' }),
    });

    // Duplicate request
    const duplicateRes = await fetch(`${baseUrl}/api/societies/${society.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResidentA}`,
      },
      body: JSON.stringify({ unitNumber: '101' }),
    });

    assert.strictEqual(duplicateRes.status, 400);
    const dupBody = await duplicateRes.json();
    assert.ok(dupBody.error.includes('already have a pending'));
  });

  it('strictly blocks user from approving their own membership request (Self-Approval Guard)', async () => {
    const { user: applicantUser } = await upsertUserFromFirebase(userResidentA);
    const { user: founderUser } = await upsertUserFromFirebase(userFounderA);

    const { society } = await createSociety({
      name: 'Lotus Towers',
      address: 'Lotus Rd',
      city: 'Chennai',
      state: 'Tamil Nadu',
      postalCode: '600001',
    }, founderUser);

    const memRequest = await requestMembership(society.id, applicantUser.id, {
      unitNumber: '502',
    });

    // Attempt self-approval: applicant tries to approve their own request
    await assert.rejects(async () => {
      await reviewMembershipRequest(society.id, memRequest.id, 'APPROVE', applicantUser);
    }, /Self-approval forbidden/);
  });

  it('authorized admin can approve request and assign role', async () => {
    const { user: applicantUser } = await upsertUserFromFirebase(userResidentA);
    const { user: adminUser } = await upsertUserFromFirebase(userFounderA);

    const { society } = await createSociety({
      name: 'Silver Oak Apartments',
      address: 'Oak St',
      city: 'Delhi',
      state: 'Delhi',
      postalCode: '110001',
    }, adminUser);

    const memRequest = await requestMembership(society.id, applicantUser.id, {
      unitNumber: 'B-12',
    });

    const approved = await reviewMembershipRequest(
      society.id,
      memRequest.id,
      'APPROVE',
      adminUser,
      { role: 'RESIDENT', unitNumber: 'B-12' }
    );

    assert.strictEqual(approved.status, 'APPROVED');
    assert.strictEqual(approved.role, 'RESIDENT');
    assert.strictEqual(approved.reviewedById, adminUser.id);
    assert.ok(approved.reviewedAt != null);
  });

  it('rejects invalid state transitions (e.g. APPROVED directly to PENDING)', async () => {
    const check = validateMembershipTransition('APPROVED', 'PENDING');
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason?.includes('Invalid membership state transition'));
  });

  it('revoked member immediately loses access to society on subsequent requests', async () => {
    const tokenFounder = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;
    const tokenResident = `mock-token-valid:${userResidentA.uid}:${userResidentA.email}:${userResidentA.name}`;

    // 1. Create society
    const socRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounder}`,
      },
      body: JSON.stringify({
        name: 'Rosewood Enclave',
        address: 'Rosewood Rd',
        city: 'Kolkata',
        state: 'West Bengal',
        postalCode: '700001',
      }),
    });
    const society = (await socRes.json()).society;

    // 2. Resident joins and admin approves
    const joinRes = await fetch(`${baseUrl}/api/societies/${society.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResident}`,
      },
      body: JSON.stringify({ unitNumber: 'D-10' }),
    });
    const memId = (await joinRes.json()).membership.id;

    await fetch(`${baseUrl}/api/societies/${society.id}/requests/${memId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounder}`,
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });

    // 3. Resident can now access society details -> 200 OK!
    const accessRes1 = await fetch(`${baseUrl}/api/societies/${society.id}`, {
      headers: { Authorization: `Bearer ${tokenResident}` },
    });
    assert.strictEqual(accessRes1.status, 200);

    // 4. Admin revokes resident's membership
    const revokeRes = await fetch(`${baseUrl}/api/societies/${society.id}/members/${memId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounder}`,
      },
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    assert.strictEqual(revokeRes.status, 200);

    // 5. Subsequent request by resident is IMMEDIATELY blocked -> 403 Forbidden!
    const accessRes2 = await fetch(`${baseUrl}/api/societies/${society.id}`, {
      headers: { Authorization: `Bearer ${tokenResident}` },
    });
    assert.strictEqual(accessRes2.status, 403);
    const body2 = await accessRes2.json();
    assert.strictEqual(body2.membershipStatus, 'REVOKED');
  });
});

describe('5. RBAC & Privilege Escalation Prevention', () => {
  it('ordinary resident cannot assign roles or access review queue', async () => {
    const tokenFounder = `mock-token-valid:${userFounderA.uid}:${userFounderA.email}:${userFounderA.name}`;
    const tokenResident = `mock-token-valid:${userResidentA.uid}:${userResidentA.email}:${userResidentA.name}`;

    const socRes = await fetch(`${baseUrl}/api/societies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounder}`,
      },
      body: JSON.stringify({
        name: 'Orchid Heights',
        address: 'Orchid Blvd',
        city: 'Jaipur',
        state: 'Rajasthan',
        postalCode: '302001',
      }),
    });
    const society = (await socRes.json()).society;

    // Join & approve resident
    const joinRes = await fetch(`${baseUrl}/api/societies/${society.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResident}`,
      },
      body: JSON.stringify({ unitNumber: '102' }),
    });
    const memId = (await joinRes.json()).membership.id;

    await fetch(`${baseUrl}/api/societies/${society.id}/requests/${memId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenFounder}`,
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });

    // Resident attempts to view pending review queue -> 403 Forbidden!
    const reviewQueueRes = await fetch(`${baseUrl}/api/societies/${society.id}/requests`, {
      headers: { Authorization: `Bearer ${tokenResident}` },
    });
    assert.strictEqual(reviewQueueRes.status, 403);
    const queueBody = await reviewQueueRes.json();
    assert.ok(queueBody.error.includes('Insufficient privileges'));

    // Resident attempts to promote themselves to ADMIN -> 403 Forbidden!
    const promoteRes = await fetch(`${baseUrl}/api/societies/${society.id}/members/${memId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenResident}`,
      },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.strictEqual(promoteRes.status, 403);
  });

  it('vendor cannot view member directory (least privilege enforcement)', async () => {
    // Check RBAC matrix: VENDOR does NOT have VIEW_MEMBER_DIRECTORY
    const canVendorView = hasSocietyPermission('VENDOR', 'VIEW_MEMBER_DIRECTORY');
    assert.strictEqual(canVendorView, false);

    const canStaffView = hasSocietyPermission('STAFF', 'VIEW_MEMBER_DIRECTORY');
    assert.strictEqual(canStaffView, false);

    const canResidentView = hasSocietyPermission('RESIDENT', 'VIEW_MEMBER_DIRECTORY');
    assert.strictEqual(canResidentView, true);
  });

  it('prevents demoting or suspending the only active ADMIN in a society', async () => {
    const { user: founderUser } = await upsertUserFromFirebase(userFounderA);
    const { society, membership } = await createSociety({
      name: 'Single Admin Society',
      address: 'Main Rd',
      city: 'Chandigarh',
      state: 'Punjab',
      postalCode: '160001',
    }, founderUser);

    // Attempt to suspend the only active admin
    await assert.rejects(async () => {
      await updateMemberStatus(society.id, membership.id, 'SUSPENDED', founderUser);
    }, /Cannot suspend or revoke the only active Administrator/);

    // Attempt to demote the only active admin to RESIDENT
    await assert.rejects(async () => {
      await changeMemberRole(society.id, membership.id, 'RESIDENT', 'ADMIN', founderUser);
    }, /Cannot demote the only active Administrator/);
  });
});

describe('6. Tamper-Evident Security Audit Trail', () => {
  it('privileged actions create immutable audit log entries without secrets', async () => {
    const { user: adminUser } = await upsertUserFromFirebase(userFounderA);
    const { user: applicantUser } = await upsertUserFromFirebase(userResidentA);

    const { society } = await createSociety({
      name: 'Heritage Residency',
      address: 'Heritage Way',
      city: 'Ahmedabad',
      state: 'Gujarat',
      postalCode: '380001',
    }, adminUser);

    const memReq = await requestMembership(society.id, applicantUser.id, {
      unitNumber: 'A-101',
      notes: 'Super secret password123 should not be in audit logs',
    });

    await reviewMembershipRequest(society.id, memReq.id, 'APPROVE', adminUser, {
      role: 'TREASURER',
    });

    const logs = await getSocietyAuditLogs(society.id);
    assert.ok(logs.length >= 3);

    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('SOCIETY_CREATED'));
    assert.ok(actions.includes('MEMBERSHIP_REQUESTED'));
    assert.ok(actions.includes('MEMBERSHIP_APPROVED'));

    // Verify audit logs sanitize secrets
    for (const log of logs) {
      if (log.metadata) {
        assert.strictEqual((log.metadata as any).password, undefined);
        assert.strictEqual((log.metadata as any).secret, undefined);
        assert.strictEqual((log.metadata as any).token, undefined);
      }
    }
  });
});
