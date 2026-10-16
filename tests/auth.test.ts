import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../server.ts';
import {
  upsertUserFromFirebase,
  findUserByFirebaseUid,
  bootstrapSuperAdmin,
  isPlatformSuperAdmin,
  setUserAccountStatus,
  resetMockStores,
} from '../src/auth/userService.ts';
import { verifyFirebaseIdToken } from '../src/auth/firebaseAdmin.ts';

let server: http.Server;
let baseUrl: string;

before((_, done) => {
  // Start ephemeral server on random available port
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

describe('1. Firebase ID Token Verification Tests', () => {
  it('throws error for missing or empty token', async () => {
    await assert.rejects(async () => {
      await verifyFirebaseIdToken('');
    }, /Token is missing/);
  });

  it('rejects expired mock tokens', async () => {
    await assert.rejects(async () => {
      await verifyFirebaseIdToken('mock-token-expired:u123:user@test.local');
    }, /expired/);
  });

  it('rejects invalid mock tokens', async () => {
    await assert.rejects(async () => {
      await verifyFirebaseIdToken('mock-token-invalid:u123:user@test.local');
    }, /invalid/);
  });

  it('correctly decodes valid mock token claims', async () => {
    const claims = await verifyFirebaseIdToken('mock-token-valid:user_99:resident@societyfix.test:Aarav Sharma');
    assert.strictEqual(claims.uid, 'user_99');
    assert.strictEqual(claims.email, 'resident@societyfix.test');
    assert.strictEqual(claims.name, 'Aarav Sharma');
  });
});

describe('2. User Provisioning & Idempotency Tests', () => {
  before(() => {
    resetMockStores();
  });

  it('provisions new user record on first sign-in', async () => {
    const claims = {
      uid: 'fb_user_1',
      email: 'rahul.verma@example.com',
      name: 'Rahul Verma',
      picture: 'https://example.com/avatar1.jpg',
    };

    const { user, isNewUser } = await upsertUserFromFirebase(claims);
    assert.strictEqual(isNewUser, true);
    assert.strictEqual(user.firebaseUid, 'fb_user_1');
    assert.strictEqual(user.email, 'rahul.verma@example.com');
    assert.strictEqual(user.fullName, 'Rahul Verma');
    assert.strictEqual(user.accountStatus, 'ACTIVE');
  });

  it('safely updates existing user on repeat sign-in without duplicate creation', async () => {
    const claims = {
      uid: 'fb_user_1',
      email: 'rahul.verma@example.com',
      name: 'Rahul Verma (Updated)',
      picture: 'https://example.com/new_avatar.jpg',
    };

    const { user, isNewUser } = await upsertUserFromFirebase(claims);
    assert.strictEqual(isNewUser, false);
    assert.strictEqual(user.firebaseUid, 'fb_user_1');
    assert.strictEqual(user.fullName, 'Rahul Verma (Updated)');
  });

  it('preserves SUSPENDED status during re-authentication', async () => {
    const claims = {
      uid: 'fb_suspended_1',
      email: 'suspended.resident@example.com',
      name: 'Suspended Resident',
    };

    const { user: newUser } = await upsertUserFromFirebase(claims);
    assert.strictEqual(newUser.accountStatus, 'ACTIVE');

    // Manually suspend account
    await setUserAccountStatus(newUser.id, 'SUSPENDED', 'admin_123');

    // User signs in again -> status must remain SUSPENDED
    const { user: reauthenticatedUser } = await upsertUserFromFirebase(claims);
    assert.strictEqual(reauthenticatedUser.accountStatus, 'SUSPENDED');
  });
});

describe('3. Platform Super Admin Authorization & Bootstrap Tests', () => {
  before(() => {
    resetMockStores();
    process.env.SUPER_ADMIN_EMAILS = 'superadmin@societyfix.ai,devdesagar@gmail.com';
    process.env.SUPER_ADMIN_BOOTSTRAP_SECRET = 'correct_bootstrap_secret_123';
  });

  it('recognizes allowlisted email as Super Admin automatically', async () => {
    const claims = {
      uid: 'fb_admin_1',
      email: 'superadmin@societyfix.ai',
      name: 'Central Operator',
    };

    const { user } = await upsertUserFromFirebase(claims);
    const isAdmin = await isPlatformSuperAdmin(user.id, user.email);
    assert.strictEqual(isAdmin, true);
  });

  it('denies Super Admin to standard user by default', async () => {
    const claims = {
      uid: 'fb_regular_1',
      email: 'normal.resident@example.com',
      name: 'Normal Resident',
    };

    const { user } = await upsertUserFromFirebase(claims);
    const isAdmin = await isPlatformSuperAdmin(user.id, user.email);
    assert.strictEqual(isAdmin, false);
  });

  it('rejects bootstrap elevation with invalid secret', async () => {
    const claims = {
      uid: 'fb_hacker_1',
      email: 'hacker@example.com',
      name: 'Unauthorized User',
    };

    const { user } = await upsertUserFromFirebase(claims);
    const result = await bootstrapSuperAdmin(user, 'wrong_secret');
    assert.strictEqual(result.success, false);

    const isAdmin = await isPlatformSuperAdmin(user.id, user.email);
    assert.strictEqual(isAdmin, false);
  });

  it('allows bootstrap elevation with correct secret and is idempotent', async () => {
    const claims = {
      uid: 'fb_bootstrapped_1',
      email: 'operator@example.com',
      name: 'Provisioned Operator',
    };

    const { user } = await upsertUserFromFirebase(claims);
    const result = await bootstrapSuperAdmin(user, 'correct_bootstrap_secret_123');
    assert.strictEqual(result.success, true);

    const isAdmin = await isPlatformSuperAdmin(user.id, user.email);
    assert.strictEqual(isAdmin, true);

    // Repeated call is safe and idempotent
    const repeatResult = await bootstrapSuperAdmin(user, 'correct_bootstrap_secret_123');
    assert.strictEqual(repeatResult.success, true);
  });
});

describe('4. Protected API Endpoints & Access Control', () => {
  it('GET /api/auth/me rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('Missing or invalid Authorization header'));
  });

  it('GET /api/auth/me succeeds with valid Bearer token', async () => {
    const token = 'mock-token-valid:user_test_42:test.resident@societyfix.test:Priya Patel';
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.user.email, 'test.resident@societyfix.test');
    assert.strictEqual(body.user.fullName, 'Priya Patel');
    assert.ok(['M2', 'M3', 'M4'].includes(body.milestone));
  });

  it('GET /api/admin/overview rejects ordinary resident with 403 Forbidden', async () => {
    const regularToken = 'mock-token-valid:reg_user:resident@societyfix.test:Resident User';
    const res = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: {
        Authorization: `Bearer ${regularToken}`,
      },
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.includes('Platform Super Admin privileges required'));
  });

  it('GET /api/admin/overview allows authorized Super Admin', async () => {
    const adminToken = 'mock-token-valid:admin_user:superadmin@societyfix.ai:Platform Admin';
    const res = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.platform.name, 'SocietyFix AI');
    assert.strictEqual(body.platform.milestone, 'M2');
    assert.strictEqual(body.societyAdministration.status, 'M3_PENDING');
  });

  it('blocks suspended account from accessing /api/auth/me with 403', async () => {
    const suspendedToken = 'mock-token-valid:susp_u:suspended@test.com:Suspended User';
    
    // Initial login
    const loginRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    const loginBody = await loginRes.json();
    const userId = loginBody.user.id;

    // Admin suspends user
    const adminToken = 'mock-token-valid:admin_user:superadmin@societyfix.ai:Platform Admin';
    const suspendRes = await fetch(`${baseUrl}/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ accountStatus: 'SUSPENDED' }),
    });
    assert.strictEqual(suspendRes.status, 200);

    // Suspended user tries to access /api/auth/me again -> blocked!
    const blockedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    assert.strictEqual(blockedRes.status, 403);
    const blockedBody = await blockedRes.json();
    assert.strictEqual(blockedBody.accountStatus, 'SUSPENDED');
  });
});
