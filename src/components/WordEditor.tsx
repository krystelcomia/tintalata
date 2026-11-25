import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Link2,
  Table,
  Image as ImageIcon,
  PenTool,
  Printer,
  Download,
  Trash2,
  Save,
  Search,
  ChevronDown,
  Minus,
  SeparatorHorizontal,
  Indent,
  Outdent,
  RemoveFormatting,
  Subscript,
  Superscript,
  Calendar,
  Menu,
  X,
  ZoomIn,
  ZoomOut,
  Check,
  Maximize2,
} from 'lucide-react';
import type { DocumentFull, DoodleItem, Folder, PageSettings } from '../types';
import { formatBytes, triggerDownload } from '../utils/api';
import { DoodleStudioModal } from './DoodleStudioModal';

interface WordEditorProps {
  document: DocumentFull;
  folders: Folder[];
  readOnly?: boolean;
  supportStudentId?: string;
  onOpenSidebar: () => void;
  onSaveDocument: (payload: {
    id: string;
    title: string;
    folderId: string | null;
    contentHtml: string;
    doodles: DoodleItem[];
    pageSettings: PageSettings;
  }) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const FONT_FAMILIES = [
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
];

const FONT_SIZES = [
  { label: '10 pt', value: '2' },
  { label: '12 pt', value: '3' },
  { label: '14 pt', value: '4' },
  { label: '18 pt', value: '5' },
  { label: '24 pt', value: '6' },
  { label: '32 pt', value: '7' },
];

export function WordEditor({
  document: doc,
  folders,
  readOnly = false,
  supportStudentId,
  onOpenSidebar,
  onSaveDocument,
  onDeleteDocument,
  onNotify,
}: WordEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  const [title, setTitle] = useState(doc.title);
  const [folderId, setFolderId] = useState<string | null>(doc.folderId);
  const [doodles, setDoodles] = useState<DoodleItem[]>(doc.doodles || []);
  const [pageSettings, setPageSettings] = useState<PageSettings>(
    doc.pageSettings || { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' }
  );

  const [ribbonTab, setRibbonTab] = useState<'home' | 'insert' | 'layout'>('home');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [wordCount, setWordCount] = useState(doc.wordCount);
  const [charCount, setCharCount] = useState(0);
  const [zoom, setZoom] = useState(100);

  // Menus & Modals
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [tableHover, setTableHover] = useState({ r: 3, c: 3 });
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkText, setLinkText] = useState('');

  // Doodle Studio & Selected Doodle
  const [doodleStudioOpen, setDoodleStudioOpen] = useState(false);
  const [editingDoodle, setEditingDoodle] = useState<DoodleItem | null>(null);
  const [selectedDoodleId, setSelectedDoodleId] = useState<string | null>(null);

  // Sync state when active document changes
  useEffect(() => {
    setTitle(doc.title);
    setFolderId(doc.folderId);
    setDoodles(doc.doodles || []);
    setPageSettings(
      doc.pageSettings || { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' }
    );
    setDirty(false);
    setSelectedDoodleId(null);
    if (editorRef.current) {
      editorRef.current.innerHTML = doc.contentHtml || '<p></p>';
      updateLiveCounts();
    }
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [doc.id]);

  // Ctrl+S save shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!readOnly) void performSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const updateLiveCounts = () => {
    const el = editorRef.current;
    if (!el) return;
    const text = (el.innerText || '').trim();
    setCharCount(text.length);
    setWordCount(text ? text.split(/\s+/).filter(Boolean).length : 0);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;
    editorRef.current.focus();
    if (savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const scheduleAutoSave = (
    nextTitle = title,
    nextFolderId = folderId,
    nextDoodles = doodles,
    nextSettings = pageSettings
  ) => {
    if (readOnly) return;
    setDirty(true);
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void performSave(nextTitle, nextFolderId, nextDoodles, nextSettings, true);
    }, 1500);
  };

  const performSave = async (
    nextTitle = title,
    nextFolderId = folderId,
    nextDoodles = doodles,
    nextSettings = pageSettings,
    silent = false
  ) => {
    if (readOnly || !editorRef.current) return;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setSaving(true);
    try {
      await onSaveDocument({
        id: doc.id,
        title: nextTitle.trim() || 'Walang Pamagat na Dokumento',
        folderId: nextFolderId,
        contentHtml: editorRef.current.innerHTML,
        doodles: nextDoodles,
        pageSettings: nextSettings,
      });
      setDirty(false);
      if (!silent) {
        onNotify('success', 'Nai-save na ang dokumento.');
      }
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Hindi nai-save ang dokumento.'
      );
    } finally {
      setSaving(false);
    }
  };

  const execCmd = (command: string, value?: string) => {
    if (readOnly) return;
    restoreSelection();
    window.document.execCommand(command, false, value);
    saveSelection();
    updateLiveCounts();
    scheduleAutoSave();
  };

  const insertHtmlAtCursor = (html: string) => {
    if (readOnly || !editorRef.current) return;
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      editorRef.current.insertAdjacentHTML('beforeend', html);
    } else {
      window.document.execCommand('insertHTML', false, html);
    }
    saveSelection();
    updateLiveCounts();
    scheduleAutoSave();
  };

