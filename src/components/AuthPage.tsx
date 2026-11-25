import { useState } from 'react';
import {
  FileText,
  PenTool,
  FolderLock,
  ShieldCheck,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  HardDrive,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { StorageSummary, User } from '../types';

interface AuthPageProps {
  onSuccess: (user: User, storage: StorageSummary, message: string) => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminHint, setShowAdminHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [courseSection, setCourseSection] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; storage: StorageSummary; message: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        }
      );
      onSuccess(res.user, res.storage, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi nakapag-log in.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (regPassword !== confirmPassword) {
      setError('Hindi magkatugma ang iyong password at kumpirmasyon.');
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
      setError(err instanceof Error ? err.message : 'Nabigo ang pagpaparehistro.');
    } finally {
      setLoading(false);
    }
  };

  const fillAdminDemo = () => {
    setMode('login');
    setLoginEmail('admin@tintalata.ph');
    setLoginPassword('TintalataAdmin#2026');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 px-4 py-8 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl bg-white shadow-2xl overflow-hidden border border-blue-200/40">
        {/* Brand & Feature Highlights */}
        <div className="lg:col-span-5 bg-gradient-to-b from-blue-700 to-blue-900 p-8 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/25 shadow-inner">
                <FileText className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Tintalata</h1>
                <p className="text-xs text-blue-100 font-medium">
                  Patnugot ng Dokumento at Guhit
                </p>
              </div>
            </div>

            <h2 className="text-xl font-bold leading-snug mb-3">
              Magsulat, Mag-format, at Gumuhit sa Iyong Pribadong Espasyo.
            </h2>
            <p className="text-sm text-blue-100/90 leading-relaxed mb-7">
              Isang makabagong aplikasyong katulad ng Microsoft Word na idinisenyo para sa mga
              mag-aaral sa wikang Filipino.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-white/15 p-2">
                  <FileText className="h-4 w-4 text-blue-100" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Pag-format Katulad ng Word</p>
                  <p className="text-xs text-blue-100/80">
                    Mga font, kulay, talahanayan, listahan, at pag-download bilang .doc o ZIP.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-white/15 p-2">
                  <PenTool className="h-4 w-4 text-blue-100" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Malayang Pagguhit at Doodle</p>
                  <p className="text-xs text-blue-100/80">
                    Gumuhit ng sariling doodle at ilagay direkta sa loob ng iyong mga dokumento.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-white/15 p-2">
                  <FolderLock className="h-4 w-4 text-blue-100" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Pribadong Folder at Basurahan</p>
                  <p className="text-xs text-blue-100/80">
                    I-customize ang bawat folder at ibalik o burahin nang tuluyan mula sa Basurahan.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-white/15 p-2">
                  <HardDrive className="h-4 w-4 text-blue-100" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Awtomatikong Pagsubaybay sa Storage</p>
                  <p className="text-xs text-blue-100/80">
                    Malinaw na pagtingin sa kabuuang MB, nagamit, at natitirang espasyo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-white/15 flex items-center gap-2 text-xs text-blue-100">
            <ShieldCheck className="h-4 w-4 shrink-0 text-sky-300" />
            <span>
              Naka-encrypt ang mga password at nakahiwalay ang pribadong file ng bawat mag-aaral.
            </span>
          </div>
        </div>

        {/* Forms Area */}
        <div className="lg:col-span-7 p-6 sm:p-10 bg-white flex flex-col justify-center">
          <div className="flex rounded-xl bg-blue-50 p-1 mb-6 border border-blue-100">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-700 hover:bg-blue-100/60'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Mag-log in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-700 hover:bg-blue-100/60'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Magparehistro (Mag-aaral)
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
            >
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Maligayang Pagbabalik</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Ilagay ang iyong email at password upang buksan ang iyong account.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="pangalan@paaralan.ph"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Ilagay ang iyong password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-10 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Itago ang password' : 'Ipakita ang password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
              >
                {loading ? 'Nagla-log in...' : 'Mag-log in sa Tintalata'}
              </button>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminHint((s) => !s)}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
                >
                  {showAdminHint ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Impormasyon ng Tagapangasiwa (Admin Login)
                </button>
                {showAdminHint && (
                  <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-slate-700 space-y-1.5">
                    <p className="font-semibold text-blue-900">
                      Default na Account ng Tagapangasiwa:
                    </p>
                    <p>
                      Email: <code className="font-mono text-blue-800">admin@tintalata.ph</code>
                    </p>
                    <p>
                      Password:{' '}
                      <code className="font-mono text-blue-800">TintalataAdmin#2026</code>
                    </p>
                    <button
                      type="button"
                      onClick={fillAdminDemo}
                      className="mt-1 inline-flex items-center rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Punan ang Admin Login
                    </button>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Gumawa ng Account ng Mag-aaral</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Lahat ng dokumento at guhit mo ay mananatiling pribado sa iyong account.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Buong Pangalan *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Hal. Juan Dela Cruz"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Numero ng Mag-aaral
                  </label>
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="Hal. 2026-0142"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kurso / Baitang at Seksyon
                  </label>
                  <input
                    type="text"
                    value={courseSection}
                    onChange={(e) => setCourseSection(e.target.value)}
                    placeholder="Hal. BSIT 2-A"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="juan.delacruz@paaralan.ph"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Hindi bababa sa 8 karakter"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kumpirmahin ang Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulitin ang password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Gumamit ng hindi bababa sa 8 karakter na may titik at numero.</span>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {showPassword ? 'Itago' : 'Ipakita'}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
              >
                {loading ? 'Gumagawa ng Account...' : 'Magparehistro at Magsimula'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
