import { useEffect, useState } from 'react';
import { HardDrive, X, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { apiRequest, formatBytes, formatDateTimeTL } from '../utils/api';
import type { StorageSummary } from '../types';

interface LargestDoc {
  id: string;
  title: string;
  sizeBytes: number;
  isDeleted: boolean;
  updatedAt: string;
}

interface StorageModalProps {
  isOpen: boolean;
  storage: StorageSummary;
  supportStudentId?: string;
  onClose: () => void;
  onOpenDocument: (docId: string) => void;
  onOpenTrash: () => void;
}

export function StorageModal({
  isOpen,
  storage,
  supportStudentId,
  onClose,
  onOpenDocument,
  onOpenTrash,
}: StorageModalProps) {
  const [largestDocs, setLargestDocs] = useState<LargestDoc[]>([]);
  const [liveStorage, setLiveStorage] = useState<StorageSummary>(storage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLiveStorage(storage);
  }, [storage]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    apiRequest<{ storage: StorageSummary; largestDocuments: LargestDoc[] }>('/api/storage', {
      supportStudentId,
    })
      .then((res) => {
        setLiveStorage(res.storage);
        setLargestDocs(res.largestDocuments);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, supportStudentId]);

  if (!isOpen) return null;

  const barColor =
    liveStorage.percentUsed >= 90
      ? 'bg-rose-600'
      : liveStorage.percentUsed >= 75
        ? 'bg-amber-500'
        : 'bg-blue-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-5 w-5" />
            <h3 className="text-base font-bold">Pamamahala ng Storage</h3>
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

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Capacity Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs font-semibold text-blue-700">Kabuuang Kapasidad</p>
              <p className="mt-1 text-2xl font-extrabold text-blue-950">
                {liveStorage.quotaMB.toFixed(2)} MB
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatBytes(liveStorage.quotaBytes)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500">Nagamit na Espasyo</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {liveStorage.usedMB.toFixed(2)} MB
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatBytes(liveStorage.usedBytes)} ({liveStorage.percentUsed}%)
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-semibold text-emerald-700">Natitirang Espasyo</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">
                {liveStorage.remainingMB.toFixed(2)} MB
              </p>
              <p className="text-[11px] text-emerald-700/80 mt-0.5">
                {formatBytes(liveStorage.remainingBytes)} ang bakante
              </p>
            </div>
          </div>

          {/* Progress Bar + Breakdown */}
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Paggamit ng Storage ({liveStorage.percentUsed}%)</span>
              <span>
                {liveStorage.usedMB.toFixed(2)} MB / {liveStorage.quotaMB.toFixed(2)} MB
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.max(liveStorage.usedBytes > 0 ? 2 : 0, liveStorage.percentUsed)}%` }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-blue-50/50 px-3 py-2 border border-blue-100">
                <span className="text-slate-700 font-medium">
                  Mga Aktibong Dokumento ({liveStorage.activeDocCount})
                </span>
                <span className="font-bold text-blue-800">{formatBytes(liveStorage.activeBytes)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-amber-50/60 px-3 py-2 border border-amber-200">
                <span className="text-slate-700 font-medium">
                  Nasa Basurahan ({liveStorage.trashDocCount})
                </span>
                <span className="font-bold text-amber-800">{formatBytes(liveStorage.trashBytes)}</span>
              </div>
            </div>

            {liveStorage.trashBytes > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    May mga file sa Basurahan na kumukunsumo ng{' '}
                    <strong>{formatBytes(liveStorage.trashBytes)}</strong>. Burahin ang mga ito
                    nang tuluyan upang mabawi ang espasyo.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTrash();
                  }}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
                >
                  Buksan ang Basurahan
                </button>
              </div>
            )}
          </div>

          {/* Largest Documents */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2.5">
              Pinakamalalaking Dokumento at Guhit
            </h4>
            {loading ? (
              <p className="text-xs text-slate-500 py-4">Sinusuri ang laki ng mga file...</p>
            ) : largestDocs.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 rounded-xl border border-dashed border-slate-200 text-center">
                Wala pang nakaimbak na dokumento.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                {largestDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-blue-50/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {doc.isDeleted ? (
                        <Trash2 className="h-4 w-4 text-amber-600 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{doc.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {doc.isDeleted ? 'Nasa Basurahan' : 'Aktibong File'} • Huling binago:{' '}
                          {formatDateTimeTL(doc.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                        {formatBytes(doc.sizeBytes)}
                      </span>
                      {!doc.isDeleted ? (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenDocument(doc.id);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Buksan
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenTrash();
                          }}
                          className="text-xs font-semibold text-amber-700 hover:underline"
                        >
                          Tingnan
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
    </div>
  );
}
