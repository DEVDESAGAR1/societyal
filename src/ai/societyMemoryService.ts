/**
 * SocietyFix AI — Society Memory & Grounded Retrieval Service
 * Implements society-scoped knowledge storage, semantic vector retrieval,
 * grounded question answering with strict source attribution, and meeting/complaint intelligence.
 */

import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import { getDb } from '../db/client.ts';
import {
  societyMemoryItems,
  societyAuditLogs,
  aiRuns,
  type SocietyMemoryItem,
  type NewSocietyMemoryItem,
} from '../db/schema.ts';
import { aiGateway } from './aiGateway.ts';
import {
  SocietyMemoryAnswerSchema,
  ExtractedMeetingMinutesSchema,
  ExtractedVoiceComplaintSchema,
  type SocietyMemoryAnswer,
  type ExtractedMeetingMinutes,
  type ExtractedVoiceComplaint,
} from './aiGatewayTypes.ts';
import { logger } from '../infrastructure/logger.ts';

// In-memory fallback store when DB is not configured (e.g. unit test runner)
const mockMemoryStore = new Map<string, SocietyMemoryItem>();

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    normA += vecA[i]! * vecA[i]!;
    normB += vecB[i]! * vecB[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface CreateMemoryItemInput {
  title: string;
  category: string;
  content: string;
  sourceReference?: string;
  tags?: string[];
  isAiGenerated?: boolean;
}

export class SocietyMemoryService {
  /**
   * Adds a knowledge document to the society's private memory.
   */
  async addMemoryItem(
    societyId: string,
    input: CreateMemoryItemInput,
    actorUserId: string
  ): Promise<SocietyMemoryItem> {
    if (!input.title || input.title.trim().length < 3) {
      throw new Error('Title must be at least 3 characters long');
    }
    if (!input.content || input.content.trim().length < 10) {
      throw new Error('Content must be at least 10 characters long');
    }

    // Generate vector embedding for semantic search
    let embedding: number[] | null = null;
    try {
      const textToEmbed = `${input.title}\n${input.sourceReference || ''}\n${input.content}`;
      const [vec] = await aiGateway.embedText({
        societyId,
        texts: [textToEmbed],
      });
      embedding = vec || null;
    } catch (err) {
      logger.warn('Failed to generate embedding for memory item; proceeding without vector', { error: String(err) });
    }

    const tags = Array.isArray(input.tags) ? input.tags : [];

    if (!isDatabaseConfigured()) {
      const newItem: SocietyMemoryItem = {
        id: `mem-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        societyId,
        title: input.title.trim(),
        category: input.category || 'OTHER',
        content: input.content.trim(),
        sourceReference: input.sourceReference?.trim() || null,
        tags,
        embedding,
        isAiGenerated: Boolean(input.isAiGenerated),
        createdById: actorUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockMemoryStore.set(newItem.id, newItem);
      return newItem;
    }

    const db = getDb();
    const [inserted] = await db
      .insert(societyMemoryItems)
      .values({
        societyId,
        title: input.title.trim(),
        category: input.category || 'OTHER',
        content: input.content.trim(),
        sourceReference: input.sourceReference?.trim() || null,
        tags,
        embedding,
        isAiGenerated: Boolean(input.isAiGenerated),
        createdById: actorUserId,
      })
      .returning();

    // Record audit log
    await db.insert(societyAuditLogs).values({
      societyId,
      actorUserId,
      action: 'ADD_MEMORY_ITEM',
      targetType: 'SOCIETY_MEMORY',
      targetId: inserted!.id,
      metadata: { title: inserted!.title, category: inserted!.category },
    });

    return inserted!;
  }

  /**
   * Lists memory items strictly scoped to the tenant society.
   */
  async listMemoryItems(
    societyId: string,
    options: { category?: string; search?: string } = {}
  ): Promise<SocietyMemoryItem[]> {
    if (!isDatabaseConfigured()) {
      let items = Array.from(mockMemoryStore.values()).filter(m => m.societyId === societyId);
      if (options.category && options.category !== 'ALL') {
        items = items.filter(m => m.category === options.category);
      }
      if (options.search && options.search.trim()) {
        const q = options.search.toLowerCase().trim();
        items = items.filter(m =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          (m.sourceReference && m.sourceReference.toLowerCase().includes(q))
        );
      }
      return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const db = getDb();
    const conditions = [eq(societyMemoryItems.societyId, societyId)];

    if (options.category && options.category !== 'ALL') {
      conditions.push(eq(societyMemoryItems.category, options.category));
    }
    if (options.search && options.search.trim()) {
      const q = `%${options.search.trim()}%`;
      conditions.push(
        sql`(${societyMemoryItems.title} ILIKE ${q} OR ${societyMemoryItems.content} ILIKE ${q} OR ${societyMemoryItems.sourceReference} ILIKE ${q})`
      );
    }

    return db
      .select()
      .from(societyMemoryItems)
      .where(and(...conditions))
      .orderBy(desc(societyMemoryItems.createdAt));
  }

  /**
   * Deletes a memory item with tenant boundary validation.
   */
  async deleteMemoryItem(societyId: string, itemId: string, actorUserId: string): Promise<boolean> {
    if (!isDatabaseConfigured()) {
      const existing = mockMemoryStore.get(itemId);
      if (!existing || existing.societyId !== societyId) {
        return false;
      }
      mockMemoryStore.delete(itemId);
      return true;
    }

    const db = getDb();
    const existing = await db
      .select()
      .from(societyMemoryItems)
      .where(and(eq(societyMemoryItems.id, itemId), eq(societyMemoryItems.societyId, societyId)))
      .limit(1);

    if (existing.length === 0) {
      return false;
    }

    await db.delete(societyMemoryItems).where(eq(societyMemoryItems.id, itemId));

    // Audit log
    await db.insert(societyAuditLogs).values({
      societyId,
      actorUserId,
      action: 'DELETE_MEMORY_ITEM',
      targetType: 'SOCIETY_MEMORY',
      targetId: itemId,
      metadata: { title: existing[0]?.title },
    });

    return true;
  }

  /**
   * Retrieves relevant memory chunks using hybrid vector similarity and keyword scoring.
   * Cross-tenant isolation is strictly enforced.
   */
  async retrieveContext(
    societyId: string,
    query: string,
    topK: number = 4
  ): Promise<Array<{ item: SocietyMemoryItem; score: number }>> {
    const allItems = await this.listMemoryItems(societyId);
    if (allItems.length === 0) {
      return [];
    }

    // Embed query
    let queryVec: number[] | null = null;
    try {
      const [vec] = await aiGateway.embedText({
        societyId,
        texts: [query],
      });
      queryVec = vec || null;
    } catch {
      queryVec = null;
    }

    const domainStopwords = new Set([
      'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
      'the', 'is', 'are', 'for', 'can', 'in', 'our', 'resident', 'residents',
      'society', 'member', 'members', 'rules', 'rule', 'keep', 'have', 'does',
      'any', 'with', 'from', 'this', 'that', 'there', 'about'
    ]);

    const queryKeywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !domainStopwords.has(w));

    const scored = allItems.map(item => {
      const fullText = `${item.title} ${item.content} ${item.sourceReference || ''} ${(item.tags || []).join(' ')}`.toLowerCase();

      let keywordScore = 0;
      let matchedCount = 0;
      for (const kw of queryKeywords) {
        if (fullText.includes(kw)) {
          matchedCount++;
          keywordScore += 0.3;
        } else {
          // Check root/stem match (e.g. drip vs dripping)
          const stem = kw.slice(0, 4);
          if (stem.length >= 3 && fullText.includes(stem)) {
            matchedCount++;
            keywordScore += 0.2;
          }
        }
      }

      let vectorScore = 0;
      if (queryVec && item.embedding && Array.isArray(item.embedding)) {
        vectorScore = cosineSimilarity(queryVec, item.embedding);
      }

      // Strong threshold: require either at least 1 keyword match or strong vector score
      const finalScore = matchedCount > 0 
        ? Math.min(1.0, keywordScore * 0.7 + vectorScore * 0.3)
        : (vectorScore > 0.65 ? vectorScore : 0);

      return { item, score: finalScore, matchedCount };
    });

    // Only return chunks that actually matched relevant terms
    return scored
      .filter(s => s.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Grounded Question Answering against Society Memory.
   * Strictly cites source documents. Returns clear ungrounded indicator if not found in records.
   */
  async askSocietyMemory(
    societyId: string,
    query: string,
    userId: string
  ): Promise<SocietyMemoryAnswer> {
    const relevantChunks = await this.retrieveContext(societyId, query, 4);

    const formattedContexts = relevantChunks.map(c => {
      return `[DOCUMENT ID: ${c.item.id}]\nTITLE: ${c.item.title}\nREFERENCE: ${c.item.sourceReference || 'N/A'}\nCATEGORY: ${c.item.category}\nCONTENT:\n${c.item.content}`;
    });

    const systemPrompt = `You are SocietyFix AI, the intelligent personal secretary for this housing society.
Your mission: "Every discussion becomes an action. Every action gets tracked. Nothing gets forgotten."

CRITICAL GROUNDING RULES:
1. Answer the resident's inquiry accurately and politely, using ONLY the facts present in the retrieved society documents provided below.
2. If the retrieved documents DO NOT contain sufficient information to answer the question, you MUST set "groundedInContext" to false, give a clear factual response stating that this information is not found in current society records, and provide suggested next steps (e.g. asking the secretary). DO NOT speculate or invent rules.
3. Every claim in your answer must have a corresponding citation pointing to the exact document ID, title, reference, and an excerpt from the context.
4. Always maintain a professional, helpful tone suitable for Indian cooperative housing societies (mentioning Bye-laws, AGM/SGM, Managing Committee, maintenance where appropriate).`;

    const result = await aiGateway.generateStructured<SocietyMemoryAnswer>({
      societyId,
      userId,
      operationName: 'society_memory_qa',
      systemPrompt,
      userPrompt: query,
      retrievedContext: formattedContexts,
      schema: SocietyMemoryAnswerSchema,
      schemaName: 'SocietyMemoryAnswer',
      schemaDescription: 'Grounded housing society knowledge answer with source citations',
    });

    return result.data;
  }

  /**
   * AI Extraction: Meeting Minutes, Resolutions & Action Items
   * Enforces AI safety boundary: all outputs are drafts requiring human committee ratification.
   */
  async extractMeetingMinutes(
    societyId: string,
    notesOrTranscript: string,
    userId: string
  ): Promise<ExtractedMeetingMinutes> {
    const systemPrompt = `You are SocietyFix AI, an expert meeting secretary for Indian housing societies.
Analyze the provided meeting notes or transcript and extract:
1. Concise executive summary (150 words).
2. Key discussions with sentiment.
3. Formal resolutions (categorized with statutory flags for cooperative societies).
4. Concrete, imperative action items with priority, deadlines in days, and suggested roles.
5. Open questions for the next meeting.

SAFETY NOTICE: Extracted resolutions are labeled as proposals and require human ratification.`;

    const result = await aiGateway.generateStructured<ExtractedMeetingMinutes>({
      societyId,
      userId,
      operationName: 'extract_meeting_minutes',
      systemPrompt,
      userPrompt: notesOrTranscript,
      schema: ExtractedMeetingMinutesSchema,
      schemaName: 'ExtractedMeetingMinutes',
      schemaDescription: 'Structured meeting minutes, resolutions, and action items',
    });

    return result.data;
  }

  /**
   * AI Extraction: Resident Voice / Text Complaint Categorization
   */
  async extractComplaint(
    societyId: string,
    complaintText: string,
    userId: string
  ): Promise<ExtractedVoiceComplaint> {
    const systemPrompt = `You are SocietyFix AI complaint intake assistant.
Parse the resident complaint (which may be in English, Hindi, Marathi, Hinglish, or other Indian languages) and extract:
- Category (e.g. PLUMBING, ELECTRICAL, LIFT, NOISE_DISTURBANCE, WATER_LEAKAGE)
- Urgency level
- Flat number if mentioned
- Location description
- Standardized concise English summary
- Verbatim original language snippet`;

    const result = await aiGateway.generateStructured<ExtractedVoiceComplaint>({
      societyId,
      userId,
      operationName: 'extract_complaint',
      systemPrompt,
      userPrompt: complaintText,
      schema: ExtractedVoiceComplaintSchema,
      schemaName: 'ExtractedVoiceComplaint',
      schemaDescription: 'Structured complaint classification with urgency and location',
    });

    return result.data;
  }

  /**
   * Society AI Execution Statistics & Quota Telemetry
   */
  async getSocietyAIStats(societyId: string): Promise<{
    totalRuns: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    averageLatencyMs: number;
    successRate: number;
  }> {
    if (!isDatabaseConfigured()) {
      return {
        totalRuns: 12,
        totalPromptTokens: 1450,
        totalCompletionTokens: 820,
        averageLatencyMs: 38,
        successRate: 1.0,
      };
    }

    const db = getDb();
    const runs = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.societyId, societyId))
      .orderBy(desc(aiRuns.createdAt))
      .limit(100);

    if (runs.length === 0) {
      return {
        totalRuns: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        averageLatencyMs: 0,
        successRate: 1.0,
      };
    }

    const totalRuns = runs.length;
    const totalPromptTokens = runs.reduce((acc, r) => acc + r.promptTokens, 0);
    const totalCompletionTokens = runs.reduce((acc, r) => acc + r.completionTokens, 0);
    const totalLatency = runs.reduce((acc, r) => acc + r.latencyMs, 0);
    const successCount = runs.filter(r => r.status === 'SUCCESS').length;

    return {
      totalRuns,
      totalPromptTokens,
      totalCompletionTokens,
      averageLatencyMs: Math.round(totalLatency / totalRuns),
      successRate: Math.round((successCount / totalRuns) * 100) / 100,
    };
  }
}

export const societyMemoryService = new SocietyMemoryService();
