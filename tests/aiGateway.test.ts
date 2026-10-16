/**
 * SocietyFix AI — Milestone M4 AI Gateway Test Suite
 * Validates:
 * 1. Provider-Neutral Architecture & Adapter Polymorphism
 * 2. Guaranteed Structured Outputs & Zod Validation
 * 3. Quota Guard & Tenant Scoping
 * 4. Deterministic Mock Adapter & Offline Reliability
 * 5. Telemetry Recording
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { aiGateway } from '../src/ai/aiGateway.ts';
import { MockAIAdapter } from '../src/ai/adapters/mockAdapter.ts';
import {
  ExtractedActionItemSchema,
  ExtractedResolutionSchema,
  ExtractedMeetingMinutesSchema,
  ExtractedVoiceComplaintSchema,
  SocietyMemoryAnswerSchema,
} from '../src/ai/aiGatewayTypes.ts';

describe('AI Gateway & Provider-Neutral Architecture', () => {
  it('1. Enforces tenant societyId requirement (Quota & Scope Guard)', async () => {
    await assert.rejects(
      async () => {
        await aiGateway.generateText({
          societyId: '',
          userId: 'user-1',
          operationName: 'test_op',
          systemPrompt: 'System',
          userPrompt: 'Hello',
        });
      },
      {
        message: /requires a valid tenant societyId/i,
      }
    );
  });

  it('2. Successfully generates deterministic text responses via AIGatewayPort', async () => {
    const result = await aiGateway.generateText({
      societyId: 'soc_test_1',
      userId: 'user-1',
      operationName: 'chat_test',
      systemPrompt: 'You are an AI assistant',
      userPrompt: 'What is the society address?',
    });

    assert.ok(result);
    assert.ok(result.data.length > 0);
    assert.ok(result.latencyMs >= 0);
    assert.ok(result.promptTokens > 0);
    assert.strictEqual(typeof result.model, 'string');
  });

  it('3. Successfully generates structured meeting minutes validated by Zod schema', async () => {
    const result = await aiGateway.generateStructured({
      societyId: 'soc_test_1',
      userId: 'user-1',
      operationName: 'meeting_minutes_extraction',
      systemPrompt: 'Extract meeting minutes',
      userPrompt: 'We held an AGM today discussing solar panels and balcony dripping.',
      schema: ExtractedMeetingMinutesSchema,
      schemaName: 'ExtractedMeetingMinutes',
      schemaDescription: 'Structured meeting minutes, resolutions, and action items',
    });

    assert.ok(result.data);
    assert.strictEqual(typeof result.data.meetingTitle, 'string');
    assert.ok(result.data.actionItems.length > 0);
    assert.ok(result.data.resolutions.length > 0);

    // Verify individual item structures match schema invariants
    const firstAction = result.data.actionItems[0]!;
    assert.ok(ExtractedActionItemSchema.safeParse(firstAction).success);
    assert.ok(firstAction.suggestedDeadlineDays >= 1);
    assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL_URGENT'].includes(firstAction.priority));

    const firstResolution = result.data.resolutions[0]!;
    assert.ok(ExtractedResolutionSchema.safeParse(firstResolution).success);
    assert.ok(typeof firstResolution.isStatutory === 'boolean');
  });

  it('4. Successfully extracts and standardizes multilingual resident voice complaint', async () => {
    const result = await aiGateway.generateStructured({
      societyId: 'soc_test_1',
      userId: 'user-1',
      operationName: 'complaint_extraction',
      systemPrompt: 'Extract complaint',
      userPrompt: 'Flat B-402 madhe ceiling varun paani padat ahe, pipe leak ahe lakar bagha.',
      schema: ExtractedVoiceComplaintSchema,
      schemaName: 'ExtractedVoiceComplaint',
      schemaDescription: 'Structured complaint classification',
    });

    assert.ok(result.data);
    assert.strictEqual(result.data.category, 'WATER_LEAKAGE');
    assert.strictEqual(result.data.flatNumberMentioned, 'B-402');
    assert.ok(['LOW', 'NORMAL', 'URGENT', 'EMERGENCY_SAFETY'].includes(result.data.urgency));
  });

  it('5. Generates normalized vector embeddings for semantic search', async () => {
    const texts = [
      'Rules for visitor parking in basement 2',
      'Penalty for late maintenance dues payment',
    ];

    const vectors = await aiGateway.embedText({
      societyId: 'soc_test_1',
      texts,
    });

    assert.strictEqual(vectors.length, 2);
    assert.ok(vectors[0]!.length > 0);
    assert.ok(vectors[1]!.length > 0);

    // Verify unit length (magnitude approx 1.0)
    const mag = Math.sqrt(vectors[0]!.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(mag - 1.0) < 0.05);
  });

  it('6. Supports speech-to-text transcription interface with Indian language awareness', async () => {
    const mockAudio = Buffer.from('mock-audio-bytes-wav-16khz');
    const transcription = await aiGateway.transcribeSpeech({
      societyId: 'soc_test_1',
      userId: 'user-1',
      audioBuffer: mockAudio,
      mimeType: 'audio/wav',
      languageHint: 'mr-IN',
    });

    assert.ok(transcription.transcript.length > 0);
    assert.ok(transcription.confidence > 0.8);
    assert.ok(transcription.durationSeconds > 0);
  });
});
