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
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { StorageSummary, User } from '../types';
import { TintalataLogo } from './TintalataLogo';
import { PasswordInput } from './PasswordInput';

export type AuthRouteMode = 'login' | 'register' | 'forgot-password';

interface AuthPageProps {
  mode: AuthRouteMode;
  onNavigateMode: (next: AuthRouteMode) => void;
  onSuccess: (user: User, storage: StorageSummary, message: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function AuthPage({ mode, onNavigateMode, onSuccess, onNotify }: AuthPageProps) {
  const [showAdminHint, setShowAdminHint] = useState(false);
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
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStudentNumber, setForgotStudentNumber] = useState('');
  const [forgotReason, setForgotReason] = useState('');

  useEffect(() => {
    setError('');
    setSuccessInfo('');
  }, [mode]);

  useEffect(() => {
    const saved = window.localStorage.getItem('tintalata_remembered_email');
    if (saved) {
      setLoginEmail(saved);
    }
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
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail,
          studentNumber: forgotStudentNumber,
          reason: forgotReason,
        }),
      });
      setSuccessInfo(res.message);
      onNotify('success', res.message);
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

      {/* Full-Screen Centered Application Canvas (No floating boxed card / No promo column) */}
      <main className="relative flex-1 w-full flex items-center justify-center px-4 sm:px-8 py-8 overflow-y-auto">
        {/* Subtle full-screen architectural blue accent backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-36 -right-36 h-96 w-96 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="absolute -bottom-36 -left-36 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto">
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
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Nakalimutan ang password?
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
                    className="font-bold text-blue-700 hover:underline"
                  >
                    Magparehistro rito
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

              <form onSubmit={handleForgotPassword} className="space-y-4">
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
                    Numero ng Mag-aaral (Para sa Beripikasyon)
                  </label>
                  <input
                    type="text"
                    value={forgotStudentNumber}
                    onChange={(e) => setForgotStudentNumber(e.target.value)}
                    placeholder="Hal. 2026-0142"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Karagdagang Tala
                  </label>
                  <textarea
                    rows={2}
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder="Hal. Nakalimutan ang password pagkatapos magpalit ng device"
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

              <button
                type="button"
                onClick={() => onNavigateMode('login')}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Bumalik sa Pag-log in
              </button>
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
