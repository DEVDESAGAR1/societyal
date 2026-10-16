import React from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { Shield, Sparkles, CheckCircle2, AlertTriangle, FileText, Bot, Users } from 'lucide-react';

export const SignedOutView: React.FC = () => {
  const { signIn, isLoading, error, isConfigured, clearError } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full">
        {/* Configuration Notice if Firebase credentials missing */}
        {!isConfigured && (
          <div className="mb-8 p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200 shadow-lg">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h4 className="font-semibold text-amber-300">Firebase Authentication Configuration Required</h4>
                <p className="mt-1 text-amber-300/80">
                  To enable real Google sign-in, provide your Firebase Web SDK credentials in your environment (<code className="bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-200">.env</code>):
                </p>
                <div className="mt-2 bg-slate-900/90 p-3 rounded-lg font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
                  VITE_FIREBASE_API_KEY="AIzaSy..."<br />
                  VITE_FIREBASE_AUTH_DOMAIN="societyfix-dev.firebaseapp.com"<br />
                  VITE_FIREBASE_PROJECT_ID="societyfix-dev"<br />
                  VITE_FIREBASE_APP_ID="1:..."
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 p-4 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-200 flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-rose-300">Sign-In Notice</h4>
                <p className="text-sm text-rose-200/90 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              onClick={clearError}
              className="text-xs text-rose-400 hover:text-rose-200 font-semibold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous Secretary & Operating Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Every discussion becomes an action.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
              Nothing gets forgotten.
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-400">
            The intelligent operating system for Indian Cooperative Housing Societies (CHS), RWAs, and Apartment Owner Associations.
          </p>
        </div>

        {/* Sign In Action Card */}
        <div className="mt-10 max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white text-center">
            Sign In to SocietyFix
          </h2>
          <p className="mt-1 text-sm text-slate-400 text-center">
            Authenticate using your verified Google account.
          </p>

          <div className="mt-6">
            <button
              onClick={() => signIn()}
              disabled={isLoading || !isConfigured}
              className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {/* Google G SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isLoading ? 'Verifying Credentials...' : 'Sign in with Google'}</span>
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500">
              By signing in, your identity is verified with Google. No client-side passwords are ever stored.
            </p>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Society Memory</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Instant answers grounded in past AGM resolutions, bye-laws, and committee discussions via dense vector search.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Commitment Tracking</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Decisions made during meetings automatically convert to tracked action items with photographic proof requirements.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Multi-Tenant Governance</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Strict isolation per housing society. Indian Cooperative Societies Act and DPDP Act compliance built-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
