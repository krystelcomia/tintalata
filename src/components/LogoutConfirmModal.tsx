import { AlertTriangle, LogOut } from 'lucide-react';

interface LogoutConfirmModalProps {
  open: boolean;
  busy: boolean;
  accountLabel?: string;
  isAdmin?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Prompts the user with a confirmation caution modal before ending their session,
 * preventing accidental single-click logouts.
 */
export function LogoutConfirmModal({
  open,
  busy,
  accountLabel,
  isAdmin = false,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-caution-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-blue-200 space-y-4 text-xs"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="inline-block rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 mb-1">
              Paalala Bago Mag-log Out
            </span>
            <h3 id="logout-caution-title" className="text-base font-bold text-slate-900">
              Sigurado ka bang nais mong mag-log out?
            </h3>
            <p className="mt-1.5 text-slate-600 leading-relaxed">
              {isAdmin ? (
                <>
                  Tuluyan nang matatapos ang iyong kasalukuyang sesyon
                  {accountLabel ? ` (${accountLabel})` : ''}. Kakailanganin mong mag-log in muli
                  upang pamahalaan ang sistema.
                </>
              ) : (
                <>
                  Kung napindot mo lamang ito nang hindi sinasadya, maaari kang mag-kansela.
                  Tiyaking na-save mo na ang lahat ng iyong gawain bago tuluyang lumabas sa account
                  {accountLabel ? ` (${accountLabel})` : ''}.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60 transition-colors duration-200 cursor-pointer"
          >
            Kanselahin
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 font-bold text-white shadow-sm hover:from-rose-700 hover:to-red-700 disabled:opacity-60 transition-all duration-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            {busy ? 'Nagla-log out...' : 'Oo, Mag-log out'}
          </button>
        </div>
      </div>
    </div>
  );
}
