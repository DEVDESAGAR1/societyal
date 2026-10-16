import React, { useEffect, useState, useCallback } from 'react';
import { useAuth, type UserProfile } from '../auth/AuthContext.tsx';
import {
  ShieldCheck,
  Activity,
  Users,
  Server,
  Database,
  Building,
  RefreshCw,
  UserX,
  UserCheck,
  AlertTriangle,
  Clock,
  Cpu
} from 'lucide-react';
import { SocietyDashboard } from './society/SocietyDashboard.tsx';

interface AdminOverviewData {
  platform: {
    name: string;
    milestone: string;
    status: string;
    database: {
      status: string;
      latencyMs: number;
    };
  };
  metrics: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    disabledUsers: number;
  };
  societyAdministration: {
    status: string;
    totalSocieties: number;
    notice: string;
  };
}

interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastSignInAt: string | null;
  createdAt: string;
}

export const AdminDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [overviewRes, usersRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (overviewRes.ok) {
        const ovData = await overviewRes.json();
        setOverview(ovData);
      }

      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsersList(uData.users || []);
      }
    } catch (err: unknown) {
      setActionMessage({ type: 'error', text: 'Failed to load administrator data' });
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const handleStatusChange = async (targetUserId: string, newStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') => {
    if (!token) return;
    setIsUpdating(targetUserId);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountStatus: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ type: 'error', text: data.error || 'Failed to update status' });
      } else {
        setActionMessage({
          type: 'success',
          text: `User ${data.user.email} updated to ${newStatus}`,
        });
        // Update local list
        setUsersList(prev =>
          prev.map(u => (u.id === targetUserId ? { ...u, accountStatus: newStatus } : u))
        );
      }
    } catch (err: unknown) {
      setActionMessage({ type: 'error', text: 'Network error updating user status' });
    } finally {
      setIsUpdating(null);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header Banner */}
      <div className="bg-gradient-to-r from-purple-950/60 via-slate-900 to-slate-900 border border-purple-800/50 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border-2 border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">Platform Super Admin Console</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/60">
                Product Authority
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Logged in as <span className="text-purple-300 font-medium">{user.email}</span> (Internal UUID: <code className="text-xs">{user.id}</code>)
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchAdminData()}
          disabled={isLoading}
          className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between shadow-lg ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/70 text-emerald-200 border border-emerald-800'
              : 'bg-rose-950/70 text-rose-200 border border-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="font-semibold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics & Health Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Platform Status</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-white">
              {overview?.platform.status || 'OPERATIONAL'}
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-xs text-slate-500 mt-1">Milestone: {overview?.platform.milestone || 'M2'}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Cloud SQL DB</span>
            <Database className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-white">
              {overview?.platform.database.status || 'CONFIGURED'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Latency: {overview?.platform.database.latencyMs || 0}ms
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Users</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">
              {overview?.metrics.totalUsers ?? usersList.length}
            </span>
          </div>
          <p className="text-xs text-emerald-400 mt-1">
            {overview?.metrics.activeUsers ?? usersList.length} Active Accounts
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Suspended</span>
            <UserX className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">
              {overview?.metrics.suspendedUsers ?? 0}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Accounts with blocked access</p>
        </div>
      </div>

      {/* Housing Society Workspaces & Tenant Administration */}
      <div className="pt-2">
        <SocietyDashboard />
      </div>

      {/* User Directory Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Platform User Directory ({usersList.length})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified accounts registered via Google sign-in.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Internal UUID</th>
                <th className="px-6 py-3">Last Active</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {usersList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No users loaded or registered yet.
                  </td>
                </tr>
              ) : (
                usersList.map((u) => {
                  const isSelf = u.id === user.id;
                  const isSuspended = u.accountStatus === 'SUSPENDED';

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 flex items-center space-x-3">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt={u.fullName}
                            className="w-8 h-8 rounded-full object-cover border border-slate-700"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300">
                            {u.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white flex items-center space-x-1.5">
                            <span>{u.fullName}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-normal">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-slate-400 text-[11px]">{u.email}</p>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            u.accountStatus === 'ACTIVE'
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                              : u.accountStatus === 'SUSPENDED'
                              ? 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                              : 'bg-rose-950/60 text-rose-400 border border-rose-800/80'
                          }`}
                        >
                          {u.accountStatus}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-400 text-[11px]">
                        {u.id}
                      </td>

                      <td className="px-6 py-4 text-slate-400 text-[11px]">
                        {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : 'Never'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isSelf ? (
                          <span className="text-[11px] text-slate-500 italic">Self (Protected)</span>
                        ) : isSuspended ? (
                          <button
                            onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                            disabled={isUpdating === u.id}
                            className="inline-flex items-center px-2.5 py-1 rounded bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 text-xs font-medium border border-emerald-700/50 transition-colors disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5 mr-1" />
                            <span>Reactivate</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(u.id, 'SUSPENDED')}
                            disabled={isUpdating === u.id}
                            className="inline-flex items-center px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800/50 text-rose-300 text-xs font-medium border border-rose-700/50 transition-colors disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5 mr-1" />
                            <span>Suspend</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
