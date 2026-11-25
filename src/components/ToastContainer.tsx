import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-2.5"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur transition-all ${
              isError
                ? 'border-rose-200 bg-white text-rose-900'
                : isSuccess
                  ? 'border-blue-200 bg-white text-slate-800'
                  : 'border-sky-200 bg-white text-slate-800'
            }`}
          >
            {isError ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            ) : isSuccess ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
            )}
            <p className="flex-1 text-sm font-medium leading-snug">{toast.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Isara ang abiso"
              className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
