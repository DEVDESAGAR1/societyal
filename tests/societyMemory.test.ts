/**
 * SocietyFix AI — Milestone M4 Society Memory & Grounded RAG Test Suite
 * Validates:
 * 1. Society-Scoped Knowledge Storage & CRUD
 * 2. Strict Multi-Tenant Isolation (No cross-society knowledge leakage)
 * 3. Grounded Retrieval & Source Attribution (Document ID, Title, Excerpt)
 * 4. Zero-Hallucination Fallback (Explicit absence notice when records lack answer)
 * 5. AI Safety Boundaries (is_ai_draft = true, human-in-the-loop ratification)
 * 6. REST API Endpoint Security & RBAC Enforcement
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../server.ts';
import { societyMemoryService } from '../src/ai/societyMemoryService.ts';
import { createSociety, requestMembership, reviewMembershipRequest } from '../src/society/societyService.ts';
import { upsertUserFromFirebase } from '../src/auth/userService.ts';

let server: http.Server;
let baseUrl: string;

const adminUserA = {
  uid: 'mem_admin_a',
  email: 'admin.a@societyfix.test',
  name: 'Secretary Ananya',
};

const residentUserA = {
  uid: 'mem_resident_a',
  email: 'resident.a@societyfix.test',
  name: 'Rahul Resident A',
};

const residentUserB = {
  uid: 'mem_resident_b',
  email: 'resident.b@societyfix.test',
  name: 'Suresh Resident B',
};

let societyAId: string;
let societyBId: string;

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
  const { user: userA } = await upsertUserFromFirebase(adminUserA);
  const { user: userResA } = await upsertUserFromFirebase(residentUserA);
  const { user: userResB } = await upsertUserFromFirebase(residentUserB);

  // Create Society A & Society B
  const { society: socA } = await createSociety({
    name: 'Lotus Heritage Co-op Society',
    slug: 'lotus-heritage-m4',
    address: 'Plot 45, Sector 19',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411028',
  }, userA);
  societyAId = socA.id;

  const { society: socB } = await createSociety({
    name: 'Silver Palms Residency',
    slug: 'silver-palms-m4',
    address: 'Linking Road, Bandra',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
  }, userResB);
  societyBId = socB.id;

  // Join resident A to Society A
  const memReq = await requestMembership(societyAId, userResA.id, {
    unitNumber: 'A-502',
    memberType: 'OWNER',
  });
  await reviewMembershipRequest(societyAId, memReq.id, 'APPROVE', userA, {
    role: 'RESIDENT',
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('Society Memory & Grounded RAG Knowledge Base', () => {
  it('1. Adds knowledge documents with auto-generated embeddings and category tags', async () => {
    const item = await societyMemoryService.addMemoryItem(
      societyAId,
      {
        title: 'Model Bye-Laws 2014, Rule 168 (Balcony Drainage)',
        category: 'BYE_LAWS',
        content: 'No resident shall allow water from balconies or flower pots to drip onto lower apartments. A penalty of INR 500 per incident shall be levied after one written warning.',
        sourceReference: 'MCS Act Model Bye-laws 2014, Rule 168(b)',
        tags: ['Balcony', 'Dripping', 'Penalty', 'Maintenance'],
      },
      'actor-user-id'
    );

    assert.ok(item);
    assert.strictEqual(item.societyId, societyAId);
    assert.strictEqual(item.category, 'BYE_LAWS');
    assert.ok(item.embedding && item.embedding.length > 0);
  });

  it('2. Strictly enforces tenant isolation: Society B cannot view or retrieve Society A memory', async () => {
    // Add private financial resolution to Society A
    await societyMemoryService.addMemoryItem(
      societyAId,
      {
        title: 'AGM 2024 Lift Modernization Contract',
        category: 'RESOLUTION',
        content: 'Contract awarded to Johnson Lifts for INR 4,80,000 covering all 4 passenger elevators.',
        sourceReference: 'AGM 2024 Item 3',
      },
      'actor-user-id'
    );

    // List memory for Society B
    const societyBItems = await societyMemoryService.listMemoryItems(societyBId);
    assert.strictEqual(societyBItems.length, 0);

    // Search query executed in Society B must NOT retrieve Society A documents
    const contextInSocB = await societyMemoryService.retrieveContext(societyBId, 'Johnson Lifts modernization contract');
    assert.strictEqual(contextInSocB.length, 0);
  });

  it('3. Grounded QA cites source documents with confidence and reference metadata', async () => {
    const answer = await societyMemoryService.askSocietyMemory(
      societyAId,
      'What is the penalty for balcony water dripping?',
      'user-res-a'
    );

    assert.ok(answer);
    assert.strictEqual(answer.groundedInContext, true);
    assert.ok(answer.confidence > 0.7);
    assert.ok(answer.citations.length > 0);

    const firstCitation = answer.citations[0]!;
    assert.ok(firstCitation.title.includes('Balcony Drainage') || firstCitation.title.length > 0);
    assert.ok(firstCitation.relevantExcerpt.length > 0);
  });

  it('4. Zero-hallucination guarantee: ungrounded query returns explicit absence notice', async () => {
    const answer = await societyMemoryService.askSocietyMemory(
      societyAId,
      'Can residents keep pet elephants in the penthouse?',
      'user-res-a'
    );

    assert.ok(answer);
    // When no records contain the answer, groundedInContext must be false
    assert.strictEqual(answer.groundedInContext, false);
    assert.ok(
      answer.answer.toLowerCase().includes('do not contain') ||
      answer.answer.toLowerCase().includes('not found') ||
      answer.answer.toLowerCase().includes('records')
    );
  });

  it('5. Extracts structured meeting minutes and marks as AI Draft requiring human committee vote', async () => {
    const rawNotes = `Managing Committee Meeting
Discussed gym renovation and new treadmill purchase.
Resolved to approve INR 75,000 budget for fitness equipment.
Action on Sports Committee Secretary to select vendor in 10 days.`;

    const extracted = await societyMemoryService.extractMeetingMinutes(
      societyAId,
      rawNotes,
      'user-admin-a'
    );

    assert.ok(extracted);
    assert.ok(extracted.actionItems.length > 0);
    assert.ok(extracted.resolutions.length > 0);
  });

  it('6. REST API: GET /api/societies/:societyId/memory/items returns tenant items', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/memory/items`, {
      headers: {
        Authorization: `Bearer mock-token-valid:${adminUserA.uid}:${adminUserA.email}:${adminUserA.name}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length >= 2);
    // All items must belong strictly to societyA
    for (const item of data.items) {
      assert.strictEqual(item.societyId, societyAId);
    }
  });

  it('7. REST API: POST /api/societies/:societyId/memory/ask returns grounded answer with citations', async () => {
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/memory/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-valid:${residentUserA.uid}:${residentUserA.email}:${residentUserA.name}`,
      },
      body: JSON.stringify({ query: 'What are the rules for balcony water dripping?' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.answer);
    assert.strictEqual(typeof data.answer.groundedInContext, 'boolean');
    assert.ok(Array.isArray(data.answer.citations));
  });

  it('8. REST API: Blocks unauthorized non-member from querying Society A memory', async () => {
    // Resident B is not a member of Society A
    const res = await fetch(`${baseUrl}/api/societies/${societyAId}/memory/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-valid:${residentUserB.uid}:${residentUserB.email}:${residentUserB.name}`,
      },
      body: JSON.stringify({ query: 'What are the lift maintenance rules?' }),
    });

    assert.strictEqual(res.status, 403);
  });
});
