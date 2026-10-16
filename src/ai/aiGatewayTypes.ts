/**
 * SocietyFix AI — Provider-Neutral AI Gateway Interfaces & Schemas
 * Adheres strictly to AI_GATEWAY_DESIGN.md (Document ID: AI-001)
 */

import { z } from 'zod';

export interface PromptContext {
  societyId: string;
  userId: string;
  operationName: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface TextGenerationRequest extends PromptContext {
  systemPrompt: string;
  userPrompt: string;
  retrievedContext?: string[];
}

export interface StructuredGenerationRequest<T> extends PromptContext {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  schemaName: string;
  schemaDescription: string;
  retrievedContext?: string[];
  maxRetries?: number;
}

export interface EmbeddingRequest {
  societyId: string;
  texts: string[];
  model?: string;
}

export interface TranscriptionRequest {
  societyId: string;
  userId: string;
  audioBuffer: Buffer;
  mimeType: string;
  languageHint?: string; // 'hi-IN', 'mr-IN', 'en-IN', 'auto'
}

export interface GenerationResult<T> {
  data: T;
  rawText: string;
  model: string;
  provider: 'gemini' | 'gemma' | 'mock';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cached: boolean;
}

export interface TranscriptionResult {
  transcript: string;
  detectedLanguage: string;
  confidence: number;
  durationSeconds: number;
}

export interface AIGatewayPort {
  generateText(request: TextGenerationRequest): Promise<GenerationResult<string>>;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<GenerationResult<T>>;
  embedText(request: EmbeddingRequest): Promise<number[][]>;
  transcribeSpeech(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

// ==========================================
// Structured Output Schemas for Core Workflows
// ==========================================

export const ExtractedActionItemSchema = z.object({
  title: z.string().min(3).max(255).describe("Imperative action title (e.g. 'Inspect terrace water tanks')"),
  description: z.string().describe("Specific details of the task agreed upon"),
  suggestedAssigneeName: z.string().optional().describe("Name of the person agreed to take ownership"),
  suggestedRole: z.enum([
    'CHAIRMAN', 'HON_SECRETARY', 'TREASURER', 'COMMITTEE_MEMBER',
    'ESTATE_MANAGER', 'MAINTENANCE_STAFF', 'VENDOR', 'UNASSIGNED'
  ]),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL_URGENT']),
  suggestedDeadlineDays: z.number().int().min(1).max(365).describe("Agreed deadline in days"),
  estimatedCostPaise: z.number().int().min(0).optional().describe("Estimated budget in paise (1 INR = 100 paise)"),
  dependencies: z.array(z.string()).describe("Titles of other tasks that must complete first").default([])
});

export const ExtractedResolutionSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().describe("The exact motion or formal society policy being adopted"),
  agendaItemRef: z.string().optional(),
  proposedByName: z.string().optional(),
  secondedByName: z.string().optional(),
  recommendedStatus: z.enum(['PASSED_UNANIMOUSLY', 'PASSED_MAJORITY', 'DEFERRED', 'REJECTED']),
  isStatutory: z.boolean().describe("Whether this resolution requires reporting under cooperative society bye-laws")
});

export const ExtractedMeetingMinutesSchema = z.object({
  meetingTitle: z.string(),
  executiveSummary: z.string().describe("Concise synthesis of discussions and strategic outcomes"),
  keyDiscussions: z.array(z.object({
    topic: z.string(),
    summary: z.string(),
    sentiment: z.enum(['CONSENSUS', 'DEBATED', 'CONFLICT_RESOLVED', 'UNRESOLVED'])
  })),
  resolutions: z.array(ExtractedResolutionSchema),
  actionItems: z.array(ExtractedActionItemSchema),
  openQuestionsForNextMeeting: z.array(z.string()).default([])
});

export type ExtractedActionItem = z.infer<typeof ExtractedActionItemSchema>;
export type ExtractedResolution = z.infer<typeof ExtractedResolutionSchema>;
export type ExtractedMeetingMinutes = z.infer<typeof ExtractedMeetingMinutesSchema>;

export const ExtractedVoiceComplaintSchema = z.object({
  category: z.enum([
    'PLUMBING', 'ELECTRICAL', 'LIFT', 'SECURITY', 'HOUSEKEEPING',
    'PARKING', 'NOISE_DISTURBANCE', 'WATER_LEAKAGE', 'BILLING', 'OTHER'
  ]),
  urgency: z.enum(['LOW', 'NORMAL', 'URGENT', 'EMERGENCY_SAFETY']),
  flatNumberMentioned: z.string().optional(),
  locationDescription: z.string().describe("Common area or flat location mentioned (e.g., 'Basement 2 pump room')"),
  summaryInEnglish: z.string().describe("Standardized concise English summary of the resident's issue"),
  originalLanguageTranscript: z.string().describe("Verbatim transcript in the source language")
});

export type ExtractedVoiceComplaint = z.infer<typeof ExtractedVoiceComplaintSchema>;

export const CitationReferenceSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  sourceReference: z.string().optional(),
  relevantExcerpt: z.string().describe("Exact snippet from the retrieved context supporting this point"),
  relevanceScore: z.number().min(0).max(1),
});

export const SocietyMemoryAnswerSchema = z.object({
  answer: z.string().describe("Clear, factual answer to the resident's inquiry, grounded solely in retrieved context"),
  groundedInContext: z.boolean().describe("True if answer was found in society records, false if records do not contain this information"),
  confidence: z.number().min(0).max(1),
  citations: z.array(CitationReferenceSchema).default([]),
  suggestedFollowUps: z.array(z.string()).default([])
});

export type CitationReference = z.infer<typeof CitationReferenceSchema>;
export type SocietyMemoryAnswer = z.infer<typeof SocietyMemoryAnswerSchema>;
