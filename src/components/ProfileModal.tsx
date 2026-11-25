import { useState } from 'react';
import { User as UserIcon, X } from 'lucide-react';
import type { User } from '../types';
import { apiRequest } from '../utils/api';

interface ProfileModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onUpdated: (user: User, message: string) => void;
}

export function ProfileModal({ isOpen, user, onClose, onUpdated }: ProfileModalProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [studentNumber, setStudentNumber] = useState(user.studentNumber);
  const [courseSection, setCourseSection] = useState(user.courseSection);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiRequest<{ user: User; message: string }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          studentNumber,
          courseSection,
          currentPassword: newPassword ? currentPassword : undefined,
          newPassword: newPassword || undefined,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      onUpdated(res.user, res.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi na-update ang profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
        <div className="flex items-center justify-between bg-blue-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            <h3 className="text-base font-bold">Profile ng Account</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            className="rounded-lg p-1 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-medium text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="text"
              disabled
              value={user.email}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Buong Pangalan</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Numero ng Mag-aaral
              </label>
              <input
                type="text"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kurso / Seksyon</label>
              <input
                type="text"
                value={courseSection}
                onChange={(e) => setCourseSection(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <p className="font-bold text-slate-800">Palitan ang Password (Opsyonal)</p>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Kasalukuyang password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Bagong password (min. 8 karakter, titik at numero)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
            >
              Kanselahin
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Sine-save...' : 'I-save ang Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
