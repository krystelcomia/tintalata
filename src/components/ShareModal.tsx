import { useEffect, useState } from 'react';
import { Share2, Trash2, X, UserPlus } from 'lucide-react';
import type { DocumentShareItem } from '../types';
import { apiRequest } from '../utils/api';

interface ShareModalProps {
  isOpen: boolean;
  documentId: string;
  documentTitle: string;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onChanged: () => void;
}

export function ShareModal({
  isOpen,
  documentId,
  documentTitle,
  onClose,
  onNotify,
  onChanged,
}: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'read_write'>('read');
  const [shares, setShares] = useState<DocumentShareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadShares = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ shares: DocumentShareItem[] }>(
        `/api/documents/${documentId}/shares`
      );
      setShares(res.shares);
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && documentId) {
      void loadShares();
    }
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/documents/${documentId}/share`, {
        method: 'POST',
        body: JSON.stringify({ email, permissionLevel }),
      });
      onNotify('success', res.message);
      setEmail('');
      await loadShares();
      onChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi naibahagi ang dokumento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/documents/${documentId}/shares/${shareId}`,
        { method: 'DELETE' }
      );
      onNotify('info', res.message);
      await loadShares();
      onChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi maalis ang pagbabahagi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <Share2 className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">Ibahagi ang Dokumento</h3>
              <p className="text-[11px] text-blue-100 truncate">{documentTitle}</p>
            </div>
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

        <div className="p-5 space-y-4">
          <form onSubmit={handleShare} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Email ng Kapwa Mag-aaral
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kaklase@paaralan.ph"
                className="w-full rounded-xl border border-blue-200 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={permissionLevel}
                onChange={(e) => setPermissionLevel(e.target.value as 'read' | 'read_write')}
                className="flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="read">Basahin Lamang</option>
                <option value="read_write">Maaaring Mag-edit</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {submitting ? 'Ibinabahagi...' : 'Ibahagi'}
              </button>
            </div>
          </form>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-700 mb-2">
              Mga Taong May Access ({shares.length})
            </p>
            {loading ? (
              <p className="text-xs text-slate-400">Kinukuha ang listahan...</p>
            ) : shares.length === 0 ? (
              <p className="text-xs text-slate-400">
                Pribado pa ang dokumentong ito sa iyo lamang.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                {shares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{s.recipientName}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {s.recipientEmail} •{' '}
                        {s.permissionLevel === 'read_write' ? 'Maaaring Mag-edit' : 'Basahin Lamang'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(s.id)}
                      title="Alisin ang access"
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
