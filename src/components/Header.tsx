import React from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { ShieldCheck, UserCheck, LogOut, Building2, ShieldAlert } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, isSuperAdmin, signOut } = useAuth();

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">SocietyFix AI</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                M2
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Operating Platform for Indian Housing Societies
            </p>
          </div>
        </div>

        {/* User Identity & Actions */}
        {user ? (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-3 text-right">
              <div>
                <p className="text-sm font-medium text-white flex items-center justify-end space-x-1.5">
                  <span>{user.fullName}</span>
                  {isSuperAdmin ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/50">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                      Super Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/50">
                      <UserCheck className="w-3.5 h-3.5 mr-1" />
                      Resident
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{user.email}</p>
              </div>
            </div>

            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-9 h-9 rounded-full border-2 border-indigo-500/30 object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm text-slate-200">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
            )}

            <button
              onClick={() => signOut()}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            Sign In Required
          </div>
        )}
      </div>
    </header>
  );
};
