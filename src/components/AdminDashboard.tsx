import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  UserCheck,
  UserX,
  HardDrive,
  Search,
  LogOut,
  Eye,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  X,
  FolderOpen,
  Clock,
  FileText,
} from 'lucide-react';
import type { AdminOverview, AdminStudent, AuditLogEntry, User } from '../types';
import { apiRequest, formatDateTimeTL } from '../utils/api';

interface AdminDashboardProps {
  user: User;
  onLogout: () => Promise<void>;
  onOpenAuthorizedWorkspace: (student: AdminStudent) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: 'Aktibo', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  suspended: { label: 'Sinuspinde', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  inactive: { label: 'Hindi Aktibo', className: 'bg-slate-200 text-slate-700 border-slate-300' },
};

export function AdminDashboard({
  user,
  onLogout,
  onOpenAuthorizedWorkspace,
  onNotify,
}: AdminDashboardProps) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<'students' | 'audit'>('students');

  // Manage Student Modal
  const [selectedStudent, setSelectedStudent] = useState<AdminStudent | null>(null);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'inactive'>('active');
  const [editQuotaMB, setEditQuotaMB] = useState(50);
  const [editFullName, setEditFullName] = useState('');
  const [editStudentNumber, setEditStudentNumber] = useState('');
  const [editCourse, setEditCourse] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Request Access Modal
  const [requestTarget, setRequestTarget] = useState<AdminStudent | null>(null);
  const [reqPerm, setReqPerm] = useState<'read' | 'read_write'>('read');
  const [reqReason, setReqReason] = useState('');
  const [sendingReq, setSendingReq] = useState(false);

