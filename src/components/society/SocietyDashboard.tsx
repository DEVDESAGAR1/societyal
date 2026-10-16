import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  Shield,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Plus,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Settings,
  History,
  Home,
  Mail,
  MapPin,
  ExternalLink,
  ChevronRight,
  Check,
  X,
  UserCheck,
  Brain,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { Society, SocietyMembership, SocietyAuditLog } from '../../db/schema.ts';
import type { SocietyRole, MembershipStatus } from '../../society/societyRbac.ts';
import { CreateSocietyModal } from './CreateSocietyModal.tsx';
import { JoinSocietyModal } from './JoinSocietyModal.tsx';
import { SocietyMemoryView } from './SocietyMemoryView.tsx';
import { SocietyMeetingsView } from './SocietyMeetingsView.tsx';

interface EnrichedMember {
  id: string;
  societyId: string;
  userId: string;
  role: SocietyRole;
  status: MembershipStatus;
  unitNumber: string | null;
  wing: string | null;
  memberType: string;
  notes: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    accountStatus: string;
  };
}

export const SocietyDashboard: React.FC = () => {
  const { getIdToken, user, isSuperAdmin } = useAuth();

  // State
  const [activeSocieties, setActiveSocieties] = useState<Array<{ society: Society; membership: SocietyMembership }>>([]);
  const [pendingRequests, setPendingRequests] = useState<Array<{ society: Society; membership: SocietyMembership }>>([]);
  const [selectedSocietyId, setSelectedSocietyId] = useState<string | null>(null);
  const [currentSociety, setCurrentSociety] = useState<Society | null>(null);
  const [currentMembership, setCurrentMembership] = useState<SocietyMembership | null>(null);

  // Tabs
  type TabType = 'directory' | 'meetings' | 'memory' | 'requests' | 'governance' | 'audit' | 'settings' | 'discover';
  const [activeTab, setActiveTab] = useState<TabType>('directory');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [targetJoinSociety, setTargetJoinSociety] = useState<Society | null>(null);

  // Data lists
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [membershipRequests, setMembershipRequests] = useState<EnrichedMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<SocietyAuditLog[]>([]);
  const [discoverableList, setDiscoverableList] = useState<Array<Society & { userMembershipStatus: MembershipStatus | null }>>([]);

  // Filters & Loading
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load user's societies and pending requests
  const loadUserSocieties = useCallback(async (selectId?: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/societies/my', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setActiveSocieties(data.activeSocieties || []);
        setPendingRequests(data.pendingRequests || []);

        if (data.activeSocieties && data.activeSocieties.length > 0) {
          const match = selectId
            ? data.activeSocieties.find((s: any) => s.society.id === selectId)
            : data.activeSocieties[0];
          const chosen = match || data.activeSocieties[0];
          setSelectedSocietyId(chosen.society.id);
          setCurrentSociety(chosen.society);
          setCurrentMembership(chosen.membership);
        } else {
          setSelectedSocietyId(null);
          setCurrentSociety(null);
          setCurrentMembership(null);
          setActiveTab('discover');
        }
      }
    } catch (err) {
      console.error('Failed to load user societies', err);
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadUserSocieties();
  }, [loadUserSocieties]);

  // Load active tab data whenever selected society or tab changes
  const loadTabData = useCallback(async () => {
    if (!selectedSocietyId && activeTab !== 'discover') return;
    setIsTabLoading(true);
    setActionMessage(null);

    try {
      const token = await getIdToken();

      if (activeTab === 'discover') {
        const res = await fetch('/api/societies', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setDiscoverableList(data.societies || []);
      } else if (activeTab === 'directory' && selectedSocietyId) {
        const res = await fetch(`/api/societies/${selectedSocietyId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMembers(data.members || []);
      } else if (activeTab === 'requests' && selectedSocietyId) {
        const res = await fetch(`/api/societies/${selectedSocietyId}/requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMembershipRequests(data.requests || []);
      } else if (activeTab === 'governance' && selectedSocietyId) {
        const res = await fetch(`/api/societies/${selectedSocietyId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMembers(data.members || []);
      } else if (activeTab === 'audit' && selectedSocietyId) {
        const res = await fetch(`/api/societies/${selectedSocietyId}/audit-logs?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error('Failed to load tab data', err);
    } finally {
      setIsTabLoading(false);
    }
  }, [selectedSocietyId, activeTab, getIdToken]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  // Switch active society
  const handleSelectSociety = (societyId: string) => {
    const found = activeSocieties.find(s => s.society.id === societyId);
    if (found) {
      setSelectedSocietyId(found.society.id);
      setCurrentSociety(found.society);
      setCurrentMembership(found.membership);
      setActiveTab('directory');
    }
  };

  // Review a membership request (Approve or Reject)
  const handleReviewRequest = async (
    membershipId: string,
    decision: 'APPROVE' | 'REJECT',
    role: SocietyRole = 'RESIDENT'
  ) => {
    if (!selectedSocietyId) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${selectedSocietyId}/requests/${membershipId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review request');

      setActionMessage({
        type: 'success',
        text: `Request ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`,
      });
      loadTabData();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Change a member's role
  const handleChangeRole = async (membershipId: string, newRole: SocietyRole) => {
    if (!selectedSocietyId) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${selectedSocietyId}/members/${membershipId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change role');

      setActionMessage({ type: 'success', text: `Role updated to ${newRole}.` });
      loadTabData();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Suspend or Revoke a member
  const handleUpdateStatus = async (membershipId: string, newStatus: MembershipStatus) => {
    if (!selectedSocietyId) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${selectedSocietyId}/members/${membershipId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update member status');

      setActionMessage({ type: 'success', text: `Member status updated to ${newStatus}.` });
      loadTabData();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const userRole = currentMembership?.role as SocietyRole | undefined;
  const isSocietyAdmin = userRole === 'ADMIN' || userRole === 'CHAIRMAN' || isSuperAdmin;

  const roleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-700/60">Secretary / Admin</span>;
      case 'CHAIRMAN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/60">Chairman</span>;
      case 'TREASURER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">Treasurer</span>;
      case 'COMMITTEE_MEMBER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60">Committee</span>;
      case 'VENDOR':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">Vendor</span>;
      case 'STAFF':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">Staff</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-700/60">Resident</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-xs text-slate-400">Loading housing societies and tenant authorization...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Pending Membership Requests Banner */}
      {pendingRequests.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-4 sm:p-5 shadow-lg">
          <div className="flex items-start space-x-3.5">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-200">
                You have {pendingRequests.length} pending society membership request{pendingRequests.length > 1 ? 's' : ''}
              </h4>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {pendingRequests.map(({ society, membership }) => (
                  <div key={membership.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-amber-900/40 text-xs">
                    <p className="font-semibold text-white truncate">{society.name}</p>
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mt-1">
                      <span>{membership.unitNumber ? `Flat ${membership.unitNumber}` : membership.memberType}</span>
                      <span className="text-amber-400 font-medium">Under Review</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Society Selection Bar & Quick Actions */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Active Societies Selector */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap pl-1">
            My Societies:
          </span>
          {activeSocieties.map(({ society, membership }) => {
            const isSelected = society.id === selectedSocietyId;
            return (
              <button
                key={society.id}
                onClick={() => handleSelectSociety(society.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center space-x-2 whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{society.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
                }`}>
                  {membership.role}
                </span>
              </button>
            );
          })}

          {activeSocieties.length === 0 && (
            <span className="text-xs text-slate-500 italic">No approved societies yet</span>
          )}
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setActiveTab('discover')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
              activeTab === 'discover'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Find & Join Society</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Society</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {selectedSocietyId && currentSociety ? (
        <div className="space-y-6">
          {/* Society Banner Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <h1 className="text-2xl font-bold text-white tracking-tight">{currentSociety.name}</h1>
                  <span className="text-xs font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-0.5 rounded-lg">
                    {currentSociety.slug}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
                    {currentSociety.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                  <span className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    {currentSociety.address}, {currentSociety.city}, {currentSociety.state} - {currentSociety.postalCode}
                  </span>
                  {currentSociety.contactEmail && (
                    <span className="flex items-center">
                      <Mail className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      {currentSociety.contactEmail}
                    </span>
                  )}
                </div>
              </div>

              {/* User Membership & Identity Context */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block">Your Role</span>
                  <div className="flex items-center space-x-2">
                    {roleBadge(currentMembership?.role || 'RESIDENT')}
                    {currentMembership?.unitNumber && (
                      <span className="text-xs font-semibold text-slate-300">
                        Flat {currentMembership.unitNumber}
                      </span>
                    )}
                  </div>
                </div>
                <div className="border-l border-slate-800 pl-4 space-y-0.5">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block">Status</span>
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Approved Member
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mt-8 border-t border-slate-800/80 pt-4 flex items-center space-x-1 sm:space-x-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('directory')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap ${
                  activeTab === 'directory'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Member Directory</span>
              </button>

              <button
                onClick={() => setActiveTab('meetings')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'meetings'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                    : 'text-cyan-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Meetings & MoM</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 font-bold">
                  M5
                </span>
              </button>

              <button
                onClick={() => setActiveTab('memory')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                  activeTab === 'memory'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                    : 'text-indigo-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Brain className="w-4 h-4 text-indigo-400" />
                <span>Society Memory & AI</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-bold">
                  M4
                </span>
              </button>

              {isSocietyAdmin && (
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === 'requests'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Join Requests</span>
                  {membershipRequests.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
                      {membershipRequests.length}
                    </span>
                  )}
                </button>
              )}

              {isSocietyAdmin && (
                <button
                  onClick={() => setActiveTab('governance')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === 'governance'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Roles & Governance</span>
                </button>
              )}

              {isSocietyAdmin && (
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === 'audit'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Security Audit Logs</span>
                </button>
              )}
            </div>
          </div>

          {/* Action Notification Banner */}
          {actionMessage && (
            <div
              className={`p-4 rounded-xl text-xs flex items-center justify-between ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800 text-rose-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                {actionMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{actionMessage.text}</span>
              </div>
              <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab: Society Meetings & MoM (Milestone M5) */}
          {activeTab === 'meetings' && currentSociety && (
            <SocietyMeetingsView
              societyId={currentSociety.id}
              userRole={(currentMembership?.role as SocietyRole) || 'RESIDENT'}
            />
          )}

          {/* Tab: Society Memory & AI Secretary (Milestone M4) */}
          {activeTab === 'memory' && currentSociety && (
            <SocietyMemoryView
              society={currentSociety}
              userRole={(currentMembership?.role as SocietyRole) || 'RESIDENT'}
              isSuperAdmin={Boolean(isSuperAdmin)}
            />
          )}

          {/* Tab 1: Member Directory */}
          {activeTab === 'directory' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search members by name or unit number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="ADMIN">Secretary / Admin</option>
                    <option value="CHAIRMAN">Chairman</option>
                    <option value="TREASURER">Treasurer</option>
                    <option value="COMMITTEE_MEMBER">Committee</option>
                    <option value="RESIDENT">Resident</option>
                    <option value="VENDOR">Vendor</option>
                    <option value="STAFF">Staff</option>
                  </select>
                </div>
              </div>

              {isTabLoading ? (
                <div className="py-12 flex items-center justify-center space-x-2 text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  <span>Loading directory...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {members
                    .filter((m) => {
                      const matchesSearch =
                        !searchQuery ||
                        m.user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        m.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (m.unitNumber && m.unitNumber.toLowerCase().includes(searchQuery.toLowerCase()));
                      const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
                      return matchesSearch && matchesRole;
                    })
                    .map((m) => (
                      <div
                        key={m.id}
                        className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-colors flex items-start space-x-3.5"
                      >
                        {m.user.avatarUrl ? (
                          <img
                            src={m.user.avatarUrl}
                            alt={m.user.fullName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-indigo-400 shrink-0">
                            {m.user.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-white truncate">{m.user.fullName}</p>
                            {roleBadge(m.role)}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{m.user.email}</p>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-2">
                            {m.unitNumber && (
                              <span className="flex items-center">
                                <Home className="w-3 h-3 mr-1" />
                                Flat {m.unitNumber} {m.wing ? `(${m.wing})` : ''}
                              </span>
                            )}
                            <span>•</span>
                            <span className="capitalize">{m.memberType.toLowerCase().replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Pending Join Requests */}
          {activeTab === 'requests' && isSocietyAdmin && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Pending Membership Applications</h3>
                  <p className="text-xs text-slate-400">Review applicants verifying residency and assigning appropriate roles</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-800">
                  {membershipRequests.length} Pending Review
                </span>
              </div>

              {isTabLoading ? (
                <div className="py-12 flex items-center justify-center space-x-2 text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  <span>Loading pending requests...</span>
                </div>
              ) : membershipRequests.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No pending membership requests awaiting review.
                </div>
              ) : (
                <div className="space-y-3">
                  {membershipRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white text-xs">{req.user.fullName}</span>
                          <span className="text-[11px] text-slate-400">({req.user.email})</span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-slate-400">
                          {req.unitNumber && (
                            <span className="text-indigo-400 font-medium">Flat {req.unitNumber}</span>
                          )}
                          <span className="capitalize">{req.memberType.toLowerCase().replace('_', ' ')}</span>
                          {req.notes && <span className="italic text-slate-500">"{req.notes}"</span>}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleReviewRequest(req.id, 'REJECT')}
                          className="px-3 py-1.5 rounded-lg border border-rose-900/60 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 text-xs font-medium transition-colors flex items-center space-x-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          onClick={() => handleReviewRequest(req.id, 'APPROVE', 'RESIDENT')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve as Resident</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Roles & Governance */}
          {activeTab === 'governance' && isSocietyAdmin && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Society Role & Access Governance</h3>
                <p className="text-xs text-slate-400">Assign managing committee responsibilities and manage membership statuses</p>
              </div>

              <div className="divide-y divide-slate-800/80">
                {members.map((m) => (
                  <div key={m.id} className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white">{m.user.fullName}</span>
                        {roleBadge(m.role)}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{m.user.email} • Flat {m.unitNumber || 'N/A'}</p>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      {/* Role Selector */}
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value as SocietyRole)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="ADMIN">Secretary / Admin</option>
                        <option value="CHAIRMAN">Chairman</option>
                        <option value="TREASURER">Treasurer</option>
                        <option value="COMMITTEE_MEMBER">Committee</option>
                        <option value="RESIDENT">Resident</option>
                        <option value="VENDOR">Vendor</option>
                        <option value="STAFF">Staff</option>
                      </select>

                      {/* Status Action */}
                      {m.status === 'APPROVED' ? (
                        <button
                          onClick={() => handleUpdateStatus(m.id, 'SUSPENDED')}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-950/40 border border-amber-900/40 transition-colors"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateStatus(m.id, 'APPROVED')}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-950/40 border border-emerald-900/40 transition-colors"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Security Audit Trail */}
          {activeTab === 'audit' && isSocietyAdmin && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Immutable Security Audit Trail</h3>
                <p className="text-xs text-slate-400">All administrative operations, role modifications, and membership approvals are permanently recorded</p>
              </div>

              {auditLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No audit log entries recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs flex items-start justify-between gap-4 font-mono">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-indigo-400">{log.action}</span>
                          <span className="text-slate-500">[{log.targetType}]</span>
                        </div>
                        {Boolean(log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata as object).length > 0) && (
                          <p className="text-[11px] text-slate-400 mt-1 font-sans">
                            {JSON.stringify(log.metadata)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Discover Societies Tab (Available globally or when no society is selected) */}
      {(!selectedSocietyId || activeTab === 'discover') && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Find & Join a Housing Society</h2>
              <p className="text-xs text-slate-400">Browse verified residential societies and request membership with your flat or villa number</p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors flex items-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Register New Society</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoverableList.map((soc) => (
              <div
                key={soc.id}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-900/60 px-2 py-0.5 rounded">
                      {soc.slug}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded bg-slate-800">
                      {soc.societyType.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">{soc.name}</h3>
                  <p className="text-xs text-slate-400 flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-1 text-slate-500 shrink-0" />
                    {soc.city}, {soc.state}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-900 flex items-center justify-between">
                  {soc.userMembershipStatus === 'APPROVED' ? (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Approved Member
                    </span>
                  ) : soc.userMembershipStatus === 'PENDING' ? (
                    <span className="text-xs text-amber-400 font-semibold flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      Pending Approval
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setTargetJoinSociety(soc);
                        setIsJoinOpen(true);
                      }}
                      className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-colors flex items-center justify-center space-x-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Request to Join</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateSocietyModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSocietyCreated={(newId) => loadUserSocieties(newId)}
      />

      <JoinSocietyModal
        isOpen={isJoinOpen}
        onClose={() => {
          setIsJoinOpen(false);
          setTargetJoinSociety(null);
        }}
        society={targetJoinSociety}
        onRequestSubmitted={() => loadUserSocieties()}
      />
    </div>
  );
};
