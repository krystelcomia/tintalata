import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, X, Check, Ban, KeyRound, Clock } from 'lucide-react';
import { apiRequest, formatDateTimeTL } from '../utils/api';
import type { AccessGrant, AuditLogEntry } from '../types';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onPendingCountChange: (count: number) => void;
}

export function PrivacyModal({
  isOpen,
  onClose,
  onNotify,
  onPendingCountChange,
}: PrivacyModalProps) {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'read_write'>('read');
  const [durationHours, setDurationHours] = useState(24);
  const [reason, setReason] = useState('Suportang teknikal mula sa Tagapangasiwa');

  const fetchPrivacyData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ grants: AccessGrant[]; auditLogs: AuditLogEntry[] }>(
        '/api/privacy/grants'
      );
      setGrants(res.grants);
      setLogs(res.auditLogs);
      onPendingCountChange(res.grants.filter((g) => g.status === 'pending').length);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi makuha ang talaan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPrivacyData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pendingGrants = grants.filter((g) => g.status === 'pending');
  const activeGrant = grants.find((g) => g.status === 'approved');

  const handleRespond = async (
    grantId: string,
    decision: 'approved' | 'denied',
    level: 'read' | 'read_write'
  ) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/privacy/grants/${grantId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision, permissionLevel: level, durationHours: 24 }),
      });
      onNotify('success', res.message);
      await fetchPrivacyData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'May naganap na error.');
    }
  };

  const handleRevoke = async (grantId: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/privacy/grants/${grantId}/revoke`, {
        method: 'POST',
      });
      onNotify('success', res.message);
      await fetchPrivacyData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi nabawi ang pahintulot.');
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>('/api/privacy/grants', {
        method: 'POST',
        body: JSON.stringify({ permissionLevel, durationHours, reason }),
      });
      onNotify('success', res.message);
      await fetchPrivacyData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi naibigay ang pahintulot.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-600 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-bold">Sentro ng Pagkapribado at Pahintulot</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            className="rounded-lg p-1 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Privacy Guarantee Banner */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-700 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-blue-950 text-sm mb-0.5">
                Pribado ang Lahat ng Iyong Dokumento at Folder
              </p>
              <p>
                Bilang default, hindi maaaring buksan, basahin, o baguhin ng Tagapangasiwa (Admin)
                ang alinman sa iyong mga dokumento at guhit maliban na lamang kung bibigyan mo siya
                ng malinaw na pahintulot dito.
              </p>
            </div>
          </div>

          {/* Pending Requests from Admin */}
          {pendingGrants.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                May Kahilingan ng Pahintulot mula sa Tagapangasiwa
              </h4>
              {pendingGrants.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{g.adminName}</p>
                      <p className="text-xs text-slate-600">
                        Hinihiling:{' '}
                        <strong>
                          {g.permissionLevel === 'read_write'
                            ? 'Basahin at I-edit'
                            : 'Basahin Lamang'}
                        </strong>{' '}
                        • {formatDateTimeTL(g.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 bg-white/80 rounded-xl px-3 py-2 border border-amber-100">
                    Dahilan: {g.reason}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(g.id, 'approved', 'read')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Aprubahan (Basahin Lamang)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(g.id, 'approved', 'read_write')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Aprubahan (Basahin at I-edit)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(g.id, 'denied', g.permissionLevel)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Tanggihan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Grant Status */}
          {activeGrant ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-emerald-950">
                  Aktibong Pahintulot: {activeGrant.adminName}
                </p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Antas:{' '}
                  <strong>
                    {activeGrant.permissionLevel === 'read_write'
                      ? 'Basahin at I-edit'
                      : 'Basahin Lamang'}
                  </strong>{' '}
                  • Mawawalan ng bisa sa: {formatDateTimeTL(activeGrant.expiresAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(activeGrant.id)}
                className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Bawiin ang Pahintulot
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleCreateGrant}
              className="rounded-2xl border border-slate-200 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Magbigay ng Pansamantalang Pahintulot sa Tagapangasiwa
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Antas ng Pag-access
                  </label>
                  <select
                    value={permissionLevel}
                    onChange={(e) => setPermissionLevel(e.target.value as 'read' | 'read_write')}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
                  >
                    <option value="read">Basahin Lamang (Tingnan at I-download)</option>
                    <option value="read_write">Basahin at I-edit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tagal ng Pahintulot
                  </label>
                  <select
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
                  >
                    <option value={1}>1 Oras</option>
                    <option value={6}>6 na Oras</option>
                    <option value={24}>24 na Oras</option>
                    <option value={72}>3 Araw</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tala o Dahilan
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Ibigay ang Pahintulot
                </button>
              </div>
            </form>
          )}

          {/* Security Audit Logs */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-600" />
              Kamakailang Aktibidad sa Seguridad
            </h4>
            {loading ? (
              <p className="text-xs text-slate-500">Kinukuha ang talaan...</p>
            ) : logs.length === 0 ? (
              <p className="text-xs text-slate-500">Wala pang naitalang aktibidad.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className="px-3.5 py-2.5 text-xs flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800">{l.details || l.action}</p>
                      <p className="text-[11px] text-slate-500">Ni: {l.actorName}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatDateTimeTL(l.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