  const handleInsertTable = (rows: number, cols: number) => {
    let html = '<table><thead><tr>';
    for (let c = 0; c < cols; c++) {
      html += `<th>Hanay ${c + 1}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let r = 1; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br/></p>';
    insertHtmlAtCursor(html);
    setTableMenuOpen(false);
  };

  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl) return;
    const safeUrl = /^https?:\/\//i.test(cleanUrl) || /^mailto:/i.test(cleanUrl)
      ? cleanUrl
      : `https://${cleanUrl}`;
    const label = (linkText.trim() || safeUrl).replace(/[<>&"]/g, '');
    insertHtmlAtCursor(`<a href="${safeUrl.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    setShowLinkModal(false);
    setLinkUrl('https://');
    setLinkText('');
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('error', 'Mangyaring pumili ng wastong file ng larawan (PNG, JPG, GIF, WEBP).');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      onNotify('error', 'Masyadong malaki ang larawan (limitasyon: 4 MB bawat larawan).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertHtmlAtCursor(
          `<p><img src="${reader.result}" alt="${file.name.replace(/"/g, '')}" style="max-width: 100%; width: 460px; border-radius: 8px;" /></p>`
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDoodleSave = (doodle: DoodleItem) => {
    if (!editorRef.current) return;
    const existingIdx = doodles.findIndex((d) => d.id === doodle.id);
    let nextDoodles: DoodleItem[];
    if (existingIdx >= 0) {
      nextDoodles = doodles.map((d) => (d.id === doodle.id ? doodle : d));
      const imgEl = editorRef.current.querySelector(
        `img[data-doodle-id="${doodle.id}"]`
      ) as HTMLImageElement | null;
      if (imgEl) {
        imgEl.src = doodle.dataUrl;
        imgEl.alt = doodle.title;
      } else {
        insertHtmlAtCursor(
          `<p><img src="${doodle.dataUrl}" data-doodle-id="${doodle.id}" alt="${doodle.title.replace(/"/g, '')}" style="max-width: 100%; width: 520px;" /></p>`
        );
      }
    } else {
      nextDoodles = [...doodles, doodle];
      insertHtmlAtCursor(
        `<p><img src="${doodle.dataUrl}" data-doodle-id="${doodle.id}" alt="${doodle.title.replace(/"/g, '')}" style="max-width: 100%; width: 520px;" /></p><p><br/></p>`
      );
    }
    setDoodles(nextDoodles);
    setDoodleStudioOpen(false);
    setEditingDoodle(null);
    setSelectedDoodleId(doodle.id);
    void performSave(title, folderId, nextDoodles, pageSettings, false);
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    saveSelection();
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const dId = target.getAttribute('data-doodle-id');
      setSelectedDoodleId(dId || null);
    } else {
      setSelectedDoodleId(null);
    }
  };

  const resizeSelectedDoodle = (widthPercent: string) => {
    if (!editorRef.current || !selectedDoodleId) return;
    const imgEl = editorRef.current.querySelector(
      `img[data-doodle-id="${selectedDoodleId}"]`
    ) as HTMLImageElement | null;
    if (imgEl) {
      imgEl.style.width = widthPercent;
      scheduleAutoSave();
    }
  };

  const removeSelectedDoodle = () => {
    if (!editorRef.current || !selectedDoodleId || readOnly) return;
    const imgEl = editorRef.current.querySelector(`img[data-doodle-id="${selectedDoodleId}"]`);
    imgEl?.remove();
    const nextDoodles = doodles.filter((d) => d.id !== selectedDoodleId);
    setDoodles(nextDoodles);
    setSelectedDoodleId(null);
    scheduleAutoSave(title, folderId, nextDoodles, pageSettings);
  };

  const handleReplaceAll = () => {
    if (readOnly || !editorRef.current || !findQuery) return;
    const walker = window.document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let count = 0;
    const nodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) {
      nodes.push(current as Text);
    }
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    for (const textNode of nodes) {
      if (regex.test(textNode.nodeValue || '')) {
        const matches = (textNode.nodeValue || '').match(regex);
        count += matches ? matches.length : 0;
        textNode.nodeValue = (textNode.nodeValue || '').replace(regex, replaceQuery);
      }
    }
    if (count > 0) {
      updateLiveCounts();
      scheduleAutoSave();
      onNotify('success', `Napalitan ang ${count} paglitaw ng "${findQuery}".`);
    } else {
      onNotify('info', `Walang nahanap na "${findQuery}".`);
    }
  };

  const handleDownload = async (format: 'doc' | 'html' | 'txt') => {
    setDownloadMenuOpen(false);
    try {
      if (dirty && !readOnly) {
        await performSave(title, folderId, doodles, pageSettings, true);
      }
      await triggerDownload(
        `/api/documents/${doc.id}/download?format=${format}`,
        `${title || 'dokumento'}.${format}`,
        supportStudentId
      );
      onNotify('success', `Na-download ang dokumento bilang .${format}`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Nabigo ang pag-download.');
    }
  };

  const pageWidthClass =
    pageSettings.orientation === 'landscape' ? 'max-w-[1056px]' : 'max-w-[816px]';
  const pagePaddingClass =
    pageSettings.margins === 'narrow'
      ? 'px-8 py-8 sm:px-10 sm:py-10'
      : pageSettings.margins === 'wide'
        ? 'px-12 py-12 sm:px-24 sm:py-16'
        : 'px-8 py-10 sm:px-16 sm:py-14';

  const selectedDoodleObj = doodles.find((d) => d.id === selectedDoodleId) || null;

  return (
    <div className="flex h-full flex-col bg-[#eef4fc]">
      {/* Top Document Bar */}
      <div className="no-print border-b border-blue-200 bg-white px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buksan ang Sidebar"
            className="lg:hidden rounded-xl border border-blue-100 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 max-w-md">
            <input
              type="text"
              value={title}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                setTitle(next);
                scheduleAutoSave(next, folderId, doodles, pageSettings);
              }}
              placeholder="Pamagat ng Dokumento"
              className="w-full rounded-lg border border-transparent px-2 py-1 text-base font-bold text-slate-900 hover:border-blue-200 focus:border-blue-500 focus:bg-blue-50/30 focus:outline-none truncate disabled:bg-transparent"
            />
          </div>

          {/* Folder Assignment */}
          <select
            value={folderId || ''}
            disabled={readOnly}
            onChange={(e) => {
              const nextFolder = e.target.value || null;
              setFolderId(nextFolder);
              void performSave(title, nextFolder, doodles, pageSettings, false);
            }}
            aria-label="Folder ng Dokumento"
            className="hidden sm:block rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-semibold text-blue-800 focus:border-blue-600 focus:outline-none disabled:opacity-60"
          >
            <option value="">Pangunahing Lalagyan</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                Folder: {f.name}
              </option>
            ))}
          </select>

          <span className="hidden md:inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {formatBytes(doc.sizeBytes)}
          </span>
        </div>

        {/* Save, Download, Delete */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => void performSave()}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                dirty
                  ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                  : 'border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              {saving ? (
                'Sine-save...'
              ) : dirty ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  I-save
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-blue-600" />
                  Nai-save na
                </>
              )}
            </button>
          )}

          {/* Download Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDownloadMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">I-download</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {downloadMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-blue-100 bg-white py-1.5 shadow-xl z-30">
                <button
                  type="button"
                  onClick={() => void handleDownload('doc')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  Microsoft Word (.doc)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload('html')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  Web Page (.html)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload('txt')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  Payak na Teksto (.txt)
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setDownloadMenuOpen(false);
                    window.print();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                >
                  <Printer className="h-3.5 w-3.5" />
                  I-print / I-save bilang PDF
                </button>
              </div>
            )}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => void onDeleteDocument(doc.id)}
              title="Ilipat sa Basurahan"
              className="rounded-xl border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ribbon Tabs & Tools (Word-style) */}
      {!readOnly ? (
        <div className="no-print border-b border-blue-200 bg-white">
          <div className="flex items-center justify-between px-4 border-b border-slate-100 bg-blue-50/50">
            <div className="flex items-center gap-1 pt-1">
              {[
                { id: 'home', label: 'Panimula' },
                { id: 'insert', label: 'Isama at Guhit' },
                { id: 'layout', label: 'Anyo ng Pahina' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRibbonTab(t.id as 'home' | 'insert' | 'layout')}
                  className={`rounded-t-lg px-4 py-1.5 text-xs font-bold transition ${
                    ribbonTab === t.id
                      ? 'bg-white text-blue-700 border-t-2 border-x border-t-blue-600 border-x-blue-100'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => {
                  saveSelection();
                  setEditingDoodle(null);
                  setDoodleStudioOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <PenTool className="h-3.5 w-3.5" />
                Gumuhit ng Doodle
              </button>
              <button
                type="button"
                onClick={() => setShowFindBar((s) => !s)}
                title="Hanapin at Palitan"
                className={`rounded-lg p-1.5 text-xs font-medium ${
                  showFindBar ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-blue-100/60'
                }`}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Active Ribbon Controls */}
          <div className="px-3 sm:px-4 py-2 flex flex-wrap items-center gap-1.5 min-h-[46px]">
            {ribbonTab === 'home' && (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('undo')}
                  title="I-undo"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('redo')}
                  title="I-redo"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <div className="h-5 w-px bg-slate-200 mx-1" />

                {/* Heading Style */}
                <select
                  onChange={(e) => {
                    execCmd('formatBlock', e.target.value);
                  }}
                  defaultValue="P"
                  title="Estilo ng Talata"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="P">Normal na Teksto</option>
                  <option value="H1">Pamagat (Heading 1)</option>
                  <option value="H2">Pang-ulong 2 (Heading 2)</option>
                  <option value="H3">Pang-ulong 3 (Heading 3)</option>
                  <option value="BLOCKQUOTE">Sipian (Quote)</option>
                </select>

                {/* Font Family */}
                <select
                  onChange={(e) => execCmd('fontName', e.target.value)}
                  defaultValue="Calibri, sans-serif"
                  title="Uri ng Font"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {/* Font Size */}
                <select
                  onChange={(e) => execCmd('fontSize', e.target.value)}
                  defaultValue="3"
                  title="Laki ng Font"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <div className="h-5 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('bold')}
                  title="Makapal (Bold)"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('italic')}
                  title="Pahilig (Italic)"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('underline')}
                  title="May Salungguhit (Underline)"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Underline className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('strikeThrough')}
                  title="May Guhit sa Gitna (Strikethrough)"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Strikethrough className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('subscript')}
                  title="Subscript"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Subscript className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('superscript')}
                  title="Superscript"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Superscript className="h-4 w-4" />
                </button>

                {/* Text & Highlight Colors */}
                <label
                  title="Kulay ng Teksto"
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 cursor-pointer"
                >
                  <span>A</span>
                  <input
                    type="color"
                    defaultValue="#1e40af"
                    onChange={(e) => execCmd('foreColor', e.target.value)}
                    className="h-4 w-4 border-0 p-0 bg-transparent cursor-pointer"
                  />
                </label>
                <label
                  title="Kulay ng Highlight"
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 cursor-pointer"
                >
                  <span>HL</span>
                  <input
                    type="color"
                    defaultValue="#fef08a"
                    onChange={(e) => execCmd('hiliteColor', e.target.value)}
                    className="h-4 w-4 border-0 p-0 bg-transparent cursor-pointer"
                  />
                </label>

                <div className="h-5 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('justifyLeft')}
                  title="Ihanay sa Kaliwa"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('justifyCenter')}
                  title="Igitna"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('justifyRight')}
                  title="Ihanay sa Kanan"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <AlignRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('justifyFull')}
                  title="Pantay na Pagkakahanay (Justify)"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <AlignJustify className="h-4 w-4" />
                </button>

                <div className="h-5 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('insertUnorderedList')}
                  title="Listahang may Bullet"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('insertOrderedList')}
                  title="Listahang may Numero"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('indent')}
                  title="Dagdagan ang Indent"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <Indent className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('outdent')}
                  title="Bawasan ang Indent"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <Outdent className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execCmd('removeFormat')}
                  title="Alisin ang Format"
                  className="rounded-lg p-1.5 text-slate-700 hover:bg-blue-50"
                >
                  <RemoveFormatting className="h-4 w-4" />
                </button>
              </>
            )}

            {ribbonTab === 'insert' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    saveSelection();
                    setEditingDoodle(null);
                    setDoodleStudioOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                >
                  <PenTool className="h-4 w-4" />
                  Bagong Guhit / Doodle
                </button>

                <button
                  type="button"
                  onClick={() => {
                    saveSelection();
                    imageInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                  Maglagay ng Larawan
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {/* Interactive Table Grid Picker */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      saveSelection();
                      setTableMenuOpen((o) => !o);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                  >
                    <Table className="h-4 w-4 text-blue-600" />
                    Maglagay ng Talaan
                  </button>
                  {tableMenuOpen && (
                    <div className="absolute left-0 mt-1.5 rounded-2xl border border-blue-200 bg-white p-3 shadow-xl z-30">
                      <p className="text-[11px] font-bold text-blue-900 mb-2">
                        Talaan: {tableHover.r} hanay × {tableHover.c} kolum
                      </p>
                      <div className="grid grid-cols-6 gap-1">
                        {Array.from({ length: 36 }).map((_, idx) => {
                          const r = Math.floor(idx / 6) + 1;
                          const c = (idx % 6) + 1;
                          const highlighted = r <= tableHover.r && c <= tableHover.c;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onMouseEnter={() => setTableHover({ r, c })}
                              onClick={() => handleInsertTable(r, c)}
                              className={`h-5 w-5 rounded border transition ${
                                highlighted
                                  ? 'border-blue-600 bg-blue-500'
                                  : 'border-slate-300 bg-slate-50'
                              }`}
                              aria-label={`${r} x ${c} talaan`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    saveSelection();
                    setShowLinkModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Link2 className="h-4 w-4 text-blue-600" />
                  Maglagay ng Link
                </button>

                <button
                  type="button"
                  onClick={() => insertHtmlAtCursor('<hr /><p><br/></p>')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Minus className="h-4 w-4 text-blue-600" />
                  Pahalang na Linya
                </button>

                <button
                  type="button"
                  onClick={() => insertHtmlAtCursor('<hr class="page-break" /><p><br/></p>')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <SeparatorHorizontal className="h-4 w-4 text-blue-600" />
                  Hati ng Pahina
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const today = new Intl.DateTimeFormat('fil-PH', {
                      dateStyle: 'long',
                    }).format(new Date());
                    insertHtmlAtCursor(`<span>${today}</span>`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Calendar className="h-4 w-4 text-blue-600" />
                  Petsa Ngayon
                </button>
              </>
            )}

            {ribbonTab === 'layout' && (
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Oryentasyon:</span>
                  <select
                    value={pageSettings.orientation}
                    onChange={(e) => {
                      const next = {
                        ...pageSettings,
                        orientation: e.target.value as 'portrait' | 'landscape',
                      };
                      setPageSettings(next);
                      scheduleAutoSave(title, folderId, doodles, next);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700"
                  >
                    <option value="portrait">Patayo (Portrait)</option>
                    <option value="landscape">Pahiga (Landscape)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Palugit (Margins):</span>
                  <select
                    value={pageSettings.margins}
                    onChange={(e) => {
                      const next = {
                        ...pageSettings,
                        margins: e.target.value as 'normal' | 'narrow' | 'wide',
                      };
                      setPageSettings(next);
                      scheduleAutoSave(title, folderId, doodles, next);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700"
                  >
                    <option value="normal">Normal</option>
                    <option value="narrow">Makitid</option>
                    <option value="wide">Malapad</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Kulay ng Pahina:</span>
                  {[
                    { hex: '#ffffff', label: 'Puti' },
                    { hex: '#f8fbff', label: 'Malamig na Asul' },
                    { hex: '#fffdf7', label: 'Mainit na Krema' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        const next = { ...pageSettings, pageColor: c.hex };
                        setPageSettings(next);
                        scheduleAutoSave(title, folderId, doodles, next);
                      }}
                      className={`rounded-lg border px-2.5 py-1 font-semibold ${
                        pageSettings.pageColor === c.hex
                          ? 'border-blue-600 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Find & Replace Sub-bar */}
          {showFindBar && (
            <div className="border-t border-blue-100 bg-blue-50/70 px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Hanapin ang salita..."
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Palitan ng..."
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleReplaceAll}
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
              >
                Palitan Lahat
              </button>
              <button
                type="button"
                onClick={() => setShowFindBar(false)}
                className="ml-auto rounded-lg p-1 text-slate-500 hover:bg-blue-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Selected Doodle Contextual Bar */}
          {selectedDoodleObj && (
            <div className="border-t border-blue-200 bg-blue-600 px-4 py-2 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <PenTool className="h-4 w-4" />
                <span>Napiling Guhit: &ldquo;{selectedDoodleObj.title}&rdquo;</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDoodle(selectedDoodleObj);
                    setDoodleStudioOpen(true);
                  }}
                  className="rounded-lg bg-white px-3 py-1 font-bold text-blue-700 hover:bg-blue-50"
                >
                  I-edit ang Guhit
                </button>
                <button
                  type="button"
                  onClick={() => resizeSelectedDoodle('40%')}
                  className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
                >
                  Maliit
                </button>
                <button
                  type="button"
                  onClick={() => resizeSelectedDoodle('70%')}
                  className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
                >
                  Katamtaman
                </button>
                <button
                  type="button"
                  onClick={() => resizeSelectedDoodle('100%')}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25"
                >
                  <Maximize2 className="h-3 w-3" />
                  Malaki
                </button>
                <button
                  type="button"
                  onClick={removeSelectedDoodle}
                  className="rounded-lg bg-rose-500 px-2.5 py-1 font-semibold text-white hover:bg-rose-600"
                >
                  Alisin
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
          Mode ng Pagbabasa Lamang — May pahintulot ka lamang basahin o i-download ang dokumentong ito.
        </div>
      )}

      {/* Document Page Canvas */}
      <div className="flex-1 overflow-auto px-3 sm:px-8 py-6 sm:py-10">
        <div
          className={`print-page mx-auto ${pageWidthClass} rounded-xl border border-blue-200/80 shadow-xl transition-transform origin-top`}
          style={{
            backgroundColor: pageSettings.pageColor || '#ffffff',
            transform: `scale(${zoom / 100})`,
          }}
        >
          <div className={pagePaddingClass}>
            <div
              ref={editorRef}
              contentEditable={!readOnly}
              suppressContentEditableWarning
              data-placeholder="Magsimulang magsulat dito o gamitin ang 'Gumuhit ng Doodle' upang magdagdag ng guhit..."
              onInput={() => {
                saveSelection();
                updateLiveCounts();
                scheduleAutoSave();
              }}
              onKeyUp={saveSelection}
              onClick={handleEditorClick}
              className="tintalata-prose"
            />
          </div>
        </div>
      </div>

      {/* Bottom Status Bar (Word-style) */}
      <div className="no-print border-t border-blue-200 bg-white px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-600">
        <div className="flex items-center gap-4">
          <span>
            Mga Salita: <strong className="text-slate-900">{wordCount}</strong>
          </span>
          <span>
            Mga Karakter: <strong className="text-slate-900">{charCount}</strong>
          </span>
          <span>
            Mga Guhit (Doodle): <strong className="text-blue-700">{doodles.length}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(70, z - 10))}
            aria-label="Paliitin ang zoom"
            className="rounded p-0.5 hover:bg-blue-50 text-slate-600"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-semibold text-blue-800">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(140, z + 10))}
            aria-label="Palakihin ang zoom"
            className="rounded p-0.5 hover:bg-blue-50 text-slate-600"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Insert Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleInsertLink}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-blue-100 space-y-3"
          >
            <h4 className="text-sm font-bold text-slate-900">Maglagay ng Link</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teksto ng Link
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Hal. Sanggunian"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">URL Address</label>
              <input
                type="text"
                required
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Kanselahin
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Ilagay
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Doodle Studio Modal */}
      <DoodleStudioModal
        isOpen={doodleStudioOpen}
        initialDoodle={editingDoodle}
        onClose={() => {
          setDoodleStudioOpen(false);
          setEditingDoodle(null);
        }}
        onSave={handleDoodleSave}
      />
    </div>
  );
}
