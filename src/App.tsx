/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import { Header } from './components/Header.tsx';
import { SignedOutView } from './components/SignedOutView.tsx';
import { UserDashboard } from './components/UserDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { Loader2 } from 'lucide-react';

const MainContent: React.FC = () => {
  const { user, isSuperAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Verifying authentication session...</p>
      </div>
    );
  }

  if (!user) {
    return <SignedOutView />;
  }

  return isSuperAdmin ? <AdminDashboard /> : <UserDashboard />;
};

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
        <Header />
        <main className="flex-1">
          <MainContent />
        </main>
        <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© 2026 SocietyFix AI — Autonomous Executive Secretary for Housing Societies</span>
            <div className="flex items-center space-x-3">
              <span className="text-slate-400 font-medium">Milestone M5 Active (Meeting Capture & MoM)</span>
              <span>•</span>
              <span className="text-indigo-400">Multi-Tenant Tenant Isolation</span>
            </div>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
