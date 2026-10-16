import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { UserCheck, KeyRound, CheckCircle2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { SocietyDashboard } from './society/SocietyDashboard.tsx';

export const UserDashboard: React.FC = () => {
  const { user, isSuperAdmin, bootstrapAsAdmin } = useAuth();
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [bootstrapMessage, setBootstrapMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setBootstrapMessage(null);

    const res = await bootstrapAsAdmin(bootstrapSecret);
    setIsSubmitting(false);

    if (res.success) {
      setBootstrapMessage({ type: 'success', text: res.message });
      setBootstrapSecret('');
    } else {
      setBootstrapMessage({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              className="w-16 h-16 rounded-2xl border-2 border-indigo-500/40 object-cover shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border-2 border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-400">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl font-bold text-white tracking-tight">{user.fullName}</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {user.accountStatus}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">{user.email}</p>
            <p className="text-xs text-slate-500 font-mono mt-1">Internal UUID: {user.id}</p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end">
          <span className="text-xs text-slate-400">Platform Identity</span>
          <span className="mt-1 inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/50">
            <UserCheck className="w-4 h-4 mr-1.5" />
            Standard Resident User
          </span>
          {user.lastSignInAt && (
            <span className="text-xs text-slate-500 mt-2 flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1" />
              Last login: {new Date(user.lastSignInAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Milestone M3: Housing Society Workspaces & Tenant Governance */}
      <div className="pt-2">
        <SocietyDashboard />
      </div>

      {/* Super Admin Bootstrap Panel */}
      {!isSuperAdmin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md">
          <div className="flex items-start space-x-3">
            <KeyRound className="w-5 h-5 text-purple-400 shrink-0 mt-1" />
            <div className="w-full">
              <h3 className="text-base font-semibold text-white">Platform Super Admin Provisioning</h3>
              <p className="text-xs text-slate-400 mt-1">
                If you are a designated platform administrator, you can elevate your account by entering the server-configured bootstrap secret, or automatically if your email is listed in <code className="text-purple-300 bg-purple-950/50 px-1 py-0.5 rounded">SUPER_ADMIN_EMAILS</code>.
              </p>

              {bootstrapMessage && (
                <div
                  className={`mt-4 p-3 rounded-lg text-xs flex items-center space-x-2 ${
                    bootstrapMessage.type === 'success'
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                  }`}
                >
                  {bootstrapMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{bootstrapMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleBootstrap} className="mt-4 flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  placeholder="Enter SUPER_ADMIN_BOOTSTRAP_SECRET (optional if email is in allowlist)"
                  value={bootstrapSecret}
                  onChange={(e) => setBootstrapSecret(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Verifying...' : 'Elevate to Super Admin'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
