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
  LayoutDashboard,
  Menu,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import type {
  AdminOverview,
  AdminStudent,
  AuditLogEntry,
  PasswordResetRequest,
  User,
} from '../types';
import { apiRequest, formatDateTimeTL } from '../utils/api';
import { TintalataLogo } from './TintalataLogo';

interface AdminDashboardProps {
  user: User;
  onLogout: () => Promise<void>;
  onOpenAuthorizedWorkspace: (student: AdminStudent) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type AdminSection = 'overview' | 'students' | 'storage' | 'resets' | 'audit';

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
  const [section, setSection] = useState<AdminSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [storageMode, setStorageMode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'inactive'>(
    'all'
  );

  // Manage Student Modal
  const [selectedStudent, setSelectedStudent] = useState<AdminStudent | null>(null);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'inactive'>('active');
  const [editQuotaMB, setEditQuotaMB] = useState(50);
  const [editFullName, setEditFullName] = useState('');
  const [editStudentNumber, setEditStudentNumber] = useState('');
  const [editCourse, setEditCourse] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Request Access Modal
  const [requestTarget, setRequestTarget] = useState<AdminStudent | null>(null);
  const [reqPerm, setReqPerm] = useState<'read' | 'read_write'>('read');
  const [reqReason, setReqReason] = useState('');
  const [sendingReq, setSendingReq] = useState(false);

  // Password Reset Modal
  const [resetTarget, setResetTarget] = useState<PasswordResetRequest | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resolvingReset, setResolvingReset] = useState(false);

  // Delete Student Confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminStudent | null>(null);

