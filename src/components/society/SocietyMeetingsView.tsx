import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  Check,
  X,
  Loader2,
  Brain,
  History,
  Send,
  ExternalLink,
  Edit3,
  ThumbsUp,
  ThumbsDown,
  Info,
  Mic,
  Hash,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { Meeting, MeetingAgendaItem, MeetingAttendee, MeetingSource, MeetingMinutesRevision, MeetingProposedAction, MeetingProposedDecision } from '../../db/schema.ts';
import type { SocietyRole, MeetingStatus } from '../../society/societyRbac.ts';
import { CreateMeetingModal } from './CreateMeetingModal.tsx';

interface MeetingDetailsData extends Meeting {
  agenda: MeetingAgendaItem[];
  attendees: MeetingAttendee[];
  sources: MeetingSource[];
  revisions: MeetingMinutesRevision[];
  currentRevision?: MeetingMinutesRevision;
  proposedActions: MeetingProposedAction[];
  proposedDecisions: MeetingProposedDecision[];
}

interface SocietyMeetingsViewProps {
  societyId: string;
  userRole?: SocietyRole;
}

export const SocietyMeetingsView: React.FC<SocietyMeetingsViewProps> = ({
  societyId,
  userRole,
}) => {
  const { getIdToken, isSuperAdmin, user } = useAuth();

  // State
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Tab inside Meeting Detail
  type DetailTab = 'minutes' | 'decisions_actions' | 'agenda_attendance' | 'sources' | 'revisions';
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('minutes');

  // AI & Approval Action States
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Source Note Submission State
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Audio Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);

  const canCreate = userRole === 'ADMIN' || userRole === 'CHAIRMAN' || userRole === 'COMMITTEE_MEMBER' || isSuperAdmin;
  const canApprove = userRole === 'ADMIN' || userRole === 'CHAIRMAN' || isSuperAdmin;

  // Load Meetings List
  const loadMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/societies/${societyId}/meetings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMeetingsList(data.meetings || []);
      }
    } catch (err) {
      console.error('Failed to load meetings', err);
    } finally {
      setIsLoading(false);
    }
  }, [societyId, statusFilter, searchQuery, getIdToken]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // Load Single Meeting Details
  const loadMeetingDetails = useCallback(async (meetingId: string) => {
    setIsDetailLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${societyId}/meetings/${meetingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedMeeting(data.meeting);
      }
    } catch (err) {
      console.error('Failed to load meeting details', err);
    } finally {
      setIsDetailLoading(false);
    }
  }, [societyId, getIdToken]);

  useEffect(() => {
    if (selectedMeetingId) {
      loadMeetingDetails(selectedMeetingId);
    }
  }, [selectedMeetingId, loadMeetingDetails]);

  // Handle AI Draft Generation
  const handleGenerateDraft = async () => {
    if (!selectedMeeting) return;
    setIsGeneratingDraft(true);
    setActionMessage(null);

    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${societyId}/meetings/${selectedMeeting.id}/ai/generate-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate draft minutes');

      setActionMessage({
        type: 'success',
        text: 'AI Draft Minutes generated! Please review proposed decisions and actions below.',
      });
      loadMeetingDetails(selectedMeeting.id);
      loadMeetings();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Handle Submit For Review
  const handleSubmitForReview = async () => {
    if (!selectedMeeting || !selectedMeeting.currentRevision) return;
    setIsSubmittingReview(true);
    setActionMessage(null);

    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/societies/${societyId}/meetings/${selectedMeeting.id}/revisions/${selectedMeeting.currentRevision.id}/submit-review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ notes: 'Submitted for formal managing committee review.' }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit minutes for review');

      setActionMessage({
        type: 'success',
        text: 'Minutes submitted for managing committee review.',
      });
      loadMeetingDetails(selectedMeeting.id);
      loadMeetings();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handle Approve Official Minutes
  const handleApproveMinutes = async () => {
    if (!selectedMeeting || !selectedMeeting.currentRevision) return;
    setIsApproving(true);
    setActionMessage(null);

    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/societies/${societyId}/meetings/${selectedMeeting.id}/revisions/${selectedMeeting.currentRevision.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ approvalNotes: approvalNotes.trim() || undefined }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve official minutes');

      setActionMessage({
        type: 'success',
        text: 'Official minutes formally approved and published to Society Memory!',
      });
      setShowApprovalDialog(false);
      setApprovalNotes('');
      loadMeetingDetails(selectedMeeting.id);
      loadMeetings();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Reject Draft Revision
  const handleRejectRevision = async () => {
    if (!selectedMeeting || !selectedMeeting.currentRevision) return;
    if (!rejectionReason.trim()) {
      setActionMessage({ type: 'error', text: 'Please provide requested change notes.' });
      return;
    }

    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/societies/${societyId}/meetings/${selectedMeeting.id}/revisions/${selectedMeeting.currentRevision.id}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: rejectionReason.trim() }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject revision');

      setActionMessage({
        type: 'success',
        text: 'Minutes revision returned to draft with change notes.',
      });
      setShowRejectDialog(false);
      setRejectionReason('');
      loadMeetingDetails(selectedMeeting.id);
      loadMeetings();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Handle Add Source Note
  const handleAddSourceNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;

    setIsSubmittingNote(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${societyId}/meetings/${selectedMeeting.id}/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          rawContent: newNoteContent.trim(),
          sourceType: 'TEXT_NOTES',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add source notes');

      setActionMessage({
        type: 'success',
        text: 'Source notes recorded with cryptographic SHA-256 hash.',
      });
      setIsAddNoteOpen(false);
      setNewNoteTitle('');
      setNewNoteContent('');
      loadMeetingDetails(selectedMeeting.id);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Handle Update Decision Status
  const handleUpdateDecisionStatus = async (decisionId: string, reviewStatus: string) => {
    if (!selectedMeeting) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${societyId}/meetings/${selectedMeeting.id}/decisions/${decisionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reviewStatus }),
      });

      if (!res.ok) throw new Error('Failed to update decision status');
      loadMeetingDetails(selectedMeeting.id);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Update Action Status
  const handleUpdateActionStatus = async (actionId: string, status: string) => {
    if (!selectedMeeting) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${societyId}/meetings/${selectedMeeting.id}/actions/${actionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error('Failed to update action item status');
      loadMeetingDetails(selectedMeeting.id);
    } catch (err) {
      console.error(err);
    }
  };

  // Badges & Labels
  const statusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Approved MoM
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/60 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            Under Review
          </span>
        );
      case 'MINUTES_DRAFT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-700/60 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            AI Draft
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-700/60 flex items-center gap-1">
            In Progress
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Archived
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-800/60">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
            Scheduled
          </span>
        );
    }
  };

  const meetingTypeLabel = (type: string) => {
    switch (type) {
      case 'ANNUAL_GENERAL_MEETING':
        return 'Annual General Body (AGM)';
      case 'SPECIAL_GENERAL_MEETING':
        return 'Special General Body (SGM)';
      case 'INFORMAL_DISCUSSION':
        return 'Informal Discussion';
      default:
        return 'Managing Committee (MC)';
    }
  };

  // ==========================================
  // VIEW: Meeting Details Drilldown
  // ==========================================
  if (selectedMeetingId && selectedMeeting) {
    const curRev = selectedMeeting.currentRevision;

    return (
      <div className="space-y-6">
        {/* Top Back & Action Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => {
              setSelectedMeetingId(null);
              setSelectedMeeting(null);
              setActionMessage(null);
            }}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to All Meetings</span>
          </button>

          <div className="flex items-center space-x-2">
            {statusBadge(selectedMeeting.status)}
            {selectedMeeting.publishedToMemoryId && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 flex items-center gap-1">
                <Brain className="w-3 h-3 text-indigo-400" />
                Indexed in Society Memory
              </span>
            )}
          </div>
        </div>

        {/* Action Message Banner */}
        {actionMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-red-950/40 border-red-800/60 text-red-300'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Meeting Hero Summary Box */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs text-indigo-400 font-semibold tracking-wide uppercase">
                <span>{meetingTypeLabel(selectedMeeting.meetingType)}</span>
                <span>•</span>
                <span>{new Date(selectedMeeting.scheduledStartTime).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{selectedMeeting.title}</h2>
              {selectedMeeting.description && (
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">{selectedMeeting.description}</p>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {new Date(selectedMeeting.scheduledStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {selectedMeeting.scheduledEndTime && ` - ${new Date(selectedMeeting.scheduledEndTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </div>
                {selectedMeeting.location && (
                  <div className="flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedMeeting.location}</span>
                  </div>
                )}
                {selectedMeeting.isVirtual && selectedMeeting.meetingLink && (
                  <a
                    href={selectedMeeting.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 font-medium underline"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Join Video Meeting</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Quick Action Button Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Generate AI Draft */}
              {canCreate && selectedMeeting.status !== 'APPROVED' && selectedMeeting.status !== 'ARCHIVED' && (
                <button
                  onClick={handleGenerateDraft}
                  disabled={isGeneratingDraft}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 transition-all flex items-center space-x-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  {isGeneratingDraft ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                      <span>Generate AI Draft MoM</span>
                    </>
                  )}
                </button>
              )}

              {/* Submit for Review */}
              {curRev && curRev.status === 'DRAFT' && canCreate && (
                <button
                  onClick={handleSubmitForReview}
                  disabled={isSubmittingReview}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/80 hover:bg-amber-900/60 transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit for Review</span>
                </button>
              )}

              {/* Approve Official Minutes */}
              {canApprove && (curRev?.status === 'SUBMITTED_FOR_REVIEW' || curRev?.status === 'DRAFT') && selectedMeeting.status !== 'APPROVED' && (
                <button
                  onClick={() => setShowApprovalDialog(true)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center space-x-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Official Minutes</span>
                </button>
              )}

              {/* Reject / Request Changes */}
              {canApprove && curRev?.status === 'SUBMITTED_FOR_REVIEW' && (
                <button
                  onClick={() => setShowRejectDialog(true)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-950/60 border border-red-800/80 hover:bg-red-900/60 transition-colors cursor-pointer"
                >
                  <span>Request Changes</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="mt-6 border-t border-slate-800 pt-3 flex items-center space-x-2 overflow-x-auto">
            <button
              onClick={() => setActiveDetailTab('minutes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeDetailTab === 'minutes' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Minutes & AI Synthesis</span>
            </button>

            <button
              onClick={() => setActiveDetailTab('decisions_actions')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeDetailTab === 'decisions_actions' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Proposed Decisions & Actions</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700 text-slate-300 font-bold">
                {selectedMeeting.proposedDecisions.length + selectedMeeting.proposedActions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveDetailTab('agenda_attendance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeDetailTab === 'agenda_attendance' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Agenda & Attendance ({selectedMeeting.attendees.length})</span>
            </button>

            <button
              onClick={() => setActiveDetailTab('sources')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeDetailTab === 'sources' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Source Evidence ({selectedMeeting.sources.length})</span>
            </button>

            <button
              onClick={() => setActiveDetailTab('revisions')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeDetailTab === 'revisions' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Revisions ({selectedMeeting.revisions.length})</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Minutes & AI Synthesis */}
        {activeDetailTab === 'minutes' && (
          <div className="space-y-6">
            {/* Status Governance Banner */}
            {selectedMeeting.status === 'APPROVED' ? (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 flex items-start space-x-3 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-100">Official Managing Committee Approved Minutes</p>
                  <p className="text-emerald-300/80 mt-0.5">
                    Formally approved by committee authority on {selectedMeeting.approvedAt ? new Date(selectedMeeting.approvedAt).toLocaleDateString('en-IN') : 'Record'}. These minutes form the official record of the society.
                  </p>
                </div>
              </div>
            ) : curRev?.status === 'SUBMITTED_FOR_REVIEW' ? (
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex items-start space-x-3 text-xs text-amber-200">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-100">Revision #{curRev.revisionNumber} is Under Review</p>
                  <p className="text-amber-300/80 mt-0.5">
                    Submitted for managing committee sign-off. Review proposed decisions and action items before formal adoption.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/60 flex items-start space-x-3 text-xs text-purple-200">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-purple-100">AI Synthesized Draft (Revision #{curRev ? curRev.revisionNumber : 1})</p>
                  <p className="text-purple-300/80 mt-0.5">
                    Drafted from recorded meeting notes and transcripts. All inferred resolutions and tasks are non-binding until explicitly approved by the managing committee.
                  </p>
                </div>
              </div>
            )}

            {/* Side-by-side or stacked view: Source Evidence & Draft Minutes */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Recorded Source Evidence (4 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>Source Notes & Provenance</span>
                  </h3>
                  <button
                    onClick={() => setIsAddNoteOpen(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Note</span>
                  </button>
                </div>

                {selectedMeeting.sources.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                    <p className="text-xs text-slate-400">No meeting notes or recordings have been recorded yet.</p>
                    <button
                      onClick={() => setIsAddNoteOpen(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium inline-flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record Meeting Notes</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {selectedMeeting.sources.map((src) => (
                      <div key={src.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white truncate">{src.title}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                            {src.sourceType}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto border border-slate-800/60">
                          {src.rawContent}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                          <span title={src.contentHash || undefined}>SHA: {src.contentHash ? src.contentHash.slice(0, 16) : 'N/A'}...</span>
                          <span>{new Date(src.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Draft Minutes of Meeting (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Synthesized Minutes of Meeting (MoM)</span>
                  </h3>
                  {curRev && (
                    <span className="text-xs text-slate-400 font-mono">
                      Rev #{curRev.revisionNumber} ({curRev.aiModelUsed || 'Standard Model'})
                    </span>
                  )}
                </div>

                {!curRev ? (
                  <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                      <Sparkles className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-white">No Minutes Synthesized Yet</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Once notes are recorded, click below to let SocietyFix AI synthesize an objective draft of discussions, decisions, and action items.
                      </p>
                    </div>
                    {canCreate && (
                      <button
                        onClick={handleGenerateDraft}
                        disabled={isGeneratingDraft || selectedMeeting.sources.length === 0}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors inline-flex items-center space-x-2 shadow-lg shadow-purple-600/30"
                      >
                        {isGeneratingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>Extract Draft Minutes Now</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
                    {/* Executive Summary */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Executive Summary</h4>
                      <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                        {curRev.executiveSummary}
                      </p>
                    </div>

                    {/* Key Discussions */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Key Discussion Items & Sentiment ({Array.isArray(curRev.keyDiscussions) ? curRev.keyDiscussions.length : 0})
                      </h4>
                      <div className="space-y-2.5">
                        {((Array.isArray(curRev.keyDiscussions) ? curRev.keyDiscussions : []) as Array<{ topic: string; summary: string; sentiment?: string }>).map((disc, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white">{disc.topic}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                disc.sentiment === 'CONSENSUS'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                  : disc.sentiment === 'DEBATED'
                                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                  : 'bg-slate-800 text-slate-300'
                              }`}>
                                {disc.sentiment || 'NOTE'}
                              </span>
                            </div>
                            <p className="text-slate-300 text-[11px] leading-relaxed">{disc.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Open Questions For Next Meeting */}
                    {Array.isArray(curRev.openQuestions) && curRev.openQuestions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Unresolved Questions for Next Meeting</h4>
                        <ul className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          {(curRev.openQuestions as string[]).map((q, idx) => (
                            <li key={idx} className="flex items-start space-x-2">
                              <span className="text-purple-400 font-bold">•</span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Proposed Decisions & Actions */}
        {activeDetailTab === 'decisions_actions' && (
          <div className="space-y-6">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-start space-x-2.5">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-white">Governance Distinction:</strong> Decisions and action items are proposals synthesized from meeting notes. They do not trigger automated M6 task creation or notifications until officially accepted and managed by the society committee.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Proposed Resolutions / Decisions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span>Proposed Resolutions ({selectedMeeting.proposedDecisions.length})</span>
                  </h3>
                </div>

                {selectedMeeting.proposedDecisions.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                    No decisions extracted yet. Generate draft minutes from meeting notes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMeeting.proposedDecisions.map((dec) => (
                      <div key={dec.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-white">{dec.title}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            dec.reviewStatus === 'FORMALLY_APPROVED'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : dec.reviewStatus === 'REJECTED'
                              ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          }`}>
                            {dec.reviewStatus}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{dec.description}</p>

                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            {dec.isStatutory ? 'Statutory Bye-law Resolution' : 'General Resolution'}
                          </span>
                          {canApprove && (
                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => handleUpdateDecisionStatus(dec.id, 'FORMALLY_APPROVED')}
                                className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[10px] font-semibold"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleUpdateDecisionStatus(dec.id, 'REJECTED')}
                                className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 text-[10px] font-semibold"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Proposed Action Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Proposed Action Items ({selectedMeeting.proposedActions.length})</span>
                  </h3>
                </div>

                {selectedMeeting.proposedActions.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                    No action items extracted yet. Generate draft minutes from meeting notes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMeeting.proposedActions.map((act) => (
                      <div key={act.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-white">{act.title}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            act.priority === 'CRITICAL_URGENT' || act.priority === 'HIGH'
                              ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {act.priority}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{act.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                          <div>
                            <span className="text-slate-500">Assignee:</span>{' '}
                            <span className="text-slate-300 font-medium">{act.suggestedAssigneeName || act.suggestedRole}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Deadline:</span>{' '}
                            <span className="text-slate-300 font-medium">In {act.suggestedDeadlineDays} days</span>
                          </div>
                          {act.estimatedCostPaise && (
                            <div>
                              <span className="text-slate-500">Budget:</span>{' '}
                              <span className="text-slate-300 font-medium font-mono">
                                ₹{(act.estimatedCostPaise / 100).toLocaleString('en-IN')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                          <span className={`font-semibold ${
                            act.status === 'ACCEPTED' ? 'text-emerald-400' : act.status === 'REJECTED' ? 'text-red-400' : 'text-amber-400'
                          }`}>
                            Status: {act.status}
                          </span>
                          {canCreate && (
                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => handleUpdateActionStatus(act.id, 'ACCEPTED')}
                                className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[10px] font-semibold"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleUpdateActionStatus(act.id, 'REJECTED')}
                                className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 text-[10px] font-semibold"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Agenda & Quorum Attendance */}
        {activeDetailTab === 'agenda_attendance' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Agenda Items */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Meeting Agenda Topics ({selectedMeeting.agenda.length})</span>
              </h3>

              {selectedMeeting.agenda.length === 0 ? (
                <p className="text-xs text-slate-400">No agenda topics listed.</p>
              ) : (
                <div className="space-y-2.5">
                  {selectedMeeting.agenda.map((ag) => (
                    <div key={ag.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold">
                          {ag.orderIndex + 1}
                        </span>
                        <span className="font-semibold text-white">{ag.title}</span>
                      </div>
                      {ag.description && <p className="text-slate-400 text-[11px] pl-7">{ag.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attendance & Quorum */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Attendees & Quorum ({selectedMeeting.attendees.length})</span>
                </h3>
              </div>

              {selectedMeeting.attendees.length === 0 ? (
                <p className="text-xs text-slate-400">No attendees recorded.</p>
              ) : (
                <div className="space-y-2">
                  {selectedMeeting.attendees.map((att) => (
                    <div key={att.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-white">{att.name}</p>
                        <p className="text-[11px] text-slate-400">{att.roleOrTitle || 'Resident'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        att.attendanceStatus === 'ATTENDED'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                          : att.attendanceStatus === 'ABSENT'
                          ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {att.attendanceStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Sources & Evidence */}
        {activeDetailTab === 'sources' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Tamper-Evident Evidence Vault</h3>
              <button
                onClick={() => setIsAddNoteOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record New Source Note</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedMeeting.sources.map((src) => (
                <div key={src.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{src.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {src.sourceType}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 text-[11px] text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-800">
                    {src.rawContent}
                  </div>
                  <div className="space-y-1 text-[10px] font-mono text-slate-400 bg-slate-950/50 p-2 rounded">
                    <div>Cryptographic Hash: <span className="text-indigo-300 break-all">{src.contentHash}</span></div>
                    <div>Recorded at: {new Date(src.createdAt).toISOString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Revisions & Audit Timeline */}
        {activeDetailTab === 'revisions' && (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-400" />
              <span>Minutes Revision Audit History</span>
            </h3>

            <div className="space-y-3">
              {selectedMeeting.revisions.map((rev) => (
                <div key={rev.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Revision #{rev.revisionNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      rev.status === 'APPROVED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : rev.status === 'SUPERSEDED'
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-purple-950 text-purple-300 border border-purple-800'
                    }`}>
                      {rev.status}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{rev.executiveSummary}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>Generated: {new Date(rev.createdAt).toLocaleString('en-IN')}</span>
                    {rev.reviewedAt && (
                      <span className="text-emerald-400">Reviewed: {new Date(rev.reviewedAt).toLocaleString('en-IN')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approval Modal Dialog */}
        {showApprovalDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-emerald-400">
                <Shield className="w-6 h-6" />
                <h3 className="text-base font-bold text-white">Formally Approve Minutes of Meeting</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                As Secretary / Chairman, you are certifying these minutes as the true official record of the society. This action will publish the approved record to Society Memory.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Approval Notes / Formal Endorsement</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="e.g. Approved by unanimous managing committee resolution on 15 Oct 2026."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setShowApprovalDialog(false)}
                  disabled={isApproving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveMinutes}
                  disabled={isApproving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30"
                >
                  {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Sign & Approve Official MoM</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal Dialog */}
        {showRejectDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-red-400">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-base font-bold text-white">Request Changes on Draft Minutes</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The minutes will return to editable draft state with your correction notes.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Requested Changes / Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Please clarify vendor quote comparison figures in discussion item 3."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setShowRejectDialog(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectRevision}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500"
                >
                  <span>Submit Changes</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Source Note Modal */}
        {isAddNoteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Record Meeting Notes / Transcript</h3>
                <button onClick={() => setIsAddNoteOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSourceNote} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Source Title</label>
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="e.g. Secretary Notes — Discussion on Rooftop Solar & Dues"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Raw Meeting Discussion Content (Text / Transcript)
                  </label>
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    rows={6}
                    placeholder="Paste verbatim notes, discussion summaries, motions proposed, or attendee remarks..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-[11px] leading-relaxed resize-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddNoteOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNote}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {isSubmittingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Record & Compute Hash</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW: Meetings Directory & List
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Header & Schedule Meeting CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Society Meetings & Minutes (MoM)</h2>
          <p className="text-xs text-slate-400">
            Every discussion becomes an action. Every action gets tracked. Nothing gets forgotten.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'SCHEDULED', 'IN_PROGRESS', 'MINUTES_DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ARCHIVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {st === 'ALL' ? 'All Meetings' : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings by title..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Meetings List */}
      {isLoading ? (
        <div className="min-h-[250px] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-xs text-slate-400">Loading society meetings...</p>
        </div>
      ) : meetingsList.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">No Meetings Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your filters or search terms.'
                : 'Schedule your first managing committee or general body meeting to begin automated tracking.'}
            </p>
          </div>
          {canCreate && !searchQuery && statusFilter === 'ALL' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white inline-flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule First Meeting</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetingsList.map((m) => (
            <div
              key={m.id}
              onClick={() => setSelectedMeetingId(m.id)}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer space-y-3 shadow-md hover:shadow-xl group"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide">
                  {meetingTypeLabel(m.meetingType)}
                </span>
                {statusBadge(m.status)}
              </div>

              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2">
                  {m.title}
                </h3>
                {m.description && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {m.description}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {new Date(m.scheduledStartTime).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {new Date(m.scheduledStartTime).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-slate-500 group-hover:text-indigo-400 font-medium">
                <span>View Details & MoM</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Meeting Modal */}
      <CreateMeetingModal
        societyId={societyId}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(newMeeting) => {
          loadMeetings();
          setSelectedMeetingId(newMeeting.id);
        }}
      />
    </div>
  );
};
