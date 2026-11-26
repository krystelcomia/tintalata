import { useEffect, useState } from 'react';
import { HardDrive, FileText, Trash2, AlertTriangle, Menu, RefreshCw, ArrowLeft } from 'lucide-react';
import { apiRequest, formatBytes, formatDateTimeTL } from '../utils/api';
import type { StorageSummary } from '../types';

interface LargestDoc {
  id: string;
  title: string;
  sizeBytes: number;
  isDeleted: boolean;
  updatedAt: string;
}

interface StoragePageViewProps {
  storage: StorageSummary;
  supportStudentId?: string;
  onOpenSidebar: () => void;
  onBackToProfile?: () => void;
  onOpenDocument: (docId: string) => void;
  onOpenTrash: () => void;
  onStorageSynced: (storage: StorageSummary) => void;
}

export function StoragePageView({
  storage,
  supportStudentId,
  onOpenSidebar,
  onBackToProfile,
  onOpenDocument,
  onOpenTrash,
  onStorageSynced,
}: StoragePageViewProps) {
  const [largestDocs, setLargestDocs] = useState<LargestDoc[]>([]);
  const [liveStorage, setLiveStorage] = useState<StorageSummary>(storage);
  const [loading, setLoading] = useState(false);

  const loadStorage = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ storage: StorageSummary; largestDocuments: LargestDoc[] }>(
        '/api/storage',
        { supportStudentId }
      );
      setLiveStorage(res.storage);
      setLargestDocs(res.largestDocuments);
      onStorageSynced(res.storage);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLiveStorage(storage);
  }, [storage]);

  useEffect(() => {
    void loadStorage();
  }, [supportStudentId]);

  const barColor =
    liveStorage.percentUsed >= 90
      ? 'bg-rose-600'
      : liveStorage.percentUsed >= 75
        ? 'bg-amber-500'
        : 'bg-blue-600';

  return (
    <div className="flex h-full flex-col bg-[#f4f8ff]">
      <header className="bg-gradient-to-b from-blue-800 via-blue-700 to-blue-600 border-b border-blue-700/50 px-5 sm:px-6 py-4 min-h-[76px] flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buksan ang Sidebar"
            className="lg:hidden rounded-xl border border-white/25 bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-white">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">Pamamahala ng Storage</h2>
            <p className="text-xs text-blue-100">
              Awtomatikong pagsubaybay sa kabuuang kapasidad, nagamit, at natitirang espasyo sa MB.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToProfile && (
            <button
              type="button"
              onClick={onBackToProfile}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/25 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Bumalik sa Profile at Mga Setting
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadStorage()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-blue-800 shadow-sm hover:bg-blue-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            I-refresh
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
        {/* Full-Width Storage KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-sm">
            <p className="text-xs font-semibold text-blue-100">Kabuuang Kapasidad</p>
            <p className="mt-2 text-3xl font-extrabold">{liveStorage.quotaMB.toFixed(2)} MB</p>
            <p className="text-xs text-blue-100 mt-1">{formatBytes(liveStorage.quotaBytes)}</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Nagamit na Espasyo</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {liveStorage.usedMB.toFixed(2)} MB
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {formatBytes(liveStorage.usedBytes)} ({liveStorage.percentUsed}% ng kapasidad)
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-emerald-700">Natitirang Espasyo</p>
            <p className="mt-2 text-3xl font-extrabold text-emerald-900">
              {liveStorage.remainingMB.toFixed(2)} MB
            </p>
            <p className="text-xs text-emerald-700/80 mt-1">
              {formatBytes(liveStorage.remainingBytes)} ang magagamit pa
            </p>
          </div>
        </div>

        {/* Full-Width Progress Breakdown */}
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-slate-800">
            <span>Pagsusuri ng Espasyo ({liveStorage.percentUsed}%)</span>
            <span className="text-blue-800">
              {liveStorage.usedMB.toFixed(2)} MB / {liveStorage.quotaMB.toFixed(2)} MB
            </span>
          </div>
          <div className="h-3.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{
                width: `${Math.max(liveStorage.usedBytes > 0 ? 2 : 0, liveStorage.percentUsed)}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-blue-50/70 px-4 py-3 border border-blue-100">
              <span className="font-semibold text-slate-700">
                Mga Aktibong Dokumento ({liveStorage.activeDocCount})
              </span>
              <span className="font-extrabold text-blue-800">
                {formatBytes(liveStorage.activeBytes)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-amber-50/70 px-4 py-3 border border-amber-200">
              <span className="font-semibold text-slate-700">
                Nasa Basurahan ({liveStorage.trashDocCount})
              </span>
              <span className="font-extrabold text-amber-800">
                {formatBytes(liveStorage.trashBytes)}
              </span>
            </div>
          </div>

          {liveStorage.trashBytes > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  May mga file sa Basurahan na gumagamit ng{' '}
                  <strong>{formatBytes(liveStorage.trashBytes)}</strong>. Burahin nang tuluyan sa
                  Basurahan upang mabawi ang espasyo.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenTrash}
                className="rounded-xl bg-amber-600 px-3.5 py-1.5 font-bold text-white hover:bg-amber-700"
              >
                Pumunta sa Basurahan
              </button>
            </div>
          )}
        </div>

        {/* Full-Width Largest Documents Table */}
        <div className="rounded-2xl border border-blue-100 bg-white shadow-2xs overflow-hidden">
          <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3.5">
            <h3 className="text-sm font-extrabold text-slate-900">
              Pinakamalalaking Dokumento at Guhit
            </h3>
          </div>
          {loading && largestDocs.length === 0 ? (
            <p className="p-6 text-xs text-slate-500">Sinusuri ang mga file...</p>
          ) : largestDocs.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">
              Wala pang nakaimbak na dokumento sa iyong account.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {largestDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-blue-50/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                        doc.isDeleted
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      {doc.isDeleted ? (
                        <Trash2 className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{doc.title}</p>
                      <p className="text-xs text-slate-500">
                        {doc.isDeleted ? 'Nasa Basurahan' : 'Aktibong File'} • Huling binago:{' '}
                        {formatDateTimeTL(doc.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {formatBytes(doc.sizeBytes)}
                    </span>
                    {!doc.isDeleted ? (
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc.id)}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Buksan
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenTrash}
                        className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        Tingnan sa Basurahan
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
