import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Check, Ban, KeyRound, Clock, Menu } from 'lucide-react';
import { apiRequest, formatDateTimeTL } from '../utils/api';
import type { AccessGrant, AuditLogEntry } from '../types';

interface PrivacyPageViewProps {
  onOpenSidebar: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onPendingCountChange: (count: number) => void;
}

export function PrivacyPageView({
  onOpenSidebar,
  onNotify,
  onPendingCountChange,
}: PrivacyPageViewProps) {
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
    void fetchPrivacyData();
  }, []);

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
    <div className="flex h-full flex-col tintalata-canvas">
      <header className="tintalata-header-bar px-5 sm:px-6 py-3 min-h-[76px] lg:h-[76px] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buksan ang Sidebar"
            className="lg:hidden rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 transition-colors duration-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/20 flex items-center justify-center text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Pagkapribado at Pahintulot sa Pag-access
            </h2>
            <p className="text-xs text-slate-500">
              Ikaw ang may buong kontrol kung maaaring magbigay ng suporta ang Tagapangasiwa sa
              iyong mga file.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
        <div className="rounded-2xl border border-blue-200 bg-white p-5 flex items-start gap-3.5 shadow-2xs">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <p className="font-bold text-blue-950 text-sm mb-1">
              Garantiya ng Pagkapribado ng Mag-aaral
            </p>
            <p>
              Bilang default, pribado ang lahat ng iyong mga dokumento, guhit, at folder. Hindi
              maaaring buksan o baguhin ng Admin ang iyong mga pribadong file nang walang
              malinaw na pahintulot mula sa iyo.
            </p>
          </div>
        </div>

        {pendingGrants.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Nakabinbing Kahilingan mula sa Tagapangasiwa ({pendingGrants.length})
            </h3>
            {pendingGrants.map((g) => (
              <div
                key={g.id}
                className="rounded-2xl border border-amber-200 bg-white p-5 space-y-3 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{g.adminName}</p>
                    <p className="text-xs text-slate-500">
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
                <p className="text-xs text-slate-700 bg-amber-50/70 rounded-xl px-3.5 py-2.5 border border-amber-100">
                  Dahilan: {g.reason}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRespond(g.id, 'approved', 'read')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprubahan (Basahin Lamang)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRespond(g.id, 'approved', 'read_write')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprubahan (Basahin at I-edit)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRespond(g.id, 'denied', g.permissionLevel)}
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Grant Controls */}
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs space-y-4">
            {activeGrant ? (
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-emerald-900">
                  Kasalukuyang May Aktibong Pahintulot
                </h3>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                  <p className="text-sm font-bold text-emerald-950">{activeGrant.adminName}</p>
                  <p className="text-xs text-emerald-800">
                    Antas:{' '}
                    <strong>
                      {activeGrant.permissionLevel === 'read_write'
                        ? 'Basahin at I-edit'
                        : 'Basahin Lamang'}
                    </strong>
                  </p>
                  <p className="text-xs text-emerald-700">
                    Mawawalan ng bisa sa: {formatDateTimeTL(activeGrant.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(activeGrant.id)}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Bawiin Agad ang Pahintulot
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateGrant} className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Magbigay ng Pansamantalang Pahintulot sa Tagapangasiwa
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Antas ng Pag-access
                    </label>
                    <select
                      value={permissionLevel}
                      onChange={(e) =>
                        setPermissionLevel(e.target.value as 'read' | 'read_write')
                      }
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
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Ibigay ang Pahintulot
                </button>
              </form>
            )}
          </div>

          {/* Audit Logs */}
          <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden flex flex-col">
            <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3.5 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Talaan ng Aktibidad sa Seguridad
              </h3>
            </div>
            {loading ? (
              <p className="p-5 text-xs text-slate-500">Kinukuha ang talaan...</p>
            ) : logs.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">Wala pang naitalang aktibidad.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className="px-5 py-3 text-xs flex justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{l.details || l.action}</p>
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
