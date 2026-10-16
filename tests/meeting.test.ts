/**
 * SocietyFix AI — Milestone M5 Meeting Capture & Minutes of Meeting (MoM) Test Suite
 * Validates:
 * 1. Meeting domain creation, agenda ordering, and attendance tracking
 * 2. Strict multi-tenant isolation (Society B cannot view or tamper with Society A meetings)
 * 3. Meeting lifecycle state machine enforcement (Invalid transitions rejected)
 * 4. Provenance tracking with SHA-256 content hashing for source notes
 * 5. AI draft generation safety (AI outputs are strictly drafts, never auto-approved)
 * 6. Proposed actions and decisions boundary (No automated M6 task creation)
 * 7. RBAC and human approval workflow (Only Secretary/Chairman/Admin can approve)
 * 8. Society Memory publication idempotency (Approved minutes published without duplication)
 * 9. REST API security, validation, and error handling
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../server.ts';
import { meetingService, computeContentHash } from '../src/society/meetingService.ts';
import { societyMemoryService } from '../src/ai/societyMemoryService.ts';
import { createSociety, requestMembership, reviewMembershipRequest } from '../src/society/societyService.ts';
import { upsertUserFromFirebase } from '../src/auth/userService.ts';
import { validateMeetingTransition } from '../src/society/societyRbac.ts';

let server: http.Server;
let baseUrl: string;

const adminUserA = {
  uid: 'mtg_admin_a',
  email: 'secretary.a@societyfix.test',
  name: 'Secretary Priya',
};

const residentUserA = {
  uid: 'mtg_resident_a',
  email: 'resident.a@societyfix.test',
  name: 'Vikas Resident A',
};

const adminUserB = {
  uid: 'mtg_admin_b',
  email: 'secretary.b@societyfix.test',
  name: 'Secretary Vikram B',
};

let societyAId: string;
let societyBId: string;
let meetingAId: string;
let revisionAId: string;

before(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Provision users
  const { user: userAdminA } = await upsertUserFromFirebase(adminUserA);
  const { user: userResA } = await upsertUserFromFirebase(residentUserA);
  const { user: userAdminB } = await upsertUserFromFirebase(adminUserB);

  // Create Society A
  const { society: socA } = await createSociety(
    {
      name: 'Gulmohar Heights Co-op Society',
      slug: 'gulmohar-m5',
      address: 'Plot 12, Baner Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411045',
    },
    userAdminA
  );
  societyAId = socA.id;

  // Create Society B
  const { society: socB } = await createSociety(
    {
      name: 'Orchid Greens Society',
      slug: 'orchid-m5',
      address: 'Sector 4, Vashi',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      postalCode: '400703',
    },
    userAdminB
  );
  societyBId = socB.id;

  // Approve resident A into Society A
  const memReq = await requestMembership(societyAId, userResA.id, {
    unitNumber: 'B-304',
    memberType: 'OWNER',
  });
  await reviewMembershipRequest(societyAId, memReq.id, 'APPROVE', userAdminA, {
    role: 'RESIDENT',
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('Milestone M5: Meeting Management & Minutes of Meeting', () => {
  it('1. Creates a society meeting with ordered agenda and expected attendees', async () => {
    const meeting = await meetingService.createMeeting(
      societyAId,
      {
        title: 'Managing Committee Monthly Meeting (October 2026)',
        description: 'Review of audited society finances, lift AMC contracts, and water tank cleaning.',
        meetingType: 'MANAGING_COMMITTEE',
        scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
        scheduledEndTime: new Date(Date.now() + 90000000).toISOString(),
        timezone: 'Asia/Kolkata',
        location: 'Society Office, Clubhouse 1st Floor',
        isVirtual: false,
        initialAgenda: [
          { title: 'Confirm previous meeting minutes', description: 'Review open actions' },
          { title: 'Lift Modernization Vendor Bids', description: 'Evaluate Otis vs Schindler quotes' },
          { title: 'Rooftop Solar Net-Metering Status' },
        ],
        initialAttendees: [
          { name: 'Secretary Priya', roleOrTitle: 'HON_SECRETARY', attendanceStatus: 'EXPECTED' },
          { name: 'Vikas Resident A', roleOrTitle: 'RESIDENT', attendanceStatus: 'EXPECTED' },
        ],
      },
      'actor-admin-a'
    );

    assert.ok(meeting);
    assert.strictEqual(meeting.societyId, societyAId);
    assert.strictEqual(meeting.title, 'Managing Committee Monthly Meeting (October 2026)');
    assert.strictEqual(meeting.status, 'SCHEDULED');
    assert.strictEqual(meeting.agenda.length, 3);
    assert.strictEqual(meeting.agenda[0]?.orderIndex, 0);
    assert.strictEqual(meeting.attendees.length, 2);

    meetingAId = meeting.id;
  });

  it('2. Enforces meeting lifecycle state machine and blocks invalid transitions', async () => {
    // Valid transitions
    assert.strictEqual(validateMeetingTransition('SCHEDULED', 'IN_PROGRESS').valid, true);
    assert.strictEqual(validateMeetingTransition('IN_PROGRESS', 'MINUTES_DRAFT').valid, true);
    assert.strictEqual(validateMeetingTransition('MINUTES_DRAFT', 'UNDER_REVIEW').valid, true);
    assert.strictEqual(validateMeetingTransition('UNDER_REVIEW', 'APPROVED').valid, true);
    assert.strictEqual(validateMeetingTransition('APPROVED', 'ARCHIVED').valid, true);

    // Invalid transitions
    assert.strictEqual(validateMeetingTransition('SCHEDULED', 'APPROVED').valid, false);
    assert.strictEqual(validateMeetingTransition('IN_PROGRESS', 'APPROVED').valid, false);
    assert.strictEqual(validateMeetingTransition('ARCHIVED', 'IN_PROGRESS').valid, false);
    assert.strictEqual(validateMeetingTransition('CANCELLED', 'SCHEDULED').valid, false);

    // Direct transition to APPROVED via updateMeetingStatus must throw an error
    await assert.rejects(
      async () => {
        await meetingService.updateMeetingStatus(societyAId, meetingAId, 'APPROVED', 'actor-admin-a');
      },
      {
        message: /Cannot set status to APPROVED directly/,
      }
    );
  });

  it('3. Records source notes with SHA-256 cryptographic provenance hash', async () => {
    const rawText = `Meeting commenced at 6:30 PM.
Agenda Item 1: Previous minutes confirmed without changes.
Agenda Item 2: Lift Maintenance — Discussed vendor quote of INR 4,50,000 from Otis. Committee unanimously approved awarding AMC to Otis.
Agenda Item 3: Water Tank Cleaning — Agreed to schedule cleaning on 25th Oct. Estate Manager to notify all wings 3 days in advance.
Resolved: Approved INR 4,50,000 for Lift AMC.`;

    const expectedHash = computeContentHash(rawText);

    const source = await meetingService.addSourceNote(
      societyAId,
      meetingAId,
      {
        title: 'Secretary Handwritten Notes & Discussion Log',
        rawContent: rawText,
        sourceType: 'TEXT_NOTES',
      },
      'actor-admin-a'
    );

    assert.ok(source);
    assert.strictEqual(source.meetingId, meetingAId);
    assert.strictEqual(source.contentHash, expectedHash);

    // Adding source should advance meeting status from SCHEDULED to MINUTES_DRAFT
    const updatedMtg = await meetingService.getMeetingDetails(societyAId, meetingAId);
    assert.strictEqual(updatedMtg?.status, 'MINUTES_DRAFT');
  });

  it('4. AI-assisted draft generation creates versioned DRAFT without auto-approval', async () => {
    const result = await meetingService.generateMeetingDraftMinutes(societyAId, meetingAId, 'actor-admin-a');

    assert.ok(result);
    assert.ok(result.revision);
    // AI output must ALWAYS be a draft
    assert.strictEqual(result.revision.status, 'DRAFT');
    assert.strictEqual(result.revision.isAiGenerated, true);
    assert.strictEqual(result.revision.revisionNumber, 1);
    assert.ok(result.revision.executiveSummary.length > 10);

    // Proposed actions must have status 'PROPOSED' and not be marked executed/committed
    assert.ok(result.proposedActions.length > 0);
    for (const act of result.proposedActions) {
      assert.strictEqual(act.status, 'PROPOSED');
      assert.ok((act.suggestedDeadlineDays ?? 0) > 0);
    }

    // Proposed resolutions must have reviewStatus 'PROPOSED'
    assert.ok(result.proposedDecisions.length > 0);
    for (const dec of result.proposedDecisions) {
      assert.strictEqual(dec.reviewStatus, 'PROPOSED');
    }

    revisionAId = result.revision.id;

    // Meeting status must remain unapproved
    const meeting = await meetingService.getMeetingDetails(societyAId, meetingAId);
    assert.notStrictEqual(meeting?.status, 'APPROVED');
  });

  it('5. Allows human reviewer to update draft and submit for committee review', async () => {
    // Human edits executive summary
    const edited = await meetingService.updateDraftRevision(
      societyAId,
      meetingAId,
      revisionAId,
      {
        executiveSummary: 'Executive summary verified by Hon. Secretary. Approved Otis Lift AMC.',
      },
      'actor-admin-a'
    );
    assert.strictEqual(edited.executiveSummary, 'Executive summary verified by Hon. Secretary. Approved Otis Lift AMC.');

    // Submit for review
    const submitted = await meetingService.submitMinutesForReview(
      societyAId,
      meetingAId,
      revisionAId,
      'Submitted for Managing Committee sign-off.',
      'actor-admin-a'
    );
    assert.strictEqual(submitted.status, 'SUBMITTED_FOR_REVIEW');

    const mtg = await meetingService.getMeetingDetails(societyAId, meetingAId);
    assert.strictEqual(mtg?.status, 'UNDER_REVIEW');
  });

  it('6. RBAC: Ordinary resident cannot approve official meeting minutes', async () => {
    await assert.rejects(
      async () => {
        await meetingService.approveMinutesRevision(
          societyAId,
          meetingAId,
          revisionAId,
          'Unauthorized approval attempt',
          { id: 'resident-a-id', role: 'RESIDENT', isSuperAdmin: false }
        );
      },
      {
        message: /Only Society Admin .* or Chairman possess statutory authority/,
      }
    );
  });

  it('7. Formally approves minutes revision and publishes approved record to Society Memory', async () => {
    const approvalResult = await meetingService.approveMinutesRevision(
      societyAId,
      meetingAId,
      revisionAId,
      'Unanimously approved at the Managing Committee Meeting on 16 Oct 2026.',
      { id: 'admin-a-id', role: 'ADMIN', isSuperAdmin: false }
    );

    assert.ok(approvalResult);
    assert.strictEqual(approvalResult.meeting.status, 'APPROVED');
    assert.strictEqual(approvalResult.revision.status, 'APPROVED');
    assert.strictEqual(approvalResult.meeting.approvedRevisionId, revisionAId);
    assert.ok(approvalResult.memoryItemId);
    assert.strictEqual(approvalResult.meeting.publishedToMemoryId, approvalResult.memoryItemId);

    // Verify retrieval from Society Memory
    const memoryItem = await societyMemoryService.listMemoryItems(societyAId, {
      category: 'MEETING_MINUTES',
    });
    assert.ok(memoryItem.length > 0);
    const published = memoryItem.find((m) => m.id === approvalResult.memoryItemId);
    assert.ok(published);
    assert.ok(published.title.includes('Approved Minutes:'));
    assert.ok(published.sourceReference?.includes(meetingAId));
  });

  it('8. Idempotency: Duplicate publication to Society Memory returns existing reference', async () => {
    const republish = await meetingService.publishApprovedMinutesToMemory(
      societyAId,
      meetingAId,
      'admin-a-id'
    );

    assert.ok(republish);
    assert.strictEqual(republish.alreadyPublished, true);
    assert.ok(republish.memoryItemId);
  });

  it('9. Cannot re-approve an already approved revision or a superseded revision', async () => {
    await assert.rejects(
      async () => {
        await meetingService.approveMinutesRevision(
          societyAId,
          meetingAId,
          revisionAId,
          'Re-approve attempt',
          { id: 'admin-a-id', role: 'ADMIN', isSuperAdmin: false }
        );
      },
      {
        message: /already been approved/,
      }
    );
  });

  it('10. REST API: GET /api/societies/:societyId/meetings lists meetings for tenant member', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings`, {
      headers: {
        Authorization: `Bearer mock-token-valid:${residentUserA.uid}:${residentUserA.email}:${residentUserA.name}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.meetings));
    assert.ok(data.meetings.length >= 1);
    assert.strictEqual(data.meetings[0]?.societyId, societyAId);
  });

  it('11. REST API: Multi-tenant isolation blocks Society B user from Society A meetings (403)', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings`, {
      headers: {
        Authorization: `Bearer mock-token-valid:${adminUserB.uid}:${adminUserB.email}:${adminUserB.name}`,
      },
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('membership'));
  });

  it('12. REST API: Multi-tenant isolation blocks Society B user from getting Society A meeting details (403)', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings/${meetingAId}`, {
      headers: {
        Authorization: `Bearer mock-token-valid:${adminUserB.uid}:${adminUserB.email}:${adminUserB.name}`,
      },
    });

    assert.strictEqual(res.status, 403);
  });

  it('13. REST API: Ordinary resident cannot schedule meetings (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-valid:${residentUserA.uid}:${residentUserA.email}:${residentUserA.name}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Resident Meeting',
        scheduledStartTime: new Date().toISOString(),
      }),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('permission'));
  });

  it('14. REST API: Audio signed URL validates audio mime-type and enforces tenant scoping', async () => {
    // Invalid mime type
    const invalidRes = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings/${meetingAId}/audio/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-valid:${adminUserA.uid}:${adminUserA.email}:${adminUserA.name}`,
      },
      body: JSON.stringify({
        fileName: 'malicious.exe',
        contentType: 'application/x-msdownload',
      }),
    });
    assert.strictEqual(invalidRes.status, 400);

    // Valid audio mime type
    const validRes = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings/${meetingAId}/audio/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-valid:${adminUserA.uid}:${adminUserA.email}:${adminUserA.name}`,
      },
      body: JSON.stringify({
        fileName: 'recording.mp3',
        contentType: 'audio/mp3',
      }),
    });
    assert.strictEqual(validRes.status, 200);
    const validData = await validRes.json();
    assert.ok(validData.signedUrl);
    assert.ok(validData.objectPath.includes(`societies/${societyAId}/meetings/`));
  });

  it('15. REST API: Unauthenticated requests are rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/meetings`);
    assert.strictEqual(res.status, 401);
  });
});
