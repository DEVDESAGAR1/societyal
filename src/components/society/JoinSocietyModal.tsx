import React, { useState } from 'react';
import { X, UserPlus, Home, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.tsx';
import type { Society } from '../../db/schema.ts';

interface JoinSocietyModalProps {
  isOpen: boolean;
  onClose: () => void;
  society: Society | null;
  onRequestSubmitted: () => void;
}

export const JoinSocietyModal: React.FC<JoinSocietyModalProps> = ({
  isOpen,
  onClose,
  society,
  onRequestSubmitted,
}) => {
  const { getIdToken, user } = useAuth();
  const [unitNumber, setUnitNumber] = useState('');
  const [wing, setWing] = useState('');
  const [memberType, setMemberType] = useState<'OWNER' | 'TENANT' | 'FAMILY_MEMBER' | 'VENDOR_REPRESENTATIVE' | 'FACILITY_STAFF'>('OWNER');
  const [notes, setNotes] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !society) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const token = await getIdToken();
      const res = await fetch(`/api/societies/${society.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          unitNumber: unitNumber.trim() || undefined,
          wing: wing.trim() || undefined,
          memberType,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit membership request');
      }

      onRequestSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Join Society</h3>
              <p className="text-xs text-slate-400 font-medium truncate max-w-xs">{society.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px]">Applicant:</span>
              <span className="font-semibold text-white">{user?.fullName}</span> ({user?.email})
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[10px]">Location:</span>
              <span>{society.city}, {society.state}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 flex items-center">
                <Home className="w-3.5 h-3.5 mr-1 text-slate-400" />
                <span>Flat / Unit No.</span>
              </label>
              <input
                type="text"
                placeholder="e.g. A-402, Villa 12"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Wing / Tower / Block</label>
              <input
                type="text"
                placeholder="e.g. Tower 2, Wing C"
                value={wing}
                onChange={(e) => setWing(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Occupancy Type *</label>
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="OWNER">Resident Flat Owner</option>
              <option value="TENANT">Tenant / Renter</option>
              <option value="FAMILY_MEMBER">Family Member of Owner</option>
              <option value="VENDOR_REPRESENTATIVE">Authorized Vendor Representative</option>
              <option value="FACILITY_STAFF">Facility / Security Staff</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Verification Note for Managing Committee</label>
            <textarea
              rows={2}
              placeholder="e.g. Moved in on March 2026. Registered sale deed in hand."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Join Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
