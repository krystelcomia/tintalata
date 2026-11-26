import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, AlertTriangle, KeyRound, Clock } from 'lucide-react';
import type { StudentNotification } from '../types';
import { apiRequest, formatDateTimeTL } from '../utils/api';

interface NotificationBellProps {
  disabled?: boolean;
  onNotify?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function NotificationBell({ disabled = false, onNotify }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    if (disabled) return;
    try {
      const res = await apiRequest<{
        notifications: StudentNotification[];
        unreadCount: number;
      }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // keep existing silently
    }
  }, [disabled]);

  useEffect(() => {
    if (disabled) return;
    void loadNotifications();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
      }
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
      }
    }, 15000);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [disabled, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (disabled) return null;

  const markAsRead = async (notif: StudentNotification) => {
    if (notif.isRead) return;
    try {
      const res = await apiRequest<{ unreadCount: number }>(
        `/api/notifications/${notif.id}/read`,
        { method: 'POST' }
      );
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount(res.unreadCount);
    } catch (err) {
      onNotify?.('error', err instanceof Error ? err.message : 'Hindi na-update ang abiso.');
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || now }))
      );
      setUnreadCount(0);
    } catch (err) {
      onNotify?.('error', err instanceof Error ? err.message : 'Hindi namarkahang nabasa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadNotifications();
        }}
        aria-label="Mga Abiso"
        title="Mga Abiso"
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-xl border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 transition"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-blue-100 bg-white shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/60 px-4 py-3">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900">Mga Abiso sa Account</h3>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} hindi pa nababasang abiso`
                  : 'Lahat ng abiso ay nabasa na'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1 rounded-lg bg-white border border-blue-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Markahang Nabasa
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Wala pang abiso sa iyong account.
              </div>
            ) : (
              notifications.map((n) => {
                const isRejected = n.type === 'password_reset_rejected';
                const isApproved = n.type === 'password_reset_approved';
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void markAsRead(n)}
                    className={`w-full text-left px-4 py-3.5 transition flex items-start gap-3 ${
                      n.isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/50 hover:bg-blue-50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isRejected
                          ? 'bg-rose-100 text-rose-600'
                          : isApproved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isRejected ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : isApproved ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-slate-900 truncate">{n.title}</p>
                        {!n.isRead && (
                          <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">{n.message}</p>
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatDateTimeTL(n.createdAt)}
                        {n.isRead ? ' • Nabasa' : ' • Pindutin upang markahang nabasa'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