  // Delete Student Confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminStudent | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [ovRes, stRes, logRes] = await Promise.all([
        apiRequest<{ overview: AdminOverview }>('/api/admin/overview'),
        apiRequest<{ students: AdminStudent[] }>(`/api/admin/students?${params.toString()}`),
        apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs'),
      ]);
      setOverview(ovRes.overview);
      setStudents(stRes.students);
      setAuditLogs(logRes.logs);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi ma-load ang dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [statusFilter]);

  const openManageModal = (student: AdminStudent) => {
    setSelectedStudent(student);
    setEditStatus(student.status);
    setEditQuotaMB(Math.round(student.storageQuotaMB));
    setEditFullName(student.fullName);
    setEditStudentNumber(student.studentNumber);
    setEditCourse(student.courseSection);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setSavingEdit(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/students/${selectedStudent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          storageQuotaMB: editQuotaMB,
          fullName: editFullName,
          studentNumber: editStudentNumber,
          courseSection: editCourse,
        }),
      });
      onNotify('success', res.message);
      setSelectedStudent(null);
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pag-update.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTarget) return;
    setSendingReq(true);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/students/${requestTarget.id}/request-access`,
        {
          method: 'POST',
          body: JSON.stringify({ permissionLevel: reqPerm, reason: reqReason }),
        }
      );
      onNotify('success', res.message);
      setRequestTarget(null);
      setReqReason('');
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pagpapadala ng kahilingan.');
    } finally {
      setSendingReq(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/students/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      onNotify('success', res.message);
      setDeleteTarget(null);
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pagtanggal.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f8ff] flex flex-col">
      {/* Top Admin Navbar */}
      <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white shadow-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Tintalata • Dashboard ng Tagapangasiwa
              </h1>
              <p className="text-xs text-blue-100">
                Naka-log in bilang: <strong>{user.fullName}</strong> ({user.email})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-4 py-2 text-xs font-semibold text-white transition"
          >
            <LogOut className="h-4 w-4" />
            Mag-log out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Privacy Guarantee Notice */}
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-2xs flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <p className="font-bold text-blue-950 text-sm">
              Patakaran sa Pagkapribado ng Mag-aaral
            </p>
            <p>
              Maaari mong subaybayan ang mga detalye ng pagpaparehistro, katayuan ng account, at
              paggamit ng storage ng bawat mag-aaral.{' '}
              <strong>
                Hindi ipinapakita at hindi maaaring buksan o baguhin ang kanilang mga pribadong
                dokumento at guhit nang walang malinaw na pahintulot mula sa mag-aaral.
              </strong>
            </p>
          </div>
        </div>

        {/* Overview KPIs */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Kabuuang Mag-aaral</p>
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900">
                {overview.totalStudents}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Nakarehistrong account ng mag-aaral
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">Mga Aktibong Account</p>
                <UserCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-emerald-900">
                {overview.activeStudents}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                May {overview.authorizedStudentCount} may pahintulot sa pag-access
              </p>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-rose-700">Sinuspinde / Hindi Aktibo</p>
                <UserX className="h-5 w-5 text-rose-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-rose-900">
                {overview.suspendedStudents + overview.inactiveStudents}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {overview.suspendedStudents} sinuspinde • {overview.inactiveStudents} hindi aktibo
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-700">Kabuuang Storage na Nagagamit</p>
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-blue-950">
                {overview.totalUsedMB.toFixed(2)} MB
              </p>
              <p className="mt-1 text-xs text-slate-500">
                mula sa kabuuang {overview.totalQuotaMB.toFixed(0)} MB • {overview.totalActiveDocs}{' '}
                aktibong file
              </p>
            </div>
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex items-center gap-2 border-b border-blue-200">
          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition ${
              activeTab === 'students'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Mga Nakarehistrong Mag-aaral ({students.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Talaan ng Aktibidad (Audit Log)
          </button>
        </div>

        {activeTab === 'students' ? (
          <div className="space-y-4">
            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadDashboard();
                }}
                className="flex flex-1 max-w-md items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Maghanap ng pangalan, email, ID, o kurso..."
                    className="w-full rounded-xl border border-blue-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Hanapin
                </button>
              </form>

              <div className="flex items-center gap-1.5 rounded-xl bg-white p-1 border border-blue-100">
                {[
                  { id: 'all', label: 'Lahat' },
                  { id: 'active', label: 'Aktibo' },
                  { id: 'suspended', label: 'Sinuspinde' },
                  { id: 'inactive', label: 'Hindi Aktibo' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      setStatusFilter(f.id as 'all' | 'active' | 'suspended' | 'inactive')
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      statusFilter === f.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-blue-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Student Table */}
            <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
              {loading ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Kinukuha ang listahan ng mga mag-aaral...
                </div>
              ) : students.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Walang natagpuang account ng mag-aaral.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-blue-50/80 text-blue-900 font-bold border-b border-blue-100">
                      <tr>
                        <th className="px-4 py-3">Mag-aaral at Pagpaparehistro</th>
                        <th className="px-4 py-3">Katayuan</th>
                        <th className="px-4 py-3">Storage (MB)</th>
                        <th className="px-4 py-3">Mga File (Bilang Lamang)</th>
                        <th className="px-4 py-3">Pagkapribado at Pahintulot</th>
                        <th className="px-4 py-3 text-right">Mga Aksyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => {
                        const badge = STATUS_BADGES[s.status] || STATUS_BADGES.active;
                        const pct =
                          s.storageQuotaBytes > 0
                            ? Math.min(100, (s.storageUsedBytes / s.storageQuotaBytes) * 100)
                            : 0;
                        return (
                          <tr key={s.id} className="hover:bg-blue-50/30">
                            <td className="px-4 py-3.5">
                              <p className="text-sm font-bold text-slate-900">{s.fullName}</p>
                              <p className="text-slate-600">{s.email}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                ID: {s.studentNumber || '—'} • Kurso: {s.courseSection || '—'}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Rehistrado: {formatDateTimeTL(s.createdAt)} • Huling pag-login:{' '}
                                {formatDateTimeTL(s.lastLoginAt)}
                              </p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 min-w-[160px]">
                              <div className="flex justify-between text-[11px] font-semibold text-slate-700 mb-1">
                                <span>{s.storageUsedMB.toFixed(2)} MB</span>
                                <span>/ {s.storageQuotaMB.toFixed(0)} MB</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{ width: `${Math.max(s.storageUsedBytes > 0 ? 3 : 0, pct)}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Natitira: {s.storageRemainingMB.toFixed(2)} MB
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              <p>{s.activeDocCount} dokumento</p>
                              <p>{s.activeFolderCount} folder</p>
                              <p className="text-[11px] text-slate-400">
                                {s.trashDocCount} nasa Basurahan
                              </p>
                            </td>
                            <td className="px-4 py-3.5">
                              {s.authorization.state === 'approved' ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                    <Unlock className="h-3 w-3" />
                                    Pinayagan (
                                    {s.authorization.permissionLevel === 'read_write'
                                      ? 'Basahin at I-edit'
                                      : 'Basahin Lamang'}
                                    )
                                  </span>
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() => onOpenAuthorizedWorkspace(s)}
                                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline"
                                    >
                                      <FolderOpen className="h-3.5 w-3.5" />
                                      Buksan ang Awtorisadong Workspace
                                    </button>
                                  </div>
                                </div>
                              ) : s.authorization.state === 'pending' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                  <Clock className="h-3 w-3" />
                                  Naghihintay ng Apruba
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                  <Lock className="h-3 w-3" />
                                  Pribado (Walang Pahintulot)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openManageModal(s)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Pamahalaan
                                </button>
                                {s.authorization.state !== 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => setRequestTarget(s)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                                    Humiling ng Pahintulot
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(s)}
                                  title="Tanggalin ang Account"
                                  className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs divide-y divide-slate-100">
            {auditLogs.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                Wala pang nakatalang aktibidad sa sistema.
              </p>
            ) : (
              auditLogs.map((l) => (
                <div key={l.id} className="px-5 py-3.5 flex flex-wrap justify-between gap-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{l.details || l.action}</p>
                    <p className="text-slate-500">
                      Kumilos: <strong>{l.actorName}</strong> • Tinukoy: {l.targetName}
                    </p>
                  </div>
                  <span className="text-slate-400">{formatDateTimeTL(l.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Manage Student Account Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
            <div className="flex items-center justify-between bg-blue-700 px-5 py-4 text-white">
              <h3 className="text-base font-bold">Pamahalaan ang Account ng Mag-aaral</h3>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-lg p-1 hover:bg-white/15"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="p-5 space-y-4 text-xs">
              <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3 text-slate-700">
                <p className="font-bold text-blue-950">{selectedStudent.email}</p>
                <p>Nagparehistro: {formatDateTimeTL(selectedStudent.createdAt)}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Buong Pangalan</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Numero ng Mag-aaral
                  </label>
                  <input
                    type="text"
                    value={editStudentNumber}
                    onChange={(e) => setEditStudentNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kurso / Seksyon</label>
                  <input
                    type="text"
                    value={editCourse}
                    onChange={(e) => setEditCourse(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Katayuan ng Account
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as 'active' | 'suspended' | 'inactive')
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="active">Aktibo</option>
                    <option value="suspended">Sinuspinde</option>
                    <option value="inactive">Hindi Aktibo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kapasidad ng Storage (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10240}
                    required
                    value={editQuotaMB}
                    onChange={(e) => setEditQuotaMB(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingEdit ? 'Sine-save...' : 'I-save ang Pagbabago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Access Authorization Modal */}
      {requestTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleRequestAccess}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-blue-100 space-y-4 text-xs"
          >
            <h3 className="text-base font-bold text-slate-900">
              Humiling ng Pahintulot kay {requestTarget.fullName}
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Bilang paggalang sa pagkapribado, makikita muna ng mag-aaral ang kahilingang ito at
              kailangan niya itong aprubahan bago ka makapagbukas ng kanyang mga pribadong file.
            </p>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Hinihiling na Antas ng Pag-access
              </label>
              <select
                value={reqPerm}
                onChange={(e) => setReqPerm(e.target.value as 'read' | 'read_write')}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="read">Basahin Lamang</option>
                <option value="read_write">Basahin at I-edit</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dahilan ng Kahilingan *</label>
              <textarea
                required
                rows={3}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Hal. Pagsusuri ng teknikal na isyu sa iyong kahilingan"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequestTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
              >
                Kanselahin
              </button>
              <button
                type="submit"
                disabled={sendingReq}
                className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              >
                {sendingReq ? 'Ipinapadala...' : 'Ipadala ang Kahilingan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Student Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-rose-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Tanggalin ang Account ng Mag-aaral</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sigurado ka bang nais mong tuluyang tanggalin ang account ni{' '}
              <strong>{deleteTarget.fullName}</strong> ({deleteTarget.email})? Mabubura rin ang
              lahat ng kanyang folder at dokumento.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Kanselahin
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteStudent()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Oo, Tanggalin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
