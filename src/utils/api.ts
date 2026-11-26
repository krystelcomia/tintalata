import type { FolderColor } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { supportStudentId?: string } = {}
): Promise<T> {
  const { supportStudentId, headers: customHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (supportStudentId) {
    headers['X-Support-Student-Id'] = supportStudentId;
  }

  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    headers,
    ...rest,
  }).catch(() => {
    throw new ApiError(
      0,
      'Hindi makakonekta sa server ng Tintalata. Pakitiyak na tumatakbo ang aplikasyon.'
    );
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 404
        ? 'Hindi maabot ang API server (Code 404). Tiyaking pinapatakbo ang app gamit ang "npm run dev", "npm run preview", o "npm start".'
        : `Nagkaroon ng problema sa koneksyon sa server (Code ${res.status}). Pakisubukang muli.`;
    const errMsg = data?.error || fallback;
    const isPublicAuthCall =
      path.startsWith('/api/auth/login') ||
      path.startsWith('/api/auth/register') ||
      path.startsWith('/api/auth/forgot-password') ||
      path.startsWith('/api/auth/me');
    if (res.status === 401 && !isPublicAuthCall) {
      window.dispatchEvent(new CustomEvent('tintalata:unauthorized', { detail: errMsg }));
    }
    throw new ApiError(res.status, errMsg);
  }
  return data as T;
}

export async function triggerDownload(url: string, fallbackFilename: string, supportStudentId?: string) {
  const headers: Record<string, string> = {};
  if (supportStudentId) {
    headers['X-Support-Student-Id'] = supportStudentId;
  }
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errMsg = data?.error || 'Nabigo ang pag-download ng file.';
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('tintalata:unauthorized', { detail: errMsg }));
    }
    throw new ApiError(res.status, errMsg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  let filename = fallbackFilename;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    filename = decodeURIComponent(utfMatch[1]);
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTimeTL(iso: string | null | undefined): string {
  if (!iso) return 'Hindi pa nakakapag-log in';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fil-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const FOLDER_COLOR_STYLES: Record<
  FolderColor,
  { label: string; bg: string; text: string; border: string; badge: string; swatch: string }
> = {
  blue: {
    label: 'Asul',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
    swatch: 'bg-blue-600',
  },
  indigo: {
    label: 'Indigo',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    badge: 'bg-indigo-100 text-indigo-800',
    swatch: 'bg-indigo-600',
  },
  sky: {
    label: 'Langit',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    badge: 'bg-sky-100 text-sky-800',
    swatch: 'bg-sky-500',
  },
  teal: {
    label: 'Teal',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-800',
    swatch: 'bg-teal-600',
  },
  emerald: {
    label: 'Berde',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
    swatch: 'bg-emerald-600',
  },
  amber: {
    label: 'Ginto',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
    swatch: 'bg-amber-500',
  },
  rose: {
    label: 'Rosas',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-800',
    swatch: 'bg-rose-600',
  },
  slate: {
    label: 'Abo',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    badge: 'bg-slate-200 text-slate-800',
    swatch: 'bg-slate-600',
  },
};
