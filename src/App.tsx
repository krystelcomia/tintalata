import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminStudent, StorageSummary, ToastMessage, User } from './types';
import { apiRequest } from './utils/api';
import { AuthPage, type AuthRouteMode } from './components/AuthPage';
import { StudentWorkspace } from './components/StudentWorkspace';
import { AdminDashboard } from './components/AdminDashboard';
import { ToastContainer } from './components/ToastContainer';
import { TintalataLogo } from './components/TintalataLogo';
import { applyTheme, getStoredTheme } from './utils/theme';

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function getAuthModeFromPath(pathname: string): AuthRouteMode {
  if (pathname === '/register') return 'register';
  if (pathname === '/forgot-password') return 'forgot-password';
  if (pathname === '/reset-status') return 'reset-status';
  if (pathname === '/reset-password') return 'reset-password';
  return 'login';
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [pendingGrants, setPendingGrants] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pathname, setPathname] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );

  // When an admin opens a student's workspace under explicit student authorization
  const [supportStudent, setSupportStudent] = useState<AdminStudent | null>(null);

  const navigate = useCallback((to: string, { replace = false } = {}) => {
    const clean = normalizePath(to);
    if (normalizePath(window.location.pathname) !== clean) {
      if (replace) {
        window.history.replaceState({}, '', clean);
      } else {
        window.history.pushState({}, '', clean);
      }
    }
    setPathname(clean);
  }, []);

  useEffect(() => {
    applyTheme(getStoredTheme(), false);
    const syncFromStorage = () => {
      applyTheme(getStoredTheme(), false);
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const isLoggedInRef = useRef(false);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => {
      if (prev.some((t) => t.type === type && t.text === text)) {
        return prev;
      }
      return [...prev, { id, type, text }];
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    apiRequest<{ user: User; storage: StorageSummary; pendingGrantCount: number }>('/api/auth/me')
      .then((res) => {
        isLoggedInRef.current = true;
        setUser(res.user);
        setStorage(res.storage);
        setPendingGrants(res.pendingGrantCount || 0);
      })
      .catch(() => {
        isLoggedInRef.current = false;
        setUser(null);
      })
      .finally(() => setBootstrapping(false));
  }, []);

  // If the server invalidates or loses an active session (e.g. session expiry or ephemeral cloud reset),
  // clear client state cleanly and return to /login instead of showing dead dashboard controls.
  useEffect(() => {
    const onUnauthorized = (ev: Event) => {
      if (!isLoggedInRef.current) {
        return;
      }
      isLoggedInRef.current = false;
      const detail = (ev as CustomEvent<string>).detail;
      setUser(null);
      setStorage(null);
      setSupportStudent(null);
      notify(
        'error',
        detail || 'Nag-expire ang iyong sesyon. Mangyaring mag-log in muli upang magpatuloy.'
      );
      navigate('/login', { replace: true });
    };
    window.addEventListener('tintalata:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tintalata:unauthorized', onUnauthorized);
  }, [navigate, notify]);

  // Strict route & role guard with automatic redirection
  useEffect(() => {
    if (bootstrapping) return;

    const isAuthRoute =
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-status' ||
      pathname === '/reset-password';
    const isAdminRoute = pathname.startsWith('/admin');
    const isStudentRoute =
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/trash') ||
      pathname.startsWith('/storage') ||
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/profile');

    if (!user || !storage) {
      if (!isAuthRoute) {
        if (isAdminRoute || isStudentRoute) {
          notify('error', 'Kailangan munang mag-log in upang mabuksan ang dashboard.');
        }
        navigate('/login', { replace: true });
      }
      return;
    }

    if (user.role === 'admin') {
      if (!isAdminRoute) {
        navigate('/admin', { replace: true });
      }
      return;
    }

    // Student role guard
    if (isAdminRoute) {
      notify('error', 'Walang pahintulot: Ang Admin Dashboard ay para lamang sa Tagapangasiwa.');
      navigate('/dashboard', { replace: true });
      return;
    }

    if (isAuthRoute || pathname === '/') {
      navigate('/dashboard', { replace: true });
    }
  }, [bootstrapping, user, storage, pathname, navigate, notify]);

  const handleAuthSuccess = (nextUser: User, nextStorage: StorageSummary, message: string) => {
    isLoggedInRef.current = true;
    setUser(nextUser);
    setStorage(nextStorage);
    setSupportStudent(null);
    notify('success', message);
    navigate(nextUser.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
  };

  const handleLogout = async () => {
    isLoggedInRef.current = false;
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/logout', { method: 'POST' });
      notify('info', res.message);
    } catch {
      // clear locally anyway
    }
    setUser(null);
    setStorage(null);
    setSupportStudent(null);
    navigate('/login', { replace: true });
  };

  if (bootstrapping) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-[#f4f8ff] via-white to-[#e8f1ff] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <TintalataLogo size="lg" />
          </div>
          <div className="mx-auto h-8 w-8 rounded-full border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 animate-spin" />
          <p className="text-sm font-bold text-blue-900 dark:text-blue-200">Inihahanda ang Tintalata...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {pathname === '/reset-password' || !user || !storage ? (
        <AuthPage
          mode={getAuthModeFromPath(pathname)}
          onNavigateMode={(next) => navigate(`/${next}`)}
          onSuccess={handleAuthSuccess}
          onNotify={notify}
        />
      ) : user.role === 'admin' ? (
        supportStudent && supportStudent.authorization.state === 'approved' ? (
          <StudentWorkspace
            currentUser={user}
            initialStorage={{
              quotaBytes: supportStudent.storageQuotaBytes,
              usedBytes: supportStudent.storageUsedBytes,
              remainingBytes: Math.max(
                0,
                supportStudent.storageQuotaBytes - supportStudent.storageUsedBytes
              ),
              activeBytes: supportStudent.storageUsedBytes,
              trashBytes: 0,
              quotaMB: supportStudent.storageQuotaMB,
              usedMB: supportStudent.storageUsedMB,
              remainingMB: supportStudent.storageRemainingMB,
              activeMB: supportStudent.storageUsedMB,
              trashMB: 0,
              percentUsed:
                supportStudent.storageQuotaBytes > 0
                  ? Number(
                      (
                        (supportStudent.storageUsedBytes / supportStudent.storageQuotaBytes) *
                        100
                      ).toFixed(1)
                    )
                  : 0,
              activeDocCount: supportStudent.activeDocCount,
              trashDocCount: supportStudent.trashDocCount,
              activeFolderCount: supportStudent.activeFolderCount,
              trashFolderCount: 0,
            }}
            initialPendingGrants={0}
            supportContext={{
              studentId: supportStudent.id,
              studentName: supportStudent.fullName,
              permissionLevel: supportStudent.authorization.permissionLevel || 'read',
              onExitSupport: () => {
                setSupportStudent(null);
                navigate('/admin');
              },
            }}
            onUserUpdated={setUser}
            onLogout={handleLogout}
            onNotify={notify}
          />
        ) : (
          <AdminDashboard
            user={user}
            onLogout={handleLogout}
            onOpenAuthorizedWorkspace={(student) => {
              setSupportStudent(student);
              navigate(`/admin/support/${student.id}`);
            }}
            onNotify={notify}
          />
        )
      ) : (
        <StudentWorkspace
          currentUser={user}
          initialStorage={storage}
          initialPendingGrants={pendingGrants}
          onUserUpdated={setUser}
          onLogout={handleLogout}
          onNotify={notify}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
