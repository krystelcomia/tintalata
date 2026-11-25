import { useState } from 'react';
import { User as UserIcon, Save, Menu } from 'lucide-react';
import type { User } from '../types';
import { apiRequest, formatDateTimeTL } from '../utils/api';

interface ProfilePageViewProps {
  user: User;
  onOpenSidebar: () => void;
  onUpdated: (user: User, message: string) => void;
}

export function ProfilePageView({ user, onOpenSidebar, onUpdated }: ProfilePageViewProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [studentNumber, setStudentNumber] = useState(user.studentNumber);
  const [courseSection, setCourseSection] = useState(user.courseSection);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi na-update ang profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#f4f8ff]">
      <header className="border-b border-blue-100 bg-white px-5 sm:px-6 py-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Buksan ang Sidebar"
          className="lg:hidden rounded-xl border border-blue-100 bg-blue-50 p-2 text-blue-700"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
          <UserIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Profile at Seguridad ng Account</h2>
          <p className="text-xs text-slate-500">
            I-update ang iyong personal na detalye ng pagpaparehistro at password.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          <div className="lg:col-span-7 rounded-2xl border border-blue-100 bg-white p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
              Impormasyon ng Mag-aaral
            </h3>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <input
                type="text"
                disabled
                value={user.email}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Buong Pangalan</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Numero ng Mag-aaral
                </label>
                <input
                  type="text"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kurso / Seksyon
                </label>
                <input
                  type="text"
                  value={courseSection}
                  onChange={(e) => setCourseSection(e.target.value)}
                  className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                Palitan ang Password (Opsyonal)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Kasalukuyang password"
                  className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Bagong password (min. 8 karakter)"
                  className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Sine-save...' : 'I-save ang mga Pagbabago'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-blue-100 bg-white p-6 shadow-2xs space-y-4 h-fit">
            <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
              Mga Detalye ng Pagpaparehistro
            </h3>
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Katayuan ng Account</dt>
                <dd className="font-bold text-emerald-700">Aktibo</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Petsa ng Pagpaparehistro</dt>
                <dd className="font-semibold text-slate-800">
                  {formatDateTimeTL(user.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Huling Pag-login</dt>
                <dd className="font-semibold text-slate-800">
                  {formatDateTimeTL(user.lastLoginAt)}
                </dd>
              </div>
            </dl>
          </div>
        </form>
      </div>
    </div>
  );
}
