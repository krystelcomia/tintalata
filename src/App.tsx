import { useCallback, useEffect, useState } from 'react';
import type { AdminStudent, StorageSummary, ToastMessage, User } from './types';
import { apiRequest } from './utils/api';
import { AuthPage } from './components/AuthPage';
import { StudentWorkspace } from './components/StudentWorkspace';
import { AdminDashboard } from './components/AdminDashboard';
import { ToastContainer } from './components/ToastContainer';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [pendingGrants, setPendingGrants] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // When an admin opens a student's workspace under explicit student authorization
  const [supportStudent, setSupportStudent] = useState<AdminStudent | null>(null);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
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
        setUser(res.user);
        setStorage(res.storage);
        setPendingGrants(res.pendingGrantCount || 0);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setBootstrapping(false));
  }, []);

  const handleAuthSuccess = (nextUser: User, nextStorage: StorageSummary, message: string) => {
    setUser(nextUser);
    setStorage(nextStorage);
    setSupportStudent(null);
    notify('success', message);
  };

  const handleLogout = async () => {
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/logout', { method: 'POST' });
      notify('info', res.message);
    } catch {
      // clear locally anyway
    }
    setUser(null);
    setStorage(null);
    setSupportStudent(null);
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-[#f4f8ff] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-blue-800">Inihahanda ang Tintalata...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!user || !storage ? (
        <AuthPage onSuccess={handleAuthSuccess} />
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
              onExitSupport: () => setSupportStudent(null),
            }}
            onUserUpdated={setUser}
            onLogout={handleLogout}
            onNotify={notify}
          />
        ) : (
          <AdminDashboard
            user={user}
            onLogout={handleLogout}
            onOpenAuthorizedWorkspace={(student) => setSupportStudent(student)}
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
