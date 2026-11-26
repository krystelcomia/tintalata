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
  Download,
  Printer,
  ShieldAlert,
  Lock,
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
  const [regRecoveryCode, setRegRecoveryCode] = useState('');

  // Post-registration Recovery Code Confirmation state
  const [createdAccountRecovery, setCreatedAccountRecovery] = useState<{
    recoveryCode: string;
    user: User;
    storage: StorageSummary;
    message: string;
  } | null>(null);
  const [copiedRecoveryCode, setCopiedRecoveryCode] = useState(false);
  const [acknowledgedRecoverySaved, setAcknowledgedRecoverySaved] = useState(false);

  // Forgot password fields (Step 1: Recovery Code verification -> Step 2: Admin Request)
  const [forgotFullName, setForgotFullName] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStudentNumber, setForgotStudentNumber] = useState('');
  const [forgotRecoveryCode, setForgotRecoveryCode] = useState('');
  const [forgotVerifiedProof, setForgotVerifiedProof] = useState<{
    token: string;
    fullName: string;
    studentNumber: string;
    email: string;
  } | null>(null);
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
    if (mode !== 'forgot-password') {
      setForgotVerifiedProof(null);
      setForgotRecoveryCode('');
    }
    if (mode !== 'register') {
      setCreatedAccountRecovery(null);
      setAcknowledgedRecoverySaved(false);
      setCopiedRecoveryCode(false);
      setRegRecoveryCode('');
    }
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

    const cleanRecCode = regRecoveryCode.trim();
    if (!/^\d{6}$/.test(cleanRecCode)) {
      const msg = 'Ang iyong Recovery Code ay dapat eksaktong anim (6) na numero lamang (0–9).';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        user: User;
        storage: StorageSummary;
        message: string;
        recoveryCode?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email: regEmail,
          studentNumber,
          courseSection,
          password: regPassword,
          recoveryCode: cleanRecCode,
        }),
      });
      if (res.recoveryCode) {
        setCreatedAccountRecovery({
          recoveryCode: res.recoveryCode,
          user: res.user,
          storage: res.storage,
          message: res.message,
        });
        setRegRecoveryCode('');
        setCopiedRecoveryCode(false);
        setAcknowledgedRecoverySaved(false);
        onNotify(
          'success',
          'Nagawa na ang iyong account! I-save muna ang iyong 6-digit Recovery Code bago magpatuloy.'
        );
      } else {
        onSuccess(res.user, res.storage, res.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nabigo ang pagpaparehistro.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRecoveryCode = async () => {
    if (!createdAccountRecovery) return;
    try {
      await navigator.clipboard.writeText(createdAccountRecovery.recoveryCode);
      setCopiedRecoveryCode(true);
      onNotify('info', 'Nakopya ang iyong 6-digit Recovery Code.');
      setTimeout(() => setCopiedRecoveryCode(false), 3000);
    } catch {
      onNotify('info', 'Piliin at kopyahin ang 6-digit code na nakikita sa screen.');
    }
  };

  const handleDownloadRecoveryCode = () => {
    if (!createdAccountRecovery) return;
    const { recoveryCode: code, user } = createdAccountRecovery;
    const safeSlug = (user.studentNumber || user.email.split('@')[0] || 'mag-aaral')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const content = [
      '====================================================',
      '        YOUR TINTALATA RECOVERY CODE',
      '====================================================',
      '',
      `Pangalan        : ${user.fullName}`,
      `Email Address   : ${user.email}`,
      `Student ID      : ${user.studentNumber || '—'}`,
      `Petsa ng Gawa   : ${formatDateTimePH(user.createdAt)}`,
      '',
      `6-DIGIT RECOVERY CODE: ${code}`,
      '',
      '----------------------------------------------------',
      'MAHALAGANG PAALALA!',
      '',
      'Huwag kalimutan o mawala ang iyong 6-digit Recovery Code.',
      'Ito ang iyong personal na verification code na kakailanganin',
      'kapag nakalimutan mo ang iyong password.',
      '',
      'Siguraduhing isulat, kopyahin, o itago ito sa ligtas na lugar.',
      'Hindi ka makakapagpatuloy sa password recovery process kung',
      'hindi mo maibibigay ang tamang recovery code.',
      '====================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tintalata-Recovery-Code-${safeSlug}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify('success', 'Na-download ang file ng iyong Recovery Code.');
  };

  const handlePrintRecoveryCode = () => {
    if (!createdAccountRecovery) return;
    const { recoveryCode: code, user } = createdAccountRecovery;
    const esc = (v: string) =>
      String(v || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const digitsHtml = code
      .split('')
      .map(
        (d) =>
          `<span style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:60px;border:2px solid #2563eb;border-radius:12px;font-size:28px;font-weight:800;font-family:monospace;color:#1e3a8a;background:#eff6ff;margin:0 4px;">${esc(d)}</span>`
      )
      .join('');

    const printWin = window.open('', '_blank', 'width=680,height=740');
    if (printWin) {
      printWin.document.write(`<!doctype html>
<html>
<head><title>Tintalata Student Recovery Code</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;padding:36px;color:#0f172a;max-width:560px;margin:0 auto;">
  <div style="border:2px solid #bfdbfe;border-radius:16px;padding:28px;background:#ffffff;">
    <h1 style="margin:0 0 6px;color:#1e3a8a;font-size:20px;text-align:center;">YOUR TINTALATA RECOVERY CODE</h1>
    <p style="margin:0 0 20px;color:#475569;font-size:13px;text-align:center;">Personal na 6-Digit Verification Credential</p>
    <div style="text-align:center;margin:20px 0 24px;">${digitsHtml}</div>
    <div style="font-size:13px;line-height:1.7;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:12px 0;margin-bottom:16px;">
      <div><strong>Pangalan:</strong> ${esc(user.fullName)}</div>
      <div><strong>Email:</strong> ${esc(user.email)}</div>
      <div><strong>Student ID:</strong> ${esc(user.studentNumber || '—')}</div>
      <div><strong>Petsa:</strong> ${esc(formatDateTimePH(user.createdAt))}</div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;font-size:12px;line-height:1.6;color:#78350f;">
      <strong>MAHALAGANG PAALALA!</strong><br/><br/>
      Huwag kalimutan o mawala ang iyong 6-digit Recovery Code. Ito ang iyong personal na verification code na kakailanganin kapag nakalimutan mo ang iyong password.<br/><br/>
      Siguraduhing isulat, kopyahin, o itago ito sa ligtas na lugar. Hindi ka makakapagpatuloy sa password recovery process kung hindi mo maibibigay ang tamang recovery code.
    </div>
  </div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`);
      printWin.document.close();
    } else {
      window.print();
    }
  };

  const handleVerifyRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');

    const cleanCode = forgotRecoveryCode.trim();
    if (!forgotEmail.trim() || !forgotStudentNumber.trim()) {
      const msg = 'Pakilagay ang iyong nakarehistrong email address at Student ID.';
      setError(msg);
      onNotify('error', msg);
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      const msg = 'Ang Recovery Code ay dapat eksaktong anim (6) na numero lamang (0–9).';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        verified: boolean;
        message: string;
        recoveryProofToken: string;
        fullName: string;
        studentNumber: string;
      }>('/api/auth/verify-recovery-code', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          studentNumber: forgotStudentNumber.trim(),
          recoveryCode: cleanCode,
        }),
      });
      setForgotVerifiedProof({
        token: res.recoveryProofToken,
        fullName: res.fullName,
        studentNumber: res.studentNumber,
        email: forgotEmail.trim().toLowerCase(),
      });
      setForgotFullName(res.fullName);
      setSuccessInfo(res.message);
      onNotify('success', 'Naberipika ang Recovery Code! Magpatuloy sa pagsusumite sa Admin.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nabigo ang beripikasyon ng Recovery Code.';
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

    if (!forgotVerifiedProof) {
      setError('Beripikahin muna ang iyong 6-digit Student Recovery Code.');
      return;
    }

    if (!forgotFullName.trim() || !forgotReason.trim()) {
      const msg = 'Pakipunan ang buong pangalan at dahilan ng paghingi ng password reset.';
      setError(msg);
      onNotify('error', msg);
      return;
    }

    setLoading(true);
    try {
      const submittedEmail = forgotVerifiedProof.email;
      const res = await apiRequest<{
        message: string;
        referenceNumber: string;
        status: PasswordResetStatus;
        submittedAt: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          recoveryProofToken: forgotVerifiedProof.token,
          fullName: forgotFullName.trim(),
          email: submittedEmail,
          studentNumber: forgotVerifiedProof.studentNumber,
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
      setForgotRecoveryCode('');
      setForgotVerifiedProof(null);
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

        <div
          className={`relative z-10 w-full ${
            mode === 'register' && createdAccountRecovery ? 'max-w-lg' : 'max-w-md'
          } mx-auto rounded-2xl bg-white/92 backdrop-blur-md border border-white/80 shadow-xl shadow-blue-950/10 p-6 sm:p-8`}
        >
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

          {mode === 'register' && createdAccountRecovery && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-blue-700">
                  Matagumpay na Nagawa ang Account
                </p>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                  YOUR TINTALATA RECOVERY CODE
                </h1>
                <p className="text-xs text-slate-600">
                  Personal na 6-digit verification code para kay{' '}
                  <strong>{createdAccountRecovery.user.fullName}</strong>
                </p>
              </div>

              {/* Large Separated 6-Digit Display */}
              <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/90 to-white p-4 sm:p-5">
                <div
                  aria-label="Your Tintalata 6-Digit Recovery Code"
                  className="grid grid-cols-6 gap-2 sm:gap-3"
                >
                  {createdAccountRecovery.recoveryCode.split('').map((digit, idx) => (
                    <div
                      key={idx}
                      className="flex h-14 sm:h-16 items-center justify-center rounded-xl border-2 border-blue-300 bg-white font-mono text-2xl sm:text-3xl font-extrabold text-blue-900 shadow-xs select-all"
                    >
                      {digit}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyRecoveryCode()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 transition cursor-pointer"
                  >
                    {copiedRecoveryCode ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedRecoveryCode ? 'Nakopya!' : 'Kopyahin ang Code'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadRecoveryCode}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 transition cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    I-save / I-download
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintRecoveryCode}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 transition cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    I-print
                  </button>
                </div>
              </div>

              {/* Required Important Filipino Reminder */}
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2 leading-relaxed">
                <div className="flex items-center gap-2 font-extrabold text-amber-900 text-sm">
                  <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
                  MAHALAGANG PAALALA!
                </div>
                <p>
                  Huwag kalimutan o mawala ang iyong 6-digit Recovery Code. Ito ang iyong personal na
                  verification code na kakailanganin kapag nakalimutan mo ang iyong password.
                </p>
                <p>
                  Siguraduhing isulat, kopyahin, o itago ito sa ligtas na lugar. Hindi ka
                  makakapagpatuloy sa password recovery process kung hindi mo maibibigay ang tamang
                  recovery code.
                </p>
              </div>

              {/* Required Confirmation Checkbox */}
              <label className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-xs text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledgedRecoverySaved}
                  onChange={(e) => setAcknowledgedRecoverySaved(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 accent-blue-600 shrink-0"
                />
                <span className="font-semibold leading-snug">
                  Kinukumpirma ko na naisulat, nakopya, o naitago ko na sa ligtas na lugar ang
                  aking 6-digit Recovery Code at nauunawaan kong kakailanganin ito sa pag-recover ng
                  password.
                </span>
              </label>

              <button
                type="button"
                disabled={!acknowledgedRecoverySaved}
                onClick={() =>
                  onSuccess(
                    createdAccountRecovery.user,
                    createdAccountRecovery.storage,
                    createdAccountRecovery.message
                  )
                }
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:from-blue-800 hover:to-blue-700 disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Magpatuloy sa Workspace
              </button>
            </div>
          )}

          {mode === 'register' && !createdAccountRecovery && (
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
                    Gumawa ng iyong account at itakda ang iyong 6-digit recovery code.
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
                      Numero ng Mag-aaral *
                    </label>
                    <div className="relative">
                      <Hash className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                      <input
                        type="text"
                        required
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

                <div>
                  <label
                    htmlFor="reg-recovery-code"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    6-Digit Recovery Code *
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                    <input
                      id="reg-recovery-code"
                      type="text"
                      required
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={regRecoveryCode}
                      onChange={(e) =>
                        setRegRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Ilagay ang 6-digit na numero (hal. 042819)"
                      className="w-full rounded-xl border border-blue-200 bg-white pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    />
                  </div>

                  {/\d/.test(regRecoveryCode) && (
                    <div
                      role="note"
                      className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950 flex items-start gap-2 leading-relaxed"
                    >
                      <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-amber-900">
                          Paalala: Huwag na huwag kalimutan ang iyong code!
                        </p>
                        <p className="mt-0.5">
                          Ito lamang ang tanging code na magagamit mo kung sakaling makalimutan mo
                          ang iyong password. Siguraduhing tandaan o itago ito sa ligtas na lugar.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

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

              {!forgotReference && !forgotVerifiedProof && (
                <form onSubmit={handleVerifyRecoveryCode} className="space-y-3.5">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900 font-semibold flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-blue-700 shrink-0" />
                    <span>Hakbang 1 ng 2: Beripikahin ang iyong 6-Digit Student Recovery Code</span>
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
                      6-Digit Student Recovery Code *
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={forgotRecoveryCode}
                      onChange={(e) =>
                        setForgotRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="••••••"
                      className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-center font-mono text-xl font-extrabold tracking-[0.45em] text-blue-950 focus:border-blue-600 focus:outline-none focus:ring-3 focus:ring-blue-100"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Ilagay ang eksaktong 6-digit numeric code na ibinigay noong ginawa ang account (kasama ang mga unahang zero).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
                  >
                    {loading ? 'Bineberipika...' : 'Beripikahin ang Recovery Code'}
                  </button>
                </form>
              )}

              {!forgotReference && forgotVerifiedProof && (
                <form onSubmit={handleForgotPassword} className="space-y-3.5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">Hakbang 2 ng 2: Naberipika ang Recovery Code</p>
                      <p className="text-[11px] text-emerald-800">
                        {forgotVerifiedProof.email} • ID: {forgotVerifiedProof.studentNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotVerifiedProof(null);
                        setSuccessInfo('');
                        setError('');
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:underline shrink-0 cursor-pointer"
                    >
                      Palitan
                    </button>
                  </div>

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
              )}

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
