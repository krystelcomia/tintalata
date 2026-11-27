import { useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, FileText, Menu } from 'lucide-react';
import type { TrashDocument, TrashFolder } from '../types';
import { formatBytes, formatDateTimeTL } from '../utils/api';
import { FolderIconBadge } from './FolderIconBadge';

interface TrashViewProps {
  folders: TrashFolder[];
  documents: TrashDocument[];
  loading: boolean;
  readOnly?: boolean;
  onOpenSidebar: () => void;
  onRestoreFolder: (id: string) => Promise<void>;
  onRestoreDocument: (id: string) => Promise<void>;
  onPermanentDeleteFolder: (id: string, name: string) => Promise<void>;
  onPermanentDeleteDocument: (id: string, title: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
}

export function TrashView({
  folders,
  documents,
  loading,
  readOnly = false,
  onOpenSidebar,
  onRestoreFolder,
  onRestoreDocument,
  onPermanentDeleteFolder,
  onPermanentDeleteDocument,
  onEmptyTrash,
}: TrashViewProps) {
  const [confirmTarget, setConfirmTarget] = useState<
    | { type: 'empty'; meta: string }
    | { type: 'folder'; id: string; label: string; meta: string }
    | { type: 'document'; id: string; label: string; meta: string }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  const totalItems = folders.length + documents.length;

  const handleConfirmPermanent = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      if (confirmTarget.type === 'empty') {
        await onEmptyTrash();
      } else if (confirmTarget.type === 'folder') {
        await onPermanentDeleteFolder(confirmTarget.id, confirmTarget.label);
      } else {
        await onPermanentDeleteDocument(confirmTarget.id, confirmTarget.label);
      }
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col tintalata-canvas">
      {/* Header */}
      <div className="tintalata-header-bar px-4 sm:px-6 py-3 min-h-[76px] lg:h-[76px] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="lg:hidden rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 transition-colors duration-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 shadow-sm shadow-blue-600/20 flex items-center justify-center text-white">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Basurahan (Recycle Bin)</h2>
            <p className="text-xs text-slate-500">
              Dito iniimbak ang mga naburang dokumento at folder. Maaaring ibalik o tuluyang burahin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && totalItems > 0 && (
            <button
              type="button"
              onClick={() =>
                setConfirmTarget({
                  type: 'empty',
                  meta: `${documents.length} dokumento at ${folders.length} folder`,
                })
              }
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-rose-700 hover:to-red-700 transition-all duration-300"
            >
              <Trash2 className="h-4 w-4" />
              Linisin Lahat sa Basurahan
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {loading ? (
          <div className="rounded-2xl border border-blue-100 bg-white p-10 text-center text-sm text-slate-500">
            Kinukuha ang laman ng Basurahan...
          </div>
        ) : totalItems === 0 ? (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-12 text-center">
            <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Walang laman ang Basurahan</h3>
            <p className="mt-1 text-xs text-slate-500">
              Ang mga dokumento o folder na iyong buburahin ay mapupunta rito bago tuluyang
              maalis.
            </p>
          </div>
        ) : (
          <>
            {/* Deleted Folders */}
            {folders.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800">
                  Mga Naburang Folder ({folders.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="rounded-2xl border border-blue-100 bg-white p-4 shadow-2xs flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <FolderIconBadge icon={folder.icon} color={folder.color} />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">{folder.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {folder.nestedDocCount} dokumento • {folder.nestedFolderCount} subfolder •{' '}
                            {formatBytes(folder.nestedBytes)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Binura noong: {formatDateTimeTL(folder.deletedAt)}
                          </p>
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => void onRestoreFolder(folder.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Ibalik
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmTarget({
                                type: 'folder',
                                id: folder.id,
                                label: folder.name,
                                meta: `${folder.nestedDocCount} dokumento • ${folder.nestedFolderCount} subfolder • ${formatBytes(folder.nestedBytes)}`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Burahin Nang Tuluyan
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Deleted Documents */}
            {documents.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800">
                  Mga Naburang Dokumento ({documents.length})
                </h3>
                <div className="divide-y divide-slate-100 rounded-2xl border border-blue-100 bg-white overflow-hidden shadow-2xs">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-blue-50/40"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{doc.title}</p>
                          <p className="text-xs text-slate-500">
                            Orihinal na lokasyon:{' '}
                            <strong>{doc.originalFolderName || 'Pangunahing Lalagyan'}</strong> •{' '}
                            {formatBytes(doc.sizeBytes)} • {doc.wordCount} salita
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Binura noong: {formatDateTimeTL(doc.deletedAt)}
                          </p>
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void onRestoreDocument(doc.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Ibalik
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmTarget({
                                type: 'document',
                                id: doc.id,
                                label: doc.title,
                                meta: `${formatBytes(doc.sizeBytes)} • ${doc.wordCount} salita`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Burahin Nang Tuluyan
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-rose-200 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <span className="inline-block rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-700 mb-1">
                  Babala — Hindi na Maibabalik
                </span>
                <h4 className="text-base font-bold text-slate-900">
                  Kumpirmahin ang Tuluyang Pagbura
                </h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {confirmTarget.type === 'empty' ? (
                    <>
                      Sigurado ka bang nais mong tuluyang burahin ang <strong>LAHAT</strong> ng laman
                      ng Basurahan ({confirmTarget.meta})? Tuluyan na itong mabubura nang
                      permanente at hindi na maibabalik pa.
                    </>
                  ) : (
                    <>
                      Sigurado ka bang nais mong tuluyang burahin ang{' '}
                      {confirmTarget.type === 'folder' ? 'folder' : 'file'} na{' '}
                      <strong className="text-slate-900">&ldquo;{confirmTarget.label}&rdquo;</strong>{' '}
                      ({confirmTarget.meta})? Tuluyan na itong mabubura nang permanente at hindi na
                      maibabalik pa.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={busy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kanselahin
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPermanent()}
                disabled={busy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? 'Binubura...' : 'Oo, Burahin Nang Tuluyan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
