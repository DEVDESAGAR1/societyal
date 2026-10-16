/**
 * SocietyFix AI — AI Gateway & Society Memory REST API Routes
 * Implements tenant-isolated RAG question answering, knowledge base management,
 * structured meeting minutes extraction, and telemetry reporting.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/authMiddleware.ts';
import {
  requireSocietyMembership,
  requireSocietyPermission,
} from '../society/societyMiddleware.ts';
import { societyMemoryService } from '../ai/societyMemoryService.ts';
import { logger } from '../infrastructure/logger.ts';

const router = Router();

// ==========================================
// Society Memory & Knowledge Base Endpoints
// ==========================================

/**
 * GET /api/societies/:societyId/memory/items
 * Lists all knowledge items in the tenant society's private memory.
 */
router.get(
  '/societies/:societyId/memory/items',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('ASK_SOCIETY_MEMORY'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;

      const items = await societyMemoryService.listMemoryItems(societyId, { category, search });
      return res.status(200).json({ items });
    } catch (error) {
      logger.error('Failed to list society memory items', { error: String(error) });
      return res.status(500).json({ error: 'Failed to retrieve society knowledge base' });
    }
  }
);

/**
 * POST /api/societies/:societyId/memory/items
 * Adds a new knowledge item (bye-law, circular, rule, vendor info) to Society Memory.
 */
router.post(
  '/societies/:societyId/memory/items',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_SOCIETY_MEMORY'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const user = req.user!;
      const { title, category, content, sourceReference, tags, isAiGenerated } = req.body || {};

      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      const item = await societyMemoryService.addMemoryItem(
        societyId,
        {
          title,
          category: category || 'OTHER',
          content,
          sourceReference,
          tags,
          isAiGenerated,
        },
        user.id
      );

      return res.status(201).json({ item });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to add society memory item', { error: msg });
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * DELETE /api/societies/:societyId/memory/items/:itemId
 * Deletes a knowledge item from the society's private memory.
 */
router.delete(
  '/societies/:societyId/memory/items/:itemId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_SOCIETY_MEMORY'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const itemId = req.params.itemId!;
      const user = req.user!;

      const success = await societyMemoryService.deleteMemoryItem(societyId, itemId, user.id);
      if (!success) {
        return res.status(404).json({ error: 'Memory item not found or does not belong to this society' });
      }

      return res.status(200).json({ success: true, message: 'Item deleted from society memory' });
    } catch (error) {
      logger.error('Failed to delete society memory item', { error: String(error) });
      return res.status(500).json({ error: 'Failed to delete item from knowledge base' });
    }
  }
);

/**
 * POST /api/societies/:societyId/memory/ask
 * Natural language inquiry against society memory with source citations.
 */
router.post(
  '/societies/:societyId/memory/ask',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('ASK_SOCIETY_MEMORY'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const user = req.user!;
      const { query } = req.body || {};

      if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return res.status(400).json({ error: 'Query must be at least 3 characters long' });
      }

      const answer = await societyMemoryService.askSocietyMemory(societyId, query.trim(), user.id);
      return res.status(200).json({ answer });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to process society memory query', { error: msg });
      return res.status(500).json({ error: msg });
    }
  }
);

// ==========================================
// AI Extraction Endpoints (Meetings & Complaints)
// ==========================================

/**
 * POST /api/societies/:societyId/ai/extract-meeting
 * Extracts structured meeting minutes, resolutions, and action items from raw notes.
 */
router.post(
  '/societies/:societyId/ai/extract-meeting',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('EXTRACT_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const user = req.user!;
      const { notes } = req.body || {};

      if (!notes || typeof notes !== 'string' || notes.trim().length < 10) {
        return res.status(400).json({ error: 'Meeting notes must be at least 10 characters long' });
      }

      const extracted = await societyMemoryService.extractMeetingMinutes(
        societyId,
        notes.trim(),
        user.id
      );

      return res.status(200).json({
        meetingMinutes: extracted,
        isAiDraft: true,
        notice: 'All extracted resolutions and tasks are AI drafts requiring managing committee approval.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to extract meeting minutes', { error: msg });
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/ai/extract-complaint
 * Standardizes resident complaint into category, urgency, and English summary.
 */
router.post(
  '/societies/:societyId/ai/extract-complaint',
  requireAuth,
  requireSocietyMembership,
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const user = req.user!;
      const { complaintText } = req.body || {};

      if (!complaintText || typeof complaintText !== 'string' || complaintText.trim().length < 5) {
        return res.status(400).json({ error: 'Complaint text must be at least 5 characters long' });
      }

      const extracted = await societyMemoryService.extractComplaint(
        societyId,
        complaintText.trim(),
        user.id
      );

      return res.status(200).json({ complaint: extracted });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to extract complaint', { error: msg });
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * GET /api/societies/:societyId/ai/stats
 * Returns AI execution telemetry and quota usage for the society.
 */
router.get(
  '/societies/:societyId/ai/stats',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('VIEW_AUDIT_LOGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const stats = await societyMemoryService.getSocietyAIStats(societyId);
      return res.status(200).json({ stats });
    } catch (error) {
      logger.error('Failed to get society AI stats', { error: String(error) });
      return res.status(500).json({ error: 'Failed to retrieve AI statistics' });
    }
  }
);

export default router;
