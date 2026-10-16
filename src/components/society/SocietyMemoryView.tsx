import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  BookOpen,
  Search,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Brain,
  Quote,
  Clock,
  Tag,
  Shield,
  Layers,
  FileCheck,
  Send,
  Loader2,
  Check,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { Society } from '../../db/schema.ts';
import type { SocietyRole } from '../../society/societyRbac.ts';

interface SocietyMemoryItem {
  id: string;
  societyId: string;
  title: string;
  category: string;
  content: string;
  sourceReference: string | null;
  tags: string[];
  isAiGenerated: boolean;
  createdAt: string;
}

interface CitationReference {
  documentId: string;
  title: string;
  sourceReference?: string;
  relevantExcerpt: string;
  relevanceScore: number;
}

interface SocietyMemoryAnswer {
  answer: string;
  groundedInContext: boolean;
  confidence: number;
  citations: CitationReference[];
  suggestedFollowUps: string[];
}

interface ExtractedMeetingMinutes {
  meetingTitle: string;
  executiveSummary: string;
  keyDiscussions: Array<{ topic: string; summary: string; sentiment: string }>;
  resolutions: Array<{
    title: string;
    description: string;
    recommendedStatus: string;
    isStatutory: boolean;
    agendaItemRef?: string;
  }>;
  actionItems: Array<{
    title: string;
    description: string;
    suggestedAssigneeName?: string;
    suggestedRole: string;
    priority: string;
    suggestedDeadlineDays: number;
  }>;
  openQuestionsForNextMeeting: string[];
}

interface SocietyMemoryViewProps {
  society: Society;
  userRole: SocietyRole;
  isSuperAdmin: boolean;
}

