import { useState } from 'react';
import { User as UserIcon, Save, Menu, Bell, LogOut } from 'lucide-react';
import type { NotificationSettings, User } from '../types';
import { apiRequest, formatDateTimeTL } from '../utils/api';
import { PasswordInput } from './PasswordInput';

interface ProfilePageViewProps {
  user: User;
  onOpenSidebar: () => void;
  onUpdated: (user: User, message: string) => void;
  onLogout: () => Promise<void>;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  notifyAutoSave: true,
  notifyStorageAlerts: true,
  notifyShareAlerts: true,
  notifyPrivacyRequests: true,
  defaultDownloadFormat: 'docx',
};

export function ProfilePageView({
  user,
  onOpenSidebar,
  onUpdated,
  onLogout,
}: ProfilePageViewProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [studentNumber, setStudentNumber] = useState(user.studentNumber);
  const [courseSection, setCourseSection] = useState(user.courseSection);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settings, setSettings] = useState<NotificationSettings>(
    user.notificationSettings || DEFAULT_SETTINGS
  );
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
          notificationSettings: settings,
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
      <header className="border-b border-blue-100 bg-white px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
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
            <h2 className="text-lg font-extrabold text-slate-900">
              Profile, Mga Setting, at Abiso
            </h2>
            <p className="text-xs text-slate-500">
              Pamahalaan ang iyong impormasyon sa account, mga abiso, at seguridad.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
        >
          <LogOut className="h-4 w-4" />
          Mag-log out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Personal Info & Password */}
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
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Kasalukuyang password"
                  showLeadingIcon={false}
                />
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Bagong password (min. 8 karakter)"
                  showLeadingIcon={false}
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
                {saving ? 'Sine-save...' : 'I-save ang Profile at Settings'}
              </button>
            </div>
          </div>

          {/* Right: Notification Settings & Account Info */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Bell className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Mga Setting ng Abiso</h3>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  {
                    key: 'notifyAutoSave' as const,
                    title: 'Abiso sa Pag-save ng Dokumento',
                    desc: 'Ipakita ang abiso kapag manu-manong nai-save o na-update ang file.',
                  },
                  {
                    key: 'notifyStorageAlerts' as const,
                    title: 'Babala sa Kapasidad ng Storage',
                    desc: 'Paalalahanan kapag malapit nang mapuno ang iyong MB storage.',
                  },
                  {
                    key: 'notifyShareAlerts' as const,
                    title: 'Abiso sa Ibinahaging Dokumento',
                    desc: 'Ipaalam kapag may bagong pagbabahagi ng file.',
                  },
                  {
                    key: 'notifyPrivacyRequests' as const,
                    title: 'Abiso sa Kahilingan ng Pahintulot',
                    desc: 'Ipakita agad kapag humiling ang Admin ng suportang pag-access.',
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3 hover:bg-blue-50/40 cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{opt.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[opt.key]}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 rounded accent-blue-600"
                    />
                  </label>
                ))}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Default na Format sa Pag-download
                  </label>
                  <select
                    value={settings.defaultDownloadFormat}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultDownloadFormat: e.target.value as NotificationSettings['defaultDownloadFormat'],
                      }))
                    }
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="docx">Microsoft Word (.docx)</option>
                    <option value="pdf">PDF Dokumento (.pdf)</option>
                    <option value="doc">Word Classic (.doc)</option>
                    <option value="html">Web Page (.html)</option>
                    <option value="txt">Payak na Teksto (.txt)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-2xs space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
                Detalye ng Account
              </h3>
              <dl className="space-y-2.5 text-xs">
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
          </div>
        </form>
      </div>
    </div>
  );
}
