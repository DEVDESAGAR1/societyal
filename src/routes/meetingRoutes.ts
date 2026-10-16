/**
 * SocietyFix AI — Housing Society Meeting & Minutes Management REST API Routes
 * Milestone M5: Endpoints for meeting lifecycle, agenda, attendance, source evidence,
 * AI draft minutes extraction, review and approval workflows.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/authMiddleware.ts';
import {
  requireSocietyMembership,
  requireSocietyPermission,
} from '../society/societyMiddleware.ts';
import { meetingService } from '../society/meetingService.ts';
import { storageService } from '../infrastructure/storage.ts';
import { logger } from '../infrastructure/logger.ts';
import type { SocietyRole } from '../society/societyRbac.ts';

const router = Router();

// ==========================================
// Meeting CRUD & Discovery Endpoints
// ==========================================

/**
 * GET /api/societies/:societyId/meetings
 * Lists meetings in the tenant society.
 */
router.get(
  '/societies/:societyId/meetings',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('VIEW_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const meetings = await meetingService.listMeetings(societyId, { status, search });
      return res.status(200).json({ meetings });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list society meetings', { error: msg });
      return res.status(500).json({ error: 'Failed to retrieve society meetings' });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings
 * Creates a new meeting.
 */
router.post(
  '/societies/:societyId/meetings',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('CREATE_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const user = req.user!;
      const {
        title,
        description,
        meetingType,
        scheduledStartTime,
        scheduledEndTime,
        timezone,
        location,
        isVirtual,
        meetingLink,
        initialAgenda,
        initialAttendees,
      } = req.body || {};

      const meeting = await meetingService.createMeeting(
        societyId,
        {
          title,
          description,
          meetingType,
          scheduledStartTime,
          scheduledEndTime,
          timezone,
          location,
          isVirtual,
          meetingLink,
          initialAgenda,
          initialAttendees,
        },
        user.id
      );

      return res.status(201).json({
        success: true,
        message: 'Meeting created successfully.',
        meeting,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to create meeting', { error: msg });
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * GET /api/societies/:societyId/meetings/:meetingId
 * Returns full meeting details including agenda, attendees, sources, and revisions.
 */
router.get(
  '/societies/:societyId/meetings/:meetingId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('VIEW_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;

      const meeting = await meetingService.getMeetingDetails(societyId, meetingId);
      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found or does not belong to this society.' });
      }

      return res.status(200).json({ meeting });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to retrieve meeting details', { error: msg });
      return res.status(500).json({ error: 'Failed to retrieve meeting details' });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/meetings/:meetingId
 * Updates permitted meeting details while in editable state.
 */
router.patch(
  '/societies/:societyId/meetings/:meetingId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('CREATE_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const updates = req.body || {};

      const updated = await meetingService.updateMeetingDetails(societyId, meetingId, updates, user.id);
      return res.status(200).json({ success: true, meeting: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/status
 * Updates meeting lifecycle status enforcing valid state machine transitions.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/status',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('CREATE_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { status } = req.body || {};

      if (!status) {
        return res.status(400).json({ error: 'Target status is required.' });
      }

      const updated = await meetingService.updateMeetingStatus(societyId, meetingId, status, user.id);
      return res.status(200).json({ success: true, meeting: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

// ==========================================
// Agenda & Attendance Endpoints
// ==========================================

/**
 * POST /api/societies/:societyId/meetings/:meetingId/agenda
 * Adds an agenda item to the meeting.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/agenda',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('CREATE_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { title, description, durationMinutes, presenterName } = req.body || {};

      const item = await meetingService.addAgendaItem(
        societyId,
        meetingId,
        { title, description, durationMinutes, presenterName },
        user.id
      );

      return res.status(201).json({ success: true, agendaItem: item });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * DELETE /api/societies/:societyId/meetings/:meetingId/agenda/:itemId
 * Removes an agenda item.
 */
router.delete(
  '/societies/:societyId/meetings/:meetingId/agenda/:itemId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('CREATE_MEETINGS'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const itemId = req.params.itemId!;
      const user = req.user!;

      const success = await meetingService.deleteAgendaItem(societyId, meetingId, itemId, user.id);
      if (!success) {
        return res.status(404).json({ error: 'Agenda item not found.' });
      }

      return res.status(200).json({ success: true, message: 'Agenda item removed.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/attendees
 * Records or bulk adds attendees.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/attendees',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_MEETING_NOTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { attendees } = req.body || {};

      if (!attendees || !Array.isArray(attendees)) {
        return res.status(400).json({ error: 'Attendees array is required.' });
      }

      const recorded = await meetingService.recordAttendees(societyId, meetingId, attendees, user.id);
      return res.status(201).json({ success: true, attendees: recorded });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/meetings/:meetingId/attendees/:attendeeId
 * Updates attendee status (EXPECTED, ATTENDED, ABSENT, EXCUSED).
 */
router.patch(
  '/societies/:societyId/meetings/:meetingId/attendees/:attendeeId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_MEETING_NOTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const attendeeId = req.params.attendeeId!;
      const user = req.user!;
      const { attendanceStatus } = req.body || {};

      if (!attendanceStatus) {
        return res.status(400).json({ error: 'Attendance status is required.' });
      }

      const updated = await meetingService.updateAttendeeStatus(
        societyId,
        meetingId,
        attendeeId,
        attendanceStatus,
        user.id
      );

      return res.status(200).json({ success: true, attendee: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

// ==========================================
// Source Evidence & Provenance Endpoints
// ==========================================

/**
 * POST /api/societies/:societyId/meetings/:meetingId/sources
 * Submits raw meeting notes or recording reference with content hash provenance.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/sources',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_MEETING_NOTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { title, rawContent, sourceType, audioStoragePath, audioMimeType, audioDurationSeconds } = req.body || {};

      const source = await meetingService.addSourceNote(
        societyId,
        meetingId,
        { title, rawContent, sourceType, audioStoragePath, audioMimeType, audioDurationSeconds },
        user.id
      );

      return res.status(201).json({
        success: true,
        message: 'Source evidence recorded with cryptographic hash.',
        source,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

// ==========================================
// AI-Assisted Draft Minutes Generation
// ==========================================

/**
 * POST /api/societies/:societyId/meetings/:meetingId/ai/generate-draft
 * Synthesizes structured draft minutes from recorded source notes using AI Gateway.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/ai/generate-draft',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('GENERATE_MEETING_DRAFT'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { focusTopics, sourceIds } = req.body || {};

      const result = await meetingService.generateMeetingDraftMinutes(
        societyId,
        meetingId,
        user.id,
        { focusTopics, sourceIds }
      );

      return res.status(200).json({
        success: true,
        isAiDraft: true,
        notice: 'All synthesized resolutions and action items are AI drafts requiring human managing committee approval.',
        revision: result.revision,
        proposedActions: result.proposedActions,
        proposedDecisions: result.proposedDecisions,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to generate draft minutes', { error: msg });
      return res.status(500).json({ error: msg });
    }
  }
);

// ==========================================
// Minutes Review, Approval & Amendment Endpoints
// ==========================================

/**
 * PATCH /api/societies/:societyId/meetings/:meetingId/revisions/:revisionId
 * Edits draft minutes revision during review.
 */
router.patch(
  '/societies/:societyId/meetings/:meetingId/revisions/:revisionId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const revisionId = req.params.revisionId!;
      const user = req.user!;
      const updates = req.body || {};

      const updated = await meetingService.updateDraftRevision(societyId, meetingId, revisionId, updates, user.id);
      return res.status(200).json({ success: true, revision: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/revisions/:revisionId/submit-review
 * Submits draft revision for committee review.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/revisions/:revisionId/submit-review',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const revisionId = req.params.revisionId!;
      const user = req.user!;
      const { notes } = req.body || {};

      const submitted = await meetingService.submitMinutesForReview(societyId, meetingId, revisionId, notes, user.id);
      return res.status(200).json({
        success: true,
        message: 'Draft minutes submitted for managing committee review.',
        revision: submitted,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/revisions/:revisionId/approve
 * Formally approves official minutes revision.
 * Enforces: Only ADMIN (Hon. Secretary), CHAIRMAN, or Platform Super Admin can approve.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/revisions/:revisionId/approve',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('APPROVE_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const revisionId = req.params.revisionId!;
      const user = req.user!;
      const membership = req.membership;
      const { approvalNotes } = req.body || {};

      const result = await meetingService.approveMinutesRevision(
        societyId,
        meetingId,
        revisionId,
        approvalNotes,
        {
          id: user.id,
          role: (req.societyRole || membership?.role) as SocietyRole,
          isSuperAdmin: req.isSuperAdmin,
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Official meeting minutes approved and published to Society Memory.',
        meeting: result.meeting,
        revision: result.revision,
        publishedMemoryId: result.memoryItemId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/revisions/:revisionId/reject
 * Formally rejects draft revision with requested change notes.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/revisions/:revisionId/reject',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('APPROVE_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const revisionId = req.params.revisionId!;
      const user = req.user!;
      const membership = req.membership;
      const { reason } = req.body || {};

      const rejected = await meetingService.rejectMinutesRevision(
        societyId,
        meetingId,
        revisionId,
        reason,
        {
          id: user.id,
          role: (req.societyRole || membership?.role) as SocietyRole,
          isSuperAdmin: req.isSuperAdmin,
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Minutes revision rejected with requested changes.',
        revision: rejected,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/meetings/:meetingId/actions/:actionId
 * Updates status of a proposed action item (ACCEPTED, REJECTED, MODIFIED).
 */
router.patch(
  '/societies/:societyId/meetings/:meetingId/actions/:actionId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const actionId = req.params.actionId!;
      const user = req.user!;
      const updates = req.body || {};

      const updated = await meetingService.updateProposedAction(societyId, meetingId, actionId, updates, user.id);
      return res.status(200).json({ success: true, proposedAction: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * PATCH /api/societies/:societyId/meetings/:meetingId/decisions/:decisionId
 * Updates status of a proposed decision (CONFIRMED_IN_NOTES, FORMALLY_APPROVED, REJECTED).
 */
router.patch(
  '/societies/:societyId/meetings/:meetingId/decisions/:decisionId',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('REVIEW_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const decisionId = req.params.decisionId!;
      const user = req.user!;
      const updates = req.body || {};

      const updated = await meetingService.updateProposedDecision(societyId, meetingId, decisionId, updates, user.id);
      return res.status(200).json({ success: true, proposedDecision: updated });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/publish-memory
 * Publishes approved minutes to Society Memory idempotently.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/publish-memory',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('APPROVE_MEETING_MINUTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;

      const result = await meetingService.publishApprovedMinutesToMemory(societyId, meetingId, user.id);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

// ==========================================
// Audio Storage & Transcription Endpoints
// ==========================================

/**
 * POST /api/societies/:societyId/meetings/:meetingId/audio/signed-url
 * Generates secure, short-lived signed URL for uploading an audio recording.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/audio/signed-url',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('MANAGE_MEETING_NOTES'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const { fileName, contentType } = req.body || {};

      if (!fileName || !contentType) {
        return res.status(400).json({ error: 'fileName and contentType are required.' });
      }

      // Validate audio content type
      const allowedAudioTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/m4a', 'audio/aac'];
      if (!allowedAudioTypes.includes(contentType.toLowerCase())) {
        return res.status(400).json({
          error: `Unsupported audio format '${contentType}'. Allowed types: ${allowedAudioTypes.join(', ')}`,
        });
      }

      const safeFileName = `${meetingId}_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '')}`;
      const signed = await storageService.getSignedUrl({
        societyId,
        category: 'meetings',
        fileName: safeFileName,
        contentType,
        action: 'write',
        expiresInSeconds: 900,
      });

      return res.status(200).json({
        signedUrl: signed.url,
        objectPath: signed.objectPath,
        expiresAt: signed.expiresAt,
        maxSizeBytes: 50 * 1024 * 1024, // 50MB limit
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * POST /api/societies/:societyId/meetings/:meetingId/audio/transcribe
 * Transcribes an audio recording source using AI Gateway.
 */
router.post(
  '/societies/:societyId/meetings/:meetingId/audio/transcribe',
  requireAuth,
  requireSocietyMembership,
  requireSocietyPermission('GENERATE_MEETING_DRAFT'),
  async (req: Request, res: Response) => {
    try {
      const societyId = req.params.societyId!;
      const meetingId = req.params.meetingId!;
      const user = req.user!;
      const { sourceId } = req.body || {};

      if (!sourceId) {
        return res.status(400).json({ error: 'sourceId of the audio recording is required.' });
      }

      const transcription = await meetingService.transcribeAudioSource(societyId, meetingId, sourceId, user.id);
      return res.status(200).json({
        success: true,
        ...transcription,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: msg });
    }
  }
);

export default router;