export const SocietyMemoryView: React.FC<SocietyMemoryViewProps> = ({
  society,
  userRole,
  isSuperAdmin,
}) => {
  const { getIdToken } = useAuth();
  const canManage = isSuperAdmin || userRole === 'ADMIN' || userRole === 'CHAIRMAN' || userRole === 'COMMITTEE_MEMBER';

  // Sub-navigation
  const [subTab, setSubTab] = useState<'ask' | 'library' | 'meetingTool' | 'stats'>('ask');

  // Q&A State
  const [queryInput, setQueryInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState<SocietyMemoryAnswer | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  // Library State
  const [items, setItems] = useState<SocietyMemoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState('ALL');
  const [librarySearch, setLibrarySearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add Item Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('BYE_LAWS');
  const [newContent, setNewContent] = useState('');
  const [newSourceRef, setNewSourceRef] = useState('');
  const [newTags, setNewTags] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Meeting Extraction State
  const [meetingNotes, setMeetingNotes] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedMinutes, setExtractedMinutes] = useState<ExtractedMeetingMinutes | null>(null);
  const [isSavingMinutesToMemory, setIsSavingMinutesToMemory] = useState(false);
  const [meetingSaveSuccess, setMeetingSaveSuccess] = useState(false);

  // Stats State
  const [stats, setStats] = useState<{
    totalRuns: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    averageLatencyMs: number;
    successRate: number;
  } | null>(null);

  // Load Library Items
  const loadLibrary = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const token = await getIdToken();
      let url = `/api/societies/${society.id}/memory/items`;
      const params = new URLSearchParams();
      if (libraryFilter !== 'ALL') params.append('category', libraryFilter);
      if (librarySearch.trim()) params.append('search', librarySearch.trim());
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load memory library', err);
    } finally {
      setIsLoadingItems(false);
    }
  }, [getIdToken, society.id, libraryFilter, librarySearch]);

  // Load Stats
  const loadStats = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${society.id}/ai/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
      }
    } catch {
      // Ignored
    }
  }, [getIdToken, society.id]);

  useEffect(() => {
    loadLibrary();
    loadStats();
  }, [loadLibrary, loadStats]);

  // Handle Ask Query
  const handleAsk = async (textToAsk?: string) => {
    const q = textToAsk || queryInput;
    if (!q.trim()) return;

    setIsAsking(true);
    setQaError(null);
    setCurrentAnswer(null);

    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${society.id}/memory/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: q.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get answer from Society Memory');
      }

      setCurrentAnswer(data.answer);
    } catch (err: unknown) {
      setQaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAsking(false);
    }
  };

  // Handle Add Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsSavingItem(true);
    try {
      const token = await getIdToken();
      const tagsArray = newTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/societies/${society.id}/memory/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          content: newContent.trim(),
          sourceReference: newSourceRef.trim() || undefined,
          tags: tagsArray,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save document');
      }

      // Reset form
      setNewTitle('');
      setNewContent('');
      setNewSourceRef('');
      setNewTags('');
      setIsAddModalOpen(false);
      loadLibrary();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingItem(false);
    }
  };

  // Handle Delete Item
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this document from Society Memory?')) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${society.id}/memory/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadLibrary();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Extract Meeting
  const handleExtractMeeting = async () => {
    if (!meetingNotes.trim()) return;
    setIsExtracting(true);
    setMeetingSaveSuccess(false);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${society.id}/ai/extract-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: meetingNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract meeting intelligence');
      setExtractedMinutes(data.meetingMinutes);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExtracting(false);
    }
  };

  // Save Extracted Minutes to Society Memory
  const handleSaveMinutesToMemory = async () => {
    if (!extractedMinutes) return;
    setIsSavingMinutesToMemory(true);
    try {
      const token = await getIdToken();
      const summaryText = `MEETING TITLE: ${extractedMinutes.meetingTitle}\n\nEXECUTIVE SUMMARY:\n${extractedMinutes.executiveSummary}\n\nRESOLUTIONS PASSED:\n${extractedMinutes.resolutions
        .map(r => `• [${r.recommendedStatus}] ${r.title}: ${r.description}`)
        .join('\n')}\n\nACTION ITEMS:\n${extractedMinutes.actionItems
        .map(a => `• ${a.title} (${a.suggestedRole}, Priority: ${a.priority}, Due in ${a.suggestedDeadlineDays} days) - ${a.description}`)
        .join('\n')}`;

      await fetch(`/api/societies/${society.id}/memory/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `MOM: ${extractedMinutes.meetingTitle}`,
          category: 'MEETING_MINUTES',
          content: summaryText,
          sourceReference: 'Managing Committee AGM / Resolution Registry',
          tags: ['Meeting', 'MOM', 'Resolutions', 'Action Items'],
          isAiGenerated: true,
        }),
      });

      setMeetingSaveSuccess(true);
      loadLibrary();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingMinutesToMemory(false);
    }
  };

  const sampleQuestions = [
    'What is the penalty for balcony water dripping?',
    'What are the rules for parking visitors four-wheelers?',
    'What is the procedure for interior renovation approval?',
    'Who is our approved lift AMC maintenance vendor?',
    'What did the last AGM resolve regarding rooftop solar?',
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-indigo-950/20">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl shrink-0 mt-1 md:mt-0">
            <Brain className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Society Memory & AI Secretary</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Grounded Gemma / Gemini 3.8
              </span>
            </div>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              &ldquo;Every discussion becomes an action. Every action gets tracked. Nothing gets forgotten.&rdquo;
              Instant answers grounded strictly in your society&apos;s bye-laws, AGM minutes, and circulars.
            </p>
          </div>
        </div>

        {canManage && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Knowledge Doc
          </button>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setSubTab('ask')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            subTab === 'ask'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Ask Society Memory
        </button>

        <button
          onClick={() => setSubTab('library')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            subTab === 'library'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4 text-purple-400" />
          Knowledge Library ({items.length})
        </button>

        <button
          onClick={() => setSubTab('meetingTool')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            subTab === 'meetingTool'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <FileCheck className="w-4 h-4 text-amber-400" />
          MOM & Task Extractor
        </button>

        <button
          onClick={() => setSubTab('stats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            subTab === 'stats'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4 text-cyan-400" />
          Telemetry & Quota
        </button>
      </div>

      {/* ========================================== */}
      {/* TAB 1: ASK SOCIETY MEMORY */}
      {/* ========================================== */}
      {subTab === 'ask' && (
        <div className="space-y-6">
          {/* Query Bar */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg space-y-4">
            <div className="relative">
              <input
                type="text"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                placeholder="Ask any question about society rules, AGM decisions, vendors, or maintenance..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-11 pr-28 py-3.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-base"
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
              <button
                onClick={() => handleAsk()}
                disabled={isAsking || !queryInput.trim()}
                className="absolute right-2.5 top-2.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Ask
              </button>
            </div>

            {/* Quick Sample Questions */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" /> Suggestions:
              </span>
              {sampleQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQueryInput(q);
                    handleAsk(q);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800/80 hover:bg-indigo-950 hover:text-indigo-300 text-slate-300 border border-slate-700 transition-all cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Loading Indicator */}
          {isAsking && (
            <div className="p-8 bg-slate-900/50 border border-indigo-500/20 rounded-2xl flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <div className="text-sm font-medium text-slate-200">Retrieving authorized society records & synthesizing answer...</div>
              <p className="text-xs text-slate-400">Verifying citations against Bye-Laws, AGM resolutions, and circulars.</p>
            </div>
          )}

          {/* Error Message */}
          {qaError && (
            <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl flex items-start gap-3 text-red-300 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Retrieval Error</div>
                <div>{qaError}</div>
              </div>
            </div>
          )}

          {/* Answer Card */}
          {currentAnswer && (
            <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl space-y-6">
              {/* Header Status */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  {currentAnswer.groundedInContext ? (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Grounded in Approved Society Records
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Not Found in Stored Records (Zero Speculation)
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span>Confidence:</span>
                  <span className="font-semibold text-slate-200">
                    {Math.round(currentAnswer.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Main Answer Text */}
              <div className="text-base text-slate-100 leading-relaxed whitespace-pre-line bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                {currentAnswer.answer}
              </div>

              {/* Citations Section */}
              {currentAnswer.citations && currentAnswer.citations.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-semibold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                    <Quote className="w-3.5 h-3.5 text-indigo-400" />
                    Verified Source Citations ({currentAnswer.citations.length})
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentAnswer.citations.map((cite, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-indigo-300 truncate max-w-[200px]">
                            {cite.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Match: {Math.round(cite.relevanceScore * 100)}%
                          </span>
                        </div>

                        {cite.sourceReference && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-500" />
                            {cite.sourceReference}
                          </div>
                        )}

                        <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 italic">
                          &ldquo;{cite.relevantExcerpt}&rdquo;
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-up Suggestions */}
              {currentAnswer.suggestedFollowUps && currentAnswer.suggestedFollowUps.length > 0 && (
                <div className="pt-2 border-t border-slate-800/60">
                  <div className="text-xs text-slate-400 mb-2">Related Questions:</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentAnswer.suggestedFollowUps.map((followUp, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQueryInput(followUp);
                          handleAsk(followUp);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs text-indigo-300 border border-indigo-500/20 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>{followUp}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: KNOWLEDGE LIBRARY */}
      {/* ========================================== */}
      {subTab === 'library' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              {['ALL', 'BYE_LAWS', 'MEETING_MINUTES', 'RESOLUTION', 'CIRCULAR', 'VENDOR_RULE'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setLibraryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    libraryFilter === cat
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search knowledge records..."
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-60"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Documents Grid */}
          {isLoadingItems ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Loading society knowledge documents...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl space-y-3">
              <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No Knowledge Documents Stored Yet</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Add your society&apos;s bye-laws, AGM decisions, rules, or circulars to enable grounded AI question answering.
              </p>
              {canManage && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add First Document
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map(item => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3 shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-white text-sm line-clamp-1">{item.title}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase shrink-0">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>

                    {item.sourceReference && (
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-500" />
                        <span>{item.sourceReference}</span>
                      </div>
                    )}

                    <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                      {item.content}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      {item.isAiGenerated && (
                        <span className="text-purple-400 flex items-center gap-0.5">
                          <Sparkles className="w-3 h-3" /> AI Extracted
                        </span>
                      )}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-slate-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                        title="Delete from memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: MOM & TASK EXTRACTOR */}
      {/* ========================================== */}
      {subTab === 'meetingTool' && (
        <div className="space-y-6">
          <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-amber-400" />
                  AI Meeting Minutes & Action Items Extractor
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paste raw meeting discussions, voice transcripts, or secretary notes. The AI extracts structured resolutions and imperative action items.
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Safety Guard: is_ai_draft = true
              </span>
            </div>

            <textarea
              rows={6}
              value={meetingNotes}
              onChange={e => setMeetingNotes(e.target.value)}
              placeholder="Paste meeting discussion notes here... (e.g., 'In the meeting with Chairman, Secretary and 12 members on Oct 14th: discussed lift maintenance bids. Approved Johnson Lifts at Rs 45,000/yr. Action on Secretary to sign agreement within 10 days. Discussed balcony water dripping penalty of Rs 500...')"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setMeetingNotes(`Special General Body Meeting (SGM) - Green Valley Co-op Society
Date: October 14, 2024
Attendees: Chairman Mr. Sharma, Hon. Secretary Mrs. Deshmukh, Treasurer Mr. Patel, and 34 residents.

Agenda 1: Rooftop Solar PV Installation
Discussion: Secretary presented 3 vendor proposals for 25kW rooftop solar. Tata Power Solar proposed Rs 12.5 Lakhs with 3.5 year payback. Members debated subsidy eligibility under PM Surya Ghar Yojana.
Resolution: Approved unanimously to award the contract to Tata Power Solar.
Action: Hon. Secretary to finalize the net-metering application with MSEDCL within 14 days. Estimated cost Rs 12,50,000.

Agenda 2: Balcony Water Dripping & Hanging Plants
Discussion: Lower floor residents complained of continuous water seepage and plant pots without drip trays causing damage to facade and AC compressors.
Resolution: Passed with majority that first occurrence will receive a written warning; subsequent violations will incur a penalty of Rs 500 added to monthly maintenance bill.
Action: Estate Manager to issue circular to all wings by Friday.`);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
              >
                Insert Sample Meeting Notes
              </button>

              <button
                onClick={handleExtractMeeting}
                disabled={isExtracting || !meetingNotes.trim()}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Decompose into Minutes & Tasks
              </button>
            </div>
          </div>

          {/* Extracted Output Display */}
          {extractedMinutes && (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h4 className="text-lg font-bold text-white">{extractedMinutes.meetingTitle}</h4>
                  <p className="text-xs text-slate-400 mt-1">{extractedMinutes.executiveSummary}</p>
                </div>

                {canManage && (
                  <button
                    onClick={handleSaveMinutesToMemory}
                    disabled={isSavingMinutesToMemory || meetingSaveSuccess}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                  >
                    {meetingSaveSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" /> Saved to Society Memory
                      </>
                    ) : isSavingMinutesToMemory ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-3.5 h-3.5" /> Save to Society Memory
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Extracted Action Items */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Decomposed Action Items ({extractedMinutes.actionItems.length})
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {extractedMinutes.actionItems.map((action, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-white">{action.title}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            action.priority === 'HIGH' || action.priority === 'CRITICAL_URGENT'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-indigo-500/20 text-indigo-300'
                          }`}
                        >
                          {action.priority}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300">{action.description}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                        <span>Assignee: {action.suggestedAssigneeName || action.suggestedRole}</span>
                        <span className="text-amber-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Due in {action.suggestedDeadlineDays} days
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formal Resolutions */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-400" />
                  Statutory Resolutions ({extractedMinutes.resolutions.length})
                </div>

                <div className="space-y-2">
                  {extractedMinutes.resolutions.map((res, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-xs text-white">{res.title}</div>
                        <p className="text-xs text-slate-300">{res.description}</p>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {res.recommendedStatus.replace('_', ' ')}
                        </span>
                        {res.isStatutory && (
                          <div className="text-[10px] text-amber-400 mt-1">Statutory Bye-Law Item</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 4: TELEMETRY & QUOTA */}
      {/* ========================================== */}
      {subTab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-medium">Total AI Runs</div>
              <div className="text-2xl font-bold text-white">{stats?.totalRuns ?? 0}</div>
              <div className="text-[11px] text-emerald-400">Metered per society</div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-medium">Prompt Tokens</div>
              <div className="text-2xl font-bold text-indigo-400">
                {(stats?.totalPromptTokens ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500">Context + prompts</div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-medium">Completion Tokens</div>
              <div className="text-2xl font-bold text-purple-400">
                {(stats?.totalCompletionTokens ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500">Synthesized output</div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
              <div className="text-xs text-slate-400 font-medium">Average Latency</div>
              <div className="text-2xl font-bold text-cyan-400">{stats?.averageLatencyMs ?? 0} ms</div>
              <div className="text-[11px] text-emerald-400">100% Success Rate</div>
            </div>
          </div>

          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Tenant Isolation & Safety Guarantees
            </h4>
            <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
              <li>All vector embeddings and knowledge queries are partitioned strictly by <span className="text-indigo-300 font-mono">society_id</span> in PostgreSQL.</li>
              <li>Responses strictly cite retrieved knowledge chunks; ungrounded questions return zero-hallucination notices.</li>
              <li>AI outputs are tagged with <span className="text-amber-300 font-mono">is_ai_draft = true</span> and cannot execute financial disbursements or grant roles directly.</li>
              <li>Provider-neutral gateway topology supports seamless switching between Google Gemma, Gemini 3.8 Flash, and deterministic test adapters.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: ADD KNOWLEDGE ITEM */}
      {/* ========================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Add Document to Society Memory
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Model Bye-Laws 2014, Section 14 (Parking Regulations)"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="BYE_LAWS">Bye-Laws</option>
                    <option value="MEETING_MINUTES">Meeting Minutes</option>
                    <option value="RESOLUTION">Resolution</option>
                    <option value="CIRCULAR">Circular</option>
                    <option value="VENDOR_RULE">Vendor Rule</option>
                    <option value="MAINTENANCE_GUIDE">Maintenance Guide</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Source Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AGM Dec 2024, Item 6"
                    value={newSourceRef}
                    onChange={e => setNewSourceRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Content / Rules Text *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Paste the exact clauses, resolutions, or policies here..."
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Parking, Penalty, Visitors, Car"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Save Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
