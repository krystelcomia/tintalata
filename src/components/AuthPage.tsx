import { useEffect, useState } from 'react';
import {
  LogIn,
  UserPlus,
  Mail,
  User as UserIcon,
  Hash,
  GraduationCap,
  KeyRound,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Search,
  Copy,
  Check,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { PasswordResetStatus, StorageSummary, User } from '../types';
import { TintalataLogo } from './TintalataLogo';
import { PasswordInput } from './PasswordInput';
import authBg from '../assets/auth-bg.jpg';

export type AuthRouteMode =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-status'
  | 'reset-password';

interface ResetStatusResult {
  referenceNumber: string;
  status: PasswordResetStatus;
  statusMessage: string;
  submittedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
  emailDeliveryStatus: string | null;
}

interface ResetTokenInfo {
  referenceNumber: string;
  fullName: string;
  emailMasked: string;
  expiresAt: string;
}

function formatDateTimePH(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

interface AuthPageProps {
  mode: AuthRouteMode;
  onNavigateMode: (next: AuthRouteMode) => void;
  onSuccess: (user: User, storage: StorageSummary, message: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function AuthPage({ mode, onNavigateMode, onSuccess, onNotify }: AuthPageProps) {
  const [showAdminHint, setShowAdminHint] = useState(false);
  const [storageMode, setStorageMode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Register fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [courseSection, setCourseSection] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Forgot password fields
  const [forgotFullName, setForgotFullName] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStudentNumber, setForgotStudentNumber] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotReference, setForgotReference] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);

  // Public request status tracking fields
  const [statusEmail, setStatusEmail] = useState('');
  const [statusRef, setStatusRef] = useState('');
  const [statusResult, setStatusResult] = useState<ResetStatusResult | null>(null);

  // Secure password reset form fields (via one-time token link)
  const [resetToken, setResetToken] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : ''
  );
  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<ResetTokenInfo | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [resetCompleted, setResetCompleted] = useState(false);

  useEffect(() => {
    setError('');
    setSuccessInfo('');
    if (mode === 'reset-password') {
      const tokenFromUrl =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
      const activeToken = tokenFromUrl || resetToken;
      if (tokenFromUrl && tokenFromUrl !== resetToken) {
        setResetToken(tokenFromUrl);
      }
      setResetCompleted(false);
      setNewResetPassword('');
      setConfirmResetPassword('');

      if (!activeToken) {
        setTokenValidating(false);
        setTokenInfo(null);
        setTokenError(
          'Walang reset token sa link na ito. Mangyaring buksan ang kumpletong link mula sa email ng Admin.'
        );
        return;
      }

      let cancelled = false;
      setTokenValidating(true);
      setTokenError('');
      setTokenInfo(null);

      apiRequest<ResetTokenInfo & { valid: boolean }>(
        `/api/auth/reset-password/validate?token=${encodeURIComponent(activeToken)}`
      )
        .then((res) => {
          if (cancelled) return;
          setTokenInfo({
            referenceNumber: res.referenceNumber,
            fullName: res.fullName,
            emailMasked: res.emailMasked,
            expiresAt: res.expiresAt,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          const msg =
            err instanceof Error
              ? err.message
              : 'Hindi valid o nag-expire na ang link sa pag-reset ng password.';
          setTokenError(msg);
        })
        .finally(() => {
          if (!cancelled) setTokenValidating(false);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [mode]);

  useEffect(() => {
    setError('');
    setSuccessInfo('');
  }, [mode]);

  useEffect(() => {
    const saved = window.localStorage.getItem('tintalata_remembered_email');
    if (saved) {
      setLoginEmail(saved);
    }
    apiRequest<{ storageMode?: string }>('/api/health')
      .then((res) => setStorageMode(res.storageMode || ''))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');
    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; storage: StorageSummary; message: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: loginEmail,
            password: loginPassword,
            rememberMe,
          }),
        }
      );
      if (rememberMe) {
        window.localStorage.setItem('tintalata_remembered_email', loginEmail.trim());
      } else {
        window.localStorage.removeItem('tintalata_remembered_email');
      }
      onSuccess(res.user, res.storage, res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi nakapag-log in.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');

    if (regPassword.length < 8) {
      const msg = 'Ang password ay dapat may hindi bababa sa 8 karakter.';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    if (regPassword !== confirmPassword) {
      const msg = 'Hindi magkatugma ang iyong password at kumpirmasyon.';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; storage: StorageSummary; message: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            email: regEmail,
            studentNumber,
            courseSection,
            password: regPassword,
          }),
        }
      );
      onSuccess(res.user, res.storage, res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nabigo ang pagpaparehistro.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');
    setForgotReference('');
    setCopiedRef(false);

    if (!forgotFullName.trim() || !forgotEmail.trim() || !forgotStudentNumber.trim() || !forgotReason.trim()) {
      const msg = 'Pakipunan ang buong pangalan, email address, Student ID, at dahilan ng paghingi ng reset.';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    setLoading(true);
    try {
      const submittedEmail = forgotEmail.trim();
      const res = await apiRequest<{
        message: string;
        referenceNumber: string;
        status: PasswordResetStatus;
        submittedAt: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          fullName: forgotFullName.trim(),
          email: submittedEmail,
          studentNumber: forgotStudentNumber.trim(),
          reason: forgotReason.trim(),
        }),
      });
      setSuccessInfo(res.message);
      setForgotReference(res.referenceNumber);
      setStatusEmail(submittedEmail);
      setStatusRef(res.referenceNumber);
      onNotify('success', res.message);
      setForgotFullName('');
      setForgotEmail('');
      setForgotStudentNumber('');
      setForgotReason('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi naipadala ang kahilingan.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyReference = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedRef(true);
      onNotify('info', 'Nakopya ang Reference Number.');
      setTimeout(() => setCopiedRef(false), 2500);
    } catch {
      onNotify('info', `Reference Number: ${value}`);
    }
  };

  const handleCheckResetStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');
    setStatusResult(null);

    if (!statusEmail.trim() || !statusRef.trim()) {
      const msg = 'Pakilagay ang nakarehistrong email address at Reference Number.';
      setError(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<ResetStatusResult>('/api/auth/reset-status', {
        method: 'POST',
        body: JSON.stringify({
          email: statusEmail.trim(),
          referenceNumber: statusRef.trim().toUpperCase(),
        }),
      });
      setStatusResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi nahanap ang hinahanap na request.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');

    const hasLength = newResetPassword.length >= 8;
    const hasLetter = /[A-Za-z]/.test(newResetPassword);
    const hasDigit = /\d/.test(newResetPassword);

    if (!hasLength || !hasLetter || !hasDigit) {
      const msg =
        'Ang bagong password ay dapat hindi bababa sa 8 karakter at may halong kahit isang letra at isang numero.';
      setError(msg);
      return;
    }

    if (newResetPassword !== confirmResetPassword) {
      setError('Hindi magkatugma ang bagong password at pagkumpirma.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ message: string; referenceNumber: string }>(
        '/api/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: resetToken,
            newPassword: newResetPassword,
            confirmPassword: confirmResetPassword,
          }),
        }
      );
      setResetCompleted(true);
      setSuccessInfo(res.message);
      onNotify('success', res.message);
      setNewResetPassword('');
      setConfirmResetPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hindi napalitan ang password.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const fillAdminDemo = () => {
    onNavigateMode('login');
    setLoginEmail('admin@tintalata.ph');
    setLoginPassword('TintalataAdmin#2026');
    setError('');
  };

  const passwordStrength =
    regPassword.length === 0
      ? null
      : regPassword.length < 8
        ? { label: 'Napakaikli (min. 8 karakter)', color: 'bg-rose-500', width: 'w-1/3' }
        : /[a-zA-Z]/.test(regPassword) && /\d/.test(regPassword)
          ? { label: 'Malakas na password', color: 'bg-emerald-500', width: 'w-full' }
          : { label: 'Katamtaman', color: 'bg-blue-600', width: 'w-2/3' };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-[#f4f8ff] via-white to-[#e8f1ff] text-slate-900">
      {/* Full-Width Desktop Application Top Bar */}
      <header className="w-full border-b border-blue-100 bg-white/95 backdrop-blur px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TintalataLogo size="sm" />
          <div>
            <span className="text-base font-extrabold tracking-tight text-blue-950">
              Tintalata
            </span>
            <span className="hidden sm:inline-block ml-2.5 rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
              Patnugot ng Dokumento at Guhit
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            Filipino (PH)
          </span>
          {mode !== 'login' ? (
            <button
              type="button"
              onClick={() => onNavigateMode('login')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
            >
              <LogIn className="h-3.5 w-3.5" />
              Mag-log in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateMode('register')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Gumawa ng Account
            </button>
          )}
        </div>
      </header>

      {/* Full-Screen Centered Application Canvas with Custom Study Background */}
      <main className="relative flex-1 w-full flex items-center justify-center px-4 sm:px-8 py-8 overflow-y-auto">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${authBg})` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50/45 via-white/30 to-blue-100/45"
        />

        <div className="relative z-10 w-full max-w-md mx-auto rounded-2xl bg-white/88 backdrop-blur-md border border-white/80 shadow-xl shadow-blue-950/10 p-6 sm:p-8">
          {mode === 'login' && (
            <div className="space-y-6">
              {/* Centered Brand Emblem & Title */}
              <div className="text-center space-y-3">
                <div className="flex justify-center">
                  <TintalataLogo size="lg" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                    Mag-log in sa Tintalata
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Ilagay ang iyong kredensyal upang mabuksan ang iyong workspace.
                  </p>
                </div>
              </div>

              {storageMode === 'sqlite-ephemeral' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                  <strong className="font-bold">Paalala (Pansamantalang Cloud Storage):</strong>{' '}
                  Gumagamit pa ng pansamantalang <code>/tmp</code> database ang Vercel server na
                  ito. Upang hindi mabura ang iyong account kapag nag-redeploy, ikonekta ang
                  PostgreSQL (<code>POSTGRES_URL</code> o <code>DATABASE_URL</code>) sa Vercel.
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                  >
                    Email o Numero ng Mag-aaral
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                    <input
                      id="login-email"
                      type="text"
                      required
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="pangalan@paaralan.ph o 2026-0001"
                      className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100 transition"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <PasswordInput
                    id="login-password"
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    placeholder="Ilagay ang iyong password"
                    inputClassName="py-3"
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-blue-300 text-blue-600 accent-blue-600"
                    />
                    Tandaan ako
                  </label>

                  <button
                    type="button"
                    onClick={() => onNavigateMode('forgot-password')}
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                  >
                    Nakalimutan ang Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700 disabled:opacity-60 transition cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? 'Nagla-log in...' : 'Mag-log in'}
                </button>
              </form>

              <div className="pt-2 border-t border-blue-100 flex flex-col items-center gap-3 text-xs">
                <p className="text-slate-600">
                  Wala ka pang account ng mag-aaral?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigateMode('register')}
                    className="font-bold text-blue-700 hover:underline cursor-pointer"
                  >
                    Magparehistro rito
                  </button>
                </p>
                <p className="text-slate-600">
                  May pending na request sa password reset?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigateMode('reset-status')}
                    className="font-bold text-blue-700 hover:underline cursor-pointer"
                  >
                    Suriin ang Status
                  </button>
                </p>

                <button
                  type="button"
                  onClick={() => setShowAdminHint((s) => !s)}
                  className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-blue-700"
                >
                  {showAdminHint ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Default na Account ng Tagapangasiwa (Admin)
                </button>
                {showAdminHint && (
                  <div className="w-full rounded-xl border border-blue-200 bg-white/90 px-4 py-3 text-xs text-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <p>
                        Email: <code className="font-mono text-blue-800">admin@tintalata.ph</code>
                      </p>
                      <p>
                        Password:{' '}
                        <code className="font-mono text-blue-800">TintalataAdmin#2026</code>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fillAdminDemo}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      Punan
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-5">
              <div className="text-center space-y-2.5">
                <div className="flex justify-center">
                  <TintalataLogo size="md" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                    Gumawa ng Account ng Mag-aaral
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Pagkatapos magparehistro, awtomatiko kang dadalhin sa iyong dashboard.
                  </p>
                </div>
              </div>

              {storageMode === 'sqlite-ephemeral' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                  <strong className="font-bold">Paalala (Pansamantalang Cloud Storage):</strong>{' '}
                  Gumagamit pa ng pansamantalang <code>/tmp</code> database ang Vercel server na
                  ito. Upang hindi mabura ang iyong account kapag nag-redeploy, ikonekta ang
                  PostgreSQL (<code>POSTGRES_URL</code> o <code>DATABASE_URL</code>) sa Vercel.
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Buong Pangalan *
                  </label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Hal. Juan Dela Cruz"
                      className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Numero ng Mag-aaral
                    </label>
                    <div className="relative">
                      <Hash className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                      <input
                        type="text"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value)}
                        placeholder="2026-0142"
                        className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Kurso / Seksyon
                    </label>
                    <div className="relative">
                      <GraduationCap className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                      <input
                        type="text"
                        value={courseSection}
                        onChange={(e) => setCourseSection(e.target.value)}
                        placeholder="BSIS 2-A"
                        className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-3 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="pangalan@paaralan.ph"
                      className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                    >
                      Password *
                    </label>
                    <PasswordInput
                      id="reg-password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={setRegPassword}
                      placeholder="Min. 8 karakter"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                    >
                      Kumpirmahin *
                    </label>
                    <PasswordInput
                      id="reg-confirm-password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder="Ulitin ang password"
                    />
                  </div>
                </div>

                {passwordStrength && (
                  <div className="space-y-1 text-xs">
                    <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${passwordStrength.color} ${passwordStrength.width} transition-all`}
                      />
                    </div>
                    <p className="text-[11px] font-medium text-slate-600">
                      {passwordStrength.label}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700 disabled:opacity-60 transition cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" />
                  {loading ? 'Gumagawa ng Account...' : 'Magparehistro at Buksan ang Dashboard'}
                </button>
              </form>

              <p className="text-center text-xs text-slate-600 pt-2 border-t border-blue-100">
                Mayroon ka nang account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigateMode('login')}
                  className="font-bold text-blue-700 hover:underline"
                >
                  Bumalik sa Pag-log in
                </button>
              </p>
            </div>
          )}

          {mode === 'forgot-password' && (
            <div className="space-y-5">
              <div className="text-center space-y-2.5">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <KeyRound className="h-6 w-6" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                    Nakalimutan ang Password?
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Magpadala ng kahilingan sa Tagapangasiwa upang ma-reset ang iyong password.
                  </p>
                </div>
              </div>

              {storageMode === 'sqlite-ephemeral' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                  <strong className="font-bold">Paalala (Pansamantalang Cloud Storage):</strong>{' '}
                  Gumagamit pa ng pansamantalang <code>/tmp</code> database ang Vercel server na
                  ito. Upang hindi mabura ang iyong account kapag nag-redeploy, ikonekta ang
                  PostgreSQL (<code>POSTGRES_URL</code> o <code>DATABASE_URL</code>) sa Vercel.
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              {successInfo && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successInfo}</span>
                </div>
              )}

              {forgotReference && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                    <div>
                      <p className="font-bold">Naipadala na ang iyong kahilingan (Pending)</p>
                      <p className="text-emerald-700 mt-0.5">
                        I-save ang iyong Reference Number upang masubaybayan ang desisyon ng Admin kahit
                        hindi naka-log in:
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                    <span className="font-mono font-bold text-sm text-slate-900 select-all">
                      {forgotReference}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyReference(forgotReference)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedRef ? 'Nakopya' : 'Kopyahin'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusRef(forgotReference);
                      onNavigateMode('reset-status');
                    }}
                    className="w-full rounded-lg bg-emerald-600 py-2 font-bold text-white hover:bg-emerald-700 transition cursor-pointer"
                  >
                    Suriin ang Status ng Request Ngayon
                  </button>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Buong Pangalan (Full Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotFullName}
                    onChange={(e) => setForgotFullName(e.target.value)}
                    placeholder="Hal. Juan Dela Cruz"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nakarehistrong Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="pangalan@paaralan.ph"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Student ID / Numero ng Mag-aaral *
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotStudentNumber}
                    onChange={(e) => setForgotStudentNumber(e.target.value)}
                    placeholder="Hal. 2026-0142"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Dahilan ng Paghingi ng Password Reset *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder="Ipaliwanag kung bakit kailangan i-reset ang iyong password (hal. nagpalit ng device o nakalimutan ang password)"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
                >
                  {loading ? 'Ipinapadala...' : 'Ipadala ang Kahilingan sa Admin'}
                </button>
              </form>

              <div className="pt-2 border-t border-blue-100 flex flex-col items-center gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigateMode('reset-status')}
                  className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:underline cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  Suriin ang Status ng Nakaraang Request
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateMode('login')}
                  className="inline-flex items-center gap-1.5 font-bold text-slate-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Bumalik sa Pag-log in
                </button>
              </div>
            </div>
          )}

          {mode === 'reset-status' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="mx-auto w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <Search className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Status ng Password Reset Request</h2>
                <p className="text-xs text-slate-600">
                  Ilagay ang iyong nakarehistrong email address at Reference Number upang makita ang
                  kasalukuyang katayuan ng iyong request kahit hindi naka-log in.
                </p>
              </div>

              <form onSubmit={handleCheckResetStatus} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Nakarehistrong Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={statusEmail}
                    onChange={(e) => setStatusEmail(e.target.value)}
                    placeholder="pangalan@paaralan.ph"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Request Reference Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={statusRef}
                    onChange={(e) => setStatusRef(e.target.value.toUpperCase())}
                    placeholder="Hal. TRR-20261126-ABCDEFGH"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm font-mono focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
                >
                  {loading ? 'Sinusuri...' : 'Suriin ang Status ng Request'}
                </button>
              </form>

              {statusResult && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-800">{statusResult.referenceNumber}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                        statusResult.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : statusResult.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : statusResult.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {statusResult.status}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                    {statusResult.statusMessage}
                  </p>

                  {statusResult.status === 'rejected' && statusResult.rejectionReason && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-800">
                      <span className="font-bold">Dahilan ng Admin: </span>
                      {statusResult.rejectionReason}
                    </div>
                  )}

                  {statusResult.status === 'approved' && statusResult.tokenExpiresAt && (
                    <div className="rounded-lg border border-blue-200 bg-white p-2.5 text-slate-700 flex items-start gap-2">
                      <Clock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        {statusResult.tokenExpired ? (
                          <span className="text-red-700 font-semibold">
                            Nag-expire na ang reset link. Maaaring humiling sa Admin na ipadala itong muli o magsumite ng bagong request.
                          </span>
                        ) : (
                          <span>
                            May bisa ang reset link sa email hanggang{' '}
                            <strong>{formatDateTimePH(statusResult.tokenExpiresAt)}</strong> (15 minuto).
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {statusResult.emailDeliveryStatus === 'failed' &&
                    (statusResult.status === 'approved' || statusResult.status === 'rejected') && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Nagkaroon ng problema sa pagpapadala ng email notification. Pakikontak ang iyong
                          Admin upang maipadala muli ang abiso.
                        </span>
                      </div>
                    )}

                  <div className="pt-2 border-t border-blue-100 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2">
                    <span>Isinumite: {formatDateTimePH(statusResult.submittedAt)}</span>
                    <span>Huling update: {formatDateTimePH(statusResult.updatedAt)}</span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-blue-100 flex flex-col items-center gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigateMode('forgot-password')}
                  className="font-bold text-blue-700 hover:underline cursor-pointer"
                >
                  Magsumite ng Bagong Password Reset Request
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateMode('login')}
                  className="inline-flex items-center gap-1.5 font-bold text-slate-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Bumalik sa Pag-log in
                </button>
              </div>
            </div>
          )}

          {mode === 'reset-password' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="mx-auto w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Gumawa ng Bagong Password</h2>
                <p className="text-xs text-slate-600">
                  Inaprubahan ng Admin ang iyong password reset request. Pumili ng matibay na bagong password.
                </p>
              </div>

              {tokenValidating && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6 text-center text-xs text-slate-600">
                  Bineberipika ang secure password reset link...
                </div>
              )}

              {!tokenValidating && tokenError && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">Hindi Magamit ang Reset Link</p>
                      <p>{tokenError}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateMode('forgot-password')}
                      className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer"
                    >
                      Magsumite ng Bagong Request sa Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateMode('login')}
                      className="w-full rounded-xl border border-blue-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Bumalik sa Pag-log in
                    </button>
                  </div>
                </div>
              )}

              {!tokenValidating && !tokenError && resetCompleted && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Matagumpay na Napalitan ang Password
                    </div>
                    <p>
                      Nakumpirma ang pagpapalit ng iyong password at nakapagpadala ng kumpirmasyon sa
                      iyong email. Markado na bilang Completed ang request.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateMode('login')}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition cursor-pointer"
                  >
                    Mag-log in gamit ang Bagong Password
                  </button>
                </div>
              )}

              {!tokenValidating && !tokenError && !resetCompleted && tokenInfo && (
                <form onSubmit={handleConfirmPasswordReset} className="space-y-3.5">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{tokenInfo.fullName}</span>
                      <span className="font-mono text-[11px] font-bold text-blue-700">
                        {tokenInfo.referenceNumber}
                      </span>
                    </div>
                    <p className="text-slate-600">Email: {tokenInfo.emailMasked}</p>
                    <p className="text-[11px] text-slate-500">
                      May bisa hanggang: {formatDateTimePH(tokenInfo.expiresAt)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Bagong Password *
                    </label>
                    <PasswordInput
                      required
                      value={newResetPassword}
                      onChange={setNewResetPassword}
                      placeholder="Hindi bababa sa 8 karakter (may letra at numero)"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Kumpirmahin ang Bagong Password *
                    </label>
                    <PasswordInput
                      required
                      value={confirmResetPassword}
                      onChange={setConfirmResetPassword}
                      placeholder="Ulitin ang bagong password"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] space-y-1">
                    <p className="font-bold text-slate-700 mb-1">Mga Kinakailangan sa Password:</p>
                    <p className={newResetPassword.length >= 8 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {newResetPassword.length >= 8 ? '✓' : '•'} Hindi bababa sa 8 karakter
                    </p>
                    <p className={/[A-Za-z]/.test(newResetPassword) ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {/[A-Za-z]/.test(newResetPassword) ? '✓' : '•'} May kahit isang letra (A-Z / a-z)
                    </p>
                    <p className={/\d/.test(newResetPassword) ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {/\d/.test(newResetPassword) ? '✓' : '•'} May kahit isang numero (0-9)
                    </p>
                    <p
                      className={
                        newResetPassword.length > 0 && newResetPassword === confirmResetPassword
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-500'
                      }
                    >
                      {newResetPassword.length > 0 && newResetPassword === confirmResetPassword ? '✓' : '•'}{' '}
                      Magkatugma ang kumpirmasyon
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
                  >
                    {loading ? 'Sini-save...' : 'I-save ang Bagong Password'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Full-Width Desktop Status Footer */}
      <footer className="w-full border-t border-blue-100 bg-white px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>Tintalata Desktop Application • Bersyon 1.0</span>
        <span>Lahat ng pribadong file ay protektado at nakahiwalay bawat account.</span>
      </footer>
    </div>
  );
}
