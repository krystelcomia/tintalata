import { useState, useEffect } from 'react';
import { X, FolderPlus } from 'lucide-react';
import type { Folder, FolderColor, FolderIcon } from '../types';
import { FOLDER_COLOR_STYLES } from '../utils/api';
import { FolderGlyph } from './FolderIconBadge';

interface FolderModalProps {
  isOpen: boolean;
  editingFolder: Folder | null;
  defaultParentId: string | null;
  allFolders: Folder[];
  onClose: () => void;
  onSubmit: (payload: {
    id?: string;
    name: string;
    color: FolderColor;
    icon: FolderIcon;
    parentId: string | null;
  }) => Promise<void>;
}

const ICON_OPTIONS: Array<{ id: FolderIcon; label: string }> = [
  { id: 'folder', label: 'Karaniwan' },
  { id: 'book', label: 'Aklat' },
  { id: 'graduation', label: 'Aralin' },
  { id: 'palette', label: 'Sining' },
  { id: 'flask', label: 'Agham' },
  { id: 'calculator', label: 'Matematika' },
  { id: 'star', label: 'Paborito' },
  { id: 'briefcase', label: 'Proyekto' },
];

export function FolderModal({
  isOpen,
  editingFolder,
  defaultParentId,
  allFolders,
  onClose,
  onSubmit,
}: FolderModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<FolderColor>('blue');
  const [icon, setIcon] = useState<FolderIcon>('folder');
  const [parentId, setParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingFolder) {
      setName(editingFolder.name);
      setColor(editingFolder.color);
      setIcon(editingFolder.icon);
      setParentId(editingFolder.parentId || '');
    } else {
      setName('');
      setColor('blue');
      setIcon('folder');
      setParentId(defaultParentId || '');
    }
  }, [isOpen, editingFolder, defaultParentId]);

  if (!isOpen) return null;

  // Exclude the folder itself and its descendants from valid parent choices
  const excludedIds = new Set<string>();
  if (editingFolder) {
    excludedIds.add(editingFolder.id);
    const queue = [editingFolder.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const f of allFolders) {
        if (f.parentId === cur && !excludedIds.has(f.id)) {
          excludedIds.add(f.id);
          queue.push(f.id);
        }
      }
    }
  }

  const parentChoices = allFolders.filter((f) => !excludedIds.has(f.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Mangyaring maglagay ng pangalan ng folder.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        id: editingFolder?.id,
        name: trimmed,
        color,
        icon,
        parentId: parentId || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi nai-save ang folder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-blue-100 overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="h-5 w-5" />
            <h3 className="text-base font-bold">
              {editingFolder ? 'I-edit ang Folder' : 'Bagong Folder'}
            </h3>
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pangalan ng Folder
            </label>
            <input
              type="text"
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hal. Mga Sanaysay sa Filipino"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Lokasyon (Pangunahing Folder)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Pangunahing Lalagyan (Pinakataas)</option>
              {parentChoices.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Kulay ng Folder
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(FOLDER_COLOR_STYLES) as FolderColor[]).map((cKey) => {
                const c = FOLDER_COLOR_STYLES[cKey];
                const active = color === cKey;
                return (
                  <button
                    key={cKey}
                    type="button"
                    onClick={() => setColor(cKey)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${c.swatch}`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Icon ng Folder
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ICON_OPTIONS.map((opt) => {
                const active = icon === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setIcon(opt.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs font-medium transition ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <FolderGlyph icon={opt.id} className="h-4 w-4" />
                    <span className="text-[11px]">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kanselahin
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving
                ? 'Sine-save...'
                : editingFolder
                  ? 'I-save ang Pagbabago'
                  : 'Gawin ang Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