  // Create Student Modal (saves to DB & links to Admin account)
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newStudentNum, setNewStudentNum] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newQuotaMB, setNewQuotaMB] = useState(50);
  const [creatingStudent, setCreatingStudent] = useState(false);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [ovRes, stRes, logRes, rstRes, hlthRes] = await Promise.all([
        apiRequest<{ overview: AdminOverview }>('/api/admin/overview'),
        apiRequest<{ students: AdminStudent[] }>(`/api/admin/students?${params.toString()}`),
        apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs'),
        apiRequest<{ requests: PasswordResetRequest[] }>('/api/admin/password-resets'),
        apiRequest<{ storageMode?: string }>('/api/health').catch(() => ({ storageMode: '' })),
      ]);
      setOverview(ovRes.overview);
      setStudents(stRes.students);
      setAuditLogs(logRes.logs);
      setResetRequests(rstRes.requests);
      setStorageMode(hlthRes.storageMode || '');
    } catch (err) {
      if (!silent) {
        onNotify('error', err instanceof Error ? err.message : 'Hindi ma-load ang dashboard.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [statusFilter, section, search]);

  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState === 'visible') {
        void loadDashboard({ silent: true });
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadDashboard({ silent: true });
      }
    }, 10000);
    window.addEventListener('focus', refreshNow);
    document.addEventListener('visibilitychange', refreshNow);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshNow);
      document.removeEventListener('visibilitychange', refreshNow);
    };
  }, [statusFilter, search, section]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingStudent(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newName,
          email: newEmail,
          studentNumber: newStudentNum,
          courseSection: newCourse,
          password: newPassword,
          storageQuotaMB: newQuotaMB,
        }),
      });
      onNotify('success', res.message);
      setCreateOpen(false);
      setNewName('');
      setNewEmail('');
      setNewStudentNum('');
      setNewCourse('');
      setNewPassword('');
      setNewQuotaMB(50);
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi nagawa ang account.');
    } finally {
      setCreatingStudent(false);
    }
  };

  const openManageModal = (student: AdminStudent) => {
    setSelectedStudent(student);
    setEditStatus(student.status);
    setEditQuotaMB(Math.round(student.storageQuotaMB));
    setEditFullName(student.fullName);
    setEditStudentNumber(student.studentNumber);
    setEditCourse(student.courseSection);
    setEditNewPassword('');
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
          newPassword: editNewPassword || undefined,
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

  const handleResolveReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResolvingReset(true);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/password-resets/${resetTarget.id}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'reset', newPassword: tempPassword }),
        }
      );
      onNotify('success', res.message);
      setResetTarget(null);
      setTempPassword('');
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pag-reset ng password.');
    } finally {
      setResolvingReset(false);
    }
  };

  const handleDismissReset = async (id: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/password-resets/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action: 'dismiss' }),
      });
      onNotify('info', res.message);
      await loadDashboard();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'May error sa pagsasara.');
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

  const pendingResetsCount = resetRequests.filter((r) => r.status === 'pending').length;

  const navClass = (active: boolean) =>
    `w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
      active ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:bg-blue-50'
    }`;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="bg-gradient-to-b from-blue-900 via-blue-800 to-blue-700 p-4 text-white border-b border-blue-800/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <TintalataLogo size="sm" variant="light" />
            <div>
              <h1 className="text-base font-extrabold leading-none">Tintalata</h1>
              <p className="text-[11px] text-blue-100 mt-0.5">Panel ng Tagapangasiwa</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Isara ang Sidebar"
            className="lg:hidden rounded-lg p-1 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 border border-white/15">
          <p className="text-xs font-bold truncate">{user.fullName}</p>
          <p className="text-[10px] text-blue-100 truncate">{user.email}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5 border-r border-blue-100">
        <div>
          <p className="px-2 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
            Pamamahala
          </p>
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setSection('overview');
                setSidebarOpen(false);
              }}
              className={navClass(section === 'overview')}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="h-4 w-4" />
                Buod ng Sistema
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSection('students');
                setSidebarOpen(false);
              }}
              className={navClass(section === 'students')}
            >
              <span className="flex items-center gap-2.5">
                <Users className="h-4 w-4" />
                Mga Mag-aaral
              </span>
              <span className="text-[11px] opacity-80">{students.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSection('storage');
                setSidebarOpen(false);
              }}
              className={navClass(section === 'storage')}
            >
              <span className="flex items-center gap-2.5">
                <HardDrive className="h-4 w-4" />
                Pamamahala ng Storage
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSection('resets');
                setSidebarOpen(false);
              }}
              className={navClass(section === 'resets')}
            >
              <span className="flex items-center gap-2.5">
                <KeyRound className="h-4 w-4" />
                Pag-reset ng Password
              </span>
              {pendingResetsCount > 0 && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                  {pendingResetsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSection('audit');
                setSidebarOpen(false);
              }}
              className={navClass(section === 'audit')}
            >
              <span className="flex items-center gap-2.5">
                <Clock className="h-4 w-4" />
                Talaan ng Aktibidad
              </span>
            </button>
          </nav>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-[11px] text-slate-700 space-y-1.5">
          <p className="font-bold text-blue-950 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            Proteksyon sa Pagkapribado
          </p>
          <p className="leading-relaxed">
            Ang mga dokumento at guhit ng mag-aaral ay pribado maliban kung may aprubadong
            pahintulot.
          </p>
        </div>
      </div>

      <div className="border-t border-blue-100 p-3.5">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          Mag-log out
        </button>
      </div>
    </div>
  );

  const sectionTitles: Record<AdminSection, { title: string; subtitle: string }> = {
    overview: {
      title: 'Buod ng Sistema at Katayuan',
      subtitle: 'Pangkalahatang bilang ng mga nakarehistrong mag-aaral at paggamit ng storage.',
    },
    students: {
      title: 'Mga Nakarehistrong Account ng Mag-aaral',
      subtitle: 'Pamahalaan ang katayuan, impormasyon, kapasidad, at pahintulot ng pag-access.',
    },
    storage: {
      title: 'Pamamahala ng Storage ng Buong Sistema',
      subtitle: 'Subaybayan at itakda ang kapasidad sa MB para sa bawat mag-aaral.',
    },
    resets: {
      title: 'Mga Kahilingan sa Pag-reset ng Password',
      subtitle: 'Magtalaga ng pansamantalang password para sa mga mag-aaral na nakalimot ng password.',
    },
    audit: {
      title: 'Talaan ng Aktibidad sa Seguridad',
      subtitle: 'Kasaysayan ng pagpaparehistro, pagbabago ng account, at awtorisadong suporta.',
    },
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f8ff]">
      <aside className="hidden lg:block w-72 shrink-0 h-full">{sidebarContent}</aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-72 max-w-[85vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {/* Top Desktop Bar */}
        <header className="bg-gradient-to-b from-blue-900 via-blue-800 to-blue-700 border-b border-blue-800/50 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buksan ang Sidebar"
              className="lg:hidden rounded-xl border border-white/25 bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                {sectionTitles[section].title}
              </h2>
              <p className="text-xs text-blue-100">{sectionTitles[section].subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-blue-900 shadow-sm hover:bg-blue-50 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Bagong Account ng Mag-aaral
            </button>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/25 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              I-refresh ang Datos
            </button>
          </div>
        </header>

        {/* Full-Area Main Panel */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {storageMode === 'sqlite-ephemeral' && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
              <p className="font-extrabold text-sm">
                Paalala sa Cloud Database (Vercel Pansamantalang Storage)
              </p>
              <p className="mt-1 leading-relaxed">
                Kasalukuyang gumagamit ng pansamantalang <code>/tmp</code> SQLite ang server na
                ito. Upang hindi mabura ang mga account, password, at dokumento sa pagitan ng mga
                Vercel instance, ikonekta ang isang PostgreSQL database (hal. Neon / Vercel
                Postgres) at itakda ang <code>POSTGRES_URL</code> o <code>DATABASE_URL</code> at{' '}
                <code>SESSION_SECRET</code> sa Vercel Environment Variables.
              </p>
            </div>
          )}
          {section === 'overview' && (
            <>
              {overview && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-100">Kabuuang Mag-aaral</p>
                      <Users className="h-5 w-5 text-blue-100" />
                    </div>
                    <p className="mt-2 text-3xl font-extrabold">{overview.totalStudents}</p>
                    <p className="mt-1 text-xs text-blue-100">Nakarehistrong account</p>
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
                      {overview.authorizedStudentCount} may pahintulot sa pag-access
                    </p>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-rose-700">
                        Sinuspinde / Hindi Aktibo
                      </p>
                      <UserX className="h-5 w-5 text-rose-600" />
                    </div>
                    <p className="mt-2 text-3xl font-extrabold text-rose-900">
                      {overview.suspendedStudents + overview.inactiveStudents}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {overview.suspendedStudents} sinuspinde • {overview.inactiveStudents} hindi
                      aktibo
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-700">
                        Kabuuang Storage (MB)
                      </p>
                      <HardDrive className="h-5 w-5 text-blue-600" />
                    </div>
                    <p className="mt-2 text-3xl font-extrabold text-blue-950">
                      {overview.totalUsedMB.toFixed(2)} MB
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      mula sa {overview.totalQuotaMB.toFixed(0)} MB • {overview.totalActiveDocs}{' '}
                      aktibong dokumento
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
                  <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3.5 flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Kamakailang Nagparehistrong Mag-aaral
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSection('students')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      Tingnan Lahat
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {students.slice(0, 6).map((s) => {
                      const badge = STATUS_BADGES[s.status] || STATUS_BADGES.active;
                      return (
                        <div
                          key={s.id}
                          className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-blue-50/30"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{s.fullName}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {s.email} • {s.courseSection || 'Walang seksyon'}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                    {students.length === 0 && (
                      <p className="p-6 text-center text-xs text-slate-500">
                        Wala pang nakarehistrong mag-aaral.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
                  <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3.5 flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Kamakailang Aktibidad sa Seguridad
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSection('audit')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      Tingnan Lahat
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {auditLogs.slice(0, 6).map((l) => (
                      <div key={l.id} className="px-5 py-3 text-xs flex justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{l.details || l.action}</p>
                          <p className="text-slate-500">Ni: {l.actorName}</p>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatDateTimeTL(l.createdAt)}
                        </span>
                      </div>
                    ))}
                    {auditLogs.length === 0 && (
                      <p className="p-6 text-center text-xs text-slate-500">
                        Wala pang aktibidad sa talaan.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'students' && (
            <div className="space-y-4">
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
                                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Naka-link sa: {s.linkedAdminName || user.fullName}
                                </span>
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
                                    style={{
                                      width: `${Math.max(s.storageUsedBytes > 0 ? 3 : 0, pct)}%`,
                                    }}
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
          )}

          {section === 'storage' && (
            <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
              <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Distribusyon ng Storage Bawat Mag-aaral
                </h3>
                {overview && (
                  <span className="text-xs font-bold text-blue-800">
                    Kabuuang Nagamit: {overview.totalUsedMB.toFixed(2)} MB /{' '}
                    {overview.totalQuotaMB.toFixed(0)} MB
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {students.map((s) => {
                  const pct =
                    s.storageQuotaBytes > 0
                      ? Math.min(100, (s.storageUsedBytes / s.storageQuotaBytes) * 100)
                      : 0;
                  return (
                    <div
                      key={s.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-blue-50/30"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {s.fullName}{' '}
                            <span className="text-xs font-normal text-slate-500">({s.email})</span>
                          </p>
                          <span className="text-xs font-bold text-blue-800 shrink-0">
                            {s.storageUsedMB.toFixed(2)} / {s.storageQuotaMB.toFixed(0)} MB
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{
                              width: `${Math.max(s.storageUsedBytes > 0 ? 3 : 0, pct)}%`,
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Natitira: {s.storageRemainingMB.toFixed(2)} MB • {s.activeDocCount}{' '}
                          aktibo • {s.trashDocCount} nasa Basurahan
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openManageModal(s)}
                        className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100"
                      >
                        Baguhin ang Kapasidad
                      </button>
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <p className="p-8 text-center text-xs text-slate-500">
                    Wala pang account ng mag-aaral.
                  </p>
                )}
              </div>
            </div>
          )}

          {section === 'resets' && (
            <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs divide-y divide-slate-100">
              {resetRequests.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-500">
                  Walang kahilingan sa pag-reset ng password sa ngayon.
                </p>
              ) : (
                resetRequests.map((r) => (
                  <div
                    key={r.id}
                    className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-blue-50/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{r.fullName}</p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            r.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.status === 'pending'
                            ? 'Nakabinbin'
                            : r.status === 'resolved'
                              ? 'Na-reset na'
                              : 'Isinara'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {r.email} • ID: {r.studentNumber || '—'} • Kurso: {r.courseSection || '—'}
                      </p>
                      <p className="text-xs text-slate-500">Tala: {r.reason}</p>
                      <p className="text-[11px] text-slate-400">
                        Hiniling noong: {formatDateTimeTL(r.createdAt)}
                      </p>
                    </div>

                    {r.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(r);
                            setTempPassword('');
                          }}
                          className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          Magtalaga ng Bagong Password
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismissReset(r.id)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Isara
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'audit' && (
            <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs divide-y divide-slate-100">
              {auditLogs.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-500">
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
        </div>
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
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Magtalaga ng Bagong Password (Opsyonal)
                  </label>
                  <input
                    type="text"
                    minLength={8}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Iwanang blangko kung hindi papalitan (min. 8 karakter)"
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
              <label className="block font-semibold text-slate-700 mb-1">
                Dahilan ng Kahilingan *
              </label>
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

      {/* Resolve Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleResolveReset}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-blue-100 space-y-4 text-xs"
          >
            <h3 className="text-base font-bold text-slate-900">
              I-reset ang Password ni {resetTarget.fullName}
            </h3>
            <p className="text-slate-600">
              Maglagay ng pansamantalang password (hindi bababa sa 8 karakter) para sa account na{' '}
              <strong>{resetTarget.email}</strong>.
            </p>
            <input
              type="text"
              required
              minLength={8}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="Ilagay ang pansamantalang password"
              className="w-full rounded-xl border border-blue-200 px-3.5 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
              >
                Kanselahin
              </button>
              <button
                type="submit"
                disabled={resolvingReset}
                className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              >
                {resolvingReset ? 'Inia-apply...' : 'I-reset ang Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Student Account Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
            <div className="flex items-center justify-between bg-blue-700 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                <h3 className="text-base font-bold">Gumawa ng Account ng Mag-aaral</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1 hover:bg-white/15"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateStudent} className="p-5 space-y-3.5 text-xs">
              <p className="text-slate-600">
                Ang bagong account ay awtomatikong mase-save sa database, maiuugnay sa iyong
                Admin Dashboard, at agad makakapag-log in sa pahina ng Pag-log in.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buong Pangalan *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Hal. Ana Santos"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="ana.santos@paaralan.ph"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Numero ng Mag-aaral
                  </label>
                  <input
                    type="text"
                    value={newStudentNum}
                    onChange={(e) => setNewStudentNum(e.target.value)}
                    placeholder="2026-0200"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kurso / Seksyon</label>
                  <input
                    type="text"
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    placeholder="BSIS 1-A"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Paunang Password *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 karakter"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
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
                    value={newQuotaMB}
                    onChange={(e) => setNewQuotaMB(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  disabled={creatingStudent}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {creatingStudent ? 'Ginagawa...' : 'Gawin at I-save ang Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-rose-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Tanggalin ang Account ng Mag-aaral
            </h3>
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
