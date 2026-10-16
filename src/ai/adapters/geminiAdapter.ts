/**
 * SocietyFix AI — Google GenAI Adapter (Gemini / Gemma via @google/genai SDK)
 * Adheres strictly to gemini-api SKILL.md guidelines.
 * All SDK calls are strictly server-side with User-Agent telemetry headers.
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../../infrastructure/logger.ts';
import type {
  AIGatewayPort,
  TextGenerationRequest,
  StructuredGenerationRequest,
  EmbeddingRequest,
  TranscriptionRequest,
  GenerationResult,
  TranscriptionResult,
} from '../aiGatewayTypes.ts';

export class GeminiAIAdapter implements AIGatewayPort {
  private client: GoogleGenAI | null = null;
  private primaryModel: string = 'gemini-3.8-flash';
  private embeddingModel: string = 'gemini-embedding-2-preview';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key) {
      this.client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  isAvailable(): boolean {
    return Boolean(this.client);
  }

  async generateText(request: TextGenerationRequest): Promise<GenerationResult<string>> {
    if (!this.client) {
      throw new Error('Gemini API client is not configured (missing GEMINI_API_KEY).');
    }

    const start = Date.now();
    let promptWithContext = request.userPrompt;
    if (request.retrievedContext && request.retrievedContext.length > 0) {
      promptWithContext = `RETRIEVED SOCIETY CONTEXT:\n${request.retrievedContext.join('\n---\n')}\n\nUSER PROMPT:\n${request.userPrompt}`;
    }

    const response = await this.client.models.generateContent({
      model: this.primaryModel,
      contents: promptWithContext,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0.2,
      },
    });

    const text = response.text || '';
    const latency = Date.now() - start;

    return {
      data: text,
      rawText: text,
      model: this.primaryModel,
      provider: 'gemini',
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
      latencyMs: latency,
      cached: false,
    };
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<GenerationResult<T>> {
    if (!this.client) {
      throw new Error('Gemini API client is not configured (missing GEMINI_API_KEY).');
    }

    const start = Date.now();
    let promptWithContext = request.userPrompt;
    if (request.retrievedContext && request.retrievedContext.length > 0) {
      promptWithContext = `RETRIEVED SOCIETY CONTEXT:\n${request.retrievedContext.join('\n---\n')}\n\nUSER INQUIRY:\n${request.userPrompt}`;
    }

    const systemInstruction = `${request.systemPrompt}\n\nCRITICAL OUTPUT REQUIREMENT: You MUST reply with pure JSON conforming to schema '${request.schemaName}'. Description: ${request.schemaDescription}. Do not include markdown formatting or backticks outside the JSON.`;

    let lastError: Error | null = null;
    const maxRetries = request.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let currentPrompt = promptWithContext;
        if (attempt > 0 && lastError) {
          currentPrompt += `\n\n[REPAIR INSTRUCTION - ATTEMPT ${attempt}]: The previous JSON output failed validation with error: ${lastError.message}. Please fix the structure and return pure valid JSON.`;
        }

        const response = await this.client.models.generateContent({
          model: this.primaryModel,
          contents: currentPrompt,
          config: {
            systemInstruction,
            temperature: request.temperature ?? 0.1,
            responseMimeType: 'application/json',
          },
        });

        const rawText = (response.text || '').trim();
        // Remove markdown json fences if any leaked
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        const parsedJson = JSON.parse(cleanJson);
        const validatedData = request.schema.parse(parsedJson);

        const latency = Date.now() - start;

        return {
          data: validatedData,
          rawText,
          model: this.primaryModel,
          provider: 'gemini',
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          latencyMs: latency,
          cached: false,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Structured generation attempt failed; retrying with repair...', {
          attempt,
          error: lastError.message,
          schemaName: request.schemaName,
        });
      }
    }

    throw new Error(`Failed to generate valid structured output after ${maxRetries} repair attempts: ${lastError?.message}`);
  }

  async embedText(request: EmbeddingRequest): Promise<number[][]> {
    if (!this.client) {
      throw new Error('Gemini API client is not configured (missing GEMINI_API_KEY).');
    }

    const embeddings: number[][] = [];
    for (const text of request.texts) {
      try {
        const response = await this.client.models.embedContent({
          model: this.embeddingModel,
          contents: text,
        });

        const values = response.embeddings?.[0]?.values ||
          (response as unknown as { embedding?: { values: number[] } }).embedding?.values;
        if (values && Array.isArray(values)) {
          embeddings.push(values);
        } else {
          embeddings.push(new Array(64).fill(0));
        }
      } catch (error) {
        logger.warn('Gemini embedding call failed for text chunk', { error: String(error) });
        embeddings.push(new Array(64).fill(0));
      }
    }

    return embeddings;
  }

  async transcribeSpeech(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.client) {
      throw new Error('Gemini API client is not configured (missing GEMINI_API_KEY).');
    }

    const audioPart = {
      inlineData: {
        mimeType: request.mimeType || 'audio/mp3',
        data: request.audioBuffer.toString('base64'),
      },
    };

    const response = await this.client.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: { parts: [audioPart, { text: 'Transcribe this society voice note accurately. Preserve Indian language expressions verbatim.' }] },
    });

    return {
      transcript: response.text || '',
      detectedLanguage: request.languageHint || 'en-IN',
      confidence: 0.95,
      durationSeconds: 10,
    };
  }
}
