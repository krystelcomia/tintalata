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
  Pencil,
  Highlighter,
  Eraser,
  ArrowUpRight,
  Square,
  Circle,
  Triangle,
  Printer,
  Download,
  Trash2,
  Save,
  Search,
  ChevronDown,
  Minus,
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
  Star,
  Share2,
  Brush,
  Type,
  FilePlus2,
  ArrowLeft,
} from 'lucide-react';
import type {
  DocumentFull,
  DoodleItem,
  DoodleStroke,
  DrawingTool,
  Folder,
  PageDoodleLayer,
  PageSettings,
} from '../types';
import { formatBytes, triggerDownload } from '../utils/api';
import { DRAW_COLOR_SWATCHES, drawStrokeOnContext } from '../utils/drawing';
import { DoodleStudioModal } from './DoodleStudioModal';
import { ShareModal } from './ShareModal';

interface WordEditorProps {
  document: DocumentFull;
  folders: Folder[];
  initialDrawMode?: boolean;
  readOnly?: boolean;
  isOwner?: boolean;
  supportStudentId?: string;
  docStatusText?: string;
  onBackToWorkspace?: () => void;
  onOpenSidebar: () => void;
  onSaveDocument: (payload: {
    id: string;
    title: string;
    folderId: string | null;
    contentHtml: string;
    doodles: DoodleItem[];
    pageDoodle: PageDoodleLayer;
    pageSettings: PageSettings;
    isFavorite: boolean;
  }) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onSharesChanged?: () => void;
  onDirtyChange?: (hasUnsaved: boolean) => void;
  registerSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
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

const LINE_HEIGHTS = [
  { label: '1.0 (Masikip)', value: '1.0' },
  { label: '1.15', value: '1.15' },
  { label: '1.5 (Katamtaman)', value: '1.5' },
  { label: '2.0 (Doble)', value: '2.0' },
  { label: '2.5', value: '2.5' },
];

const OVERLAY_W = 816;
const OVERLAY_H = 980;

export function WordEditor({
  document: doc,
  folders,
  initialDrawMode = false,
  readOnly = false,
  isOwner = true,
  supportStudentId,
  docStatusText,
  onBackToWorkspace,
  onOpenSidebar,
  onSaveDocument,
  onDeleteDocument,
  onNotify,
  onSharesChanged,
  onDirtyChange,
  registerSaveHandler,
}: WordEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pageSheetRef = useRef<HTMLDivElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const selectedImageElRef = useRef<HTMLImageElement | null>(null);
  const latestSaveRef = useRef<() => Promise<boolean>>(async () => true);

  const [title, setTitle] = useState(doc.title);
  const [folderId, setFolderId] = useState<string | null>(doc.folderId);
  const [isFavorite, setIsFavorite] = useState<boolean>(doc.isFavorite);
  const [doodles, setDoodles] = useState<DoodleItem[]>(doc.doodles || []);
  const [pageSettings, setPageSettings] = useState<PageSettings>(
    doc.pageSettings || {
      orientation: 'portrait',
      margins: 'normal',
      pageColor: '#ffffff',
      lineHeight: '1.6',
    }
  );

  // Direct on-document freehand drawing overlay state
  const [drawMode, setDrawMode] = useState(initialDrawMode && !readOnly);
  const [drawTool, setDrawTool] = useState<DrawingTool>('pen');
  const [drawColor, setDrawColor] = useState('#1d4ed8');
  const [drawSize, setDrawSize] = useState(4);
  const [overlayStrokes, setOverlayStrokes] = useState<DoodleStroke[]>(
    doc.pageDoodle?.strokes || []
  );
  const [overlayRedo, setOverlayRedo] = useState<DoodleStroke[]>([]);
  const activeOverlayStrokeRef = useRef<DoodleStroke | null>(null);
  const isDrawingOverlayRef = useRef(false);

  const [ribbonTab, setRibbonTab] = useState<'home' | 'insert' | 'draw' | 'layout'>(
    initialDrawMode && !readOnly ? 'draw' : 'home'
  );
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
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Standalone Doodle Studio & Selected Inline Image/Doodle
  const [doodleStudioOpen, setDoodleStudioOpen] = useState(false);
  const [editingDoodle, setEditingDoodle] = useState<DoodleItem | null>(null);
  const [selectedImageInfo, setSelectedImageInfo] = useState<{
    doodleId: string | null;
    alt: string;
    widthPercent: number;
    align: 'left' | 'center' | 'right';
    rect: { left: number; top: number; width: number; height: number } | null;
  } | null>(null);
  const [requestedMinPages, setRequestedMinPages] = useState(1);
  const [pageMetrics, setPageMetrics] = useState({
    pageCount: 1,
    firstPageFillPct: 0,
    explicitBreaks: 0,
  });

  const singlePageHeight = pageSettings.orientation === 'landscape' ? 740 : 980;

  const renderOverlayCanvas = (
    strokes: DoodleStroke[],
    preview: DoodleStroke | null = null
  ): string => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return '';
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H);
    for (const s of strokes) {
      drawStrokeOnContext(ctx, s);
    }
    if (preview) {
      drawStrokeOnContext(ctx, preview);
    }
    return strokes.length > 0 ? canvas.toDataURL('image/png') : '';
  };

  useEffect(() => {
    setTitle(doc.title);
    setFolderId(doc.folderId);
    setIsFavorite(doc.isFavorite);
    setDoodles(doc.doodles || []);
    setOverlayStrokes(doc.pageDoodle?.strokes || []);
    setOverlayRedo([]);
    setPageSettings({
      orientation: doc.pageSettings?.orientation || 'portrait',
      margins: doc.pageSettings?.margins || 'normal',
      pageColor: doc.pageSettings?.pageColor || '#ffffff',
      lineHeight: doc.pageSettings?.lineHeight || '1.6',
    });
    setDrawMode(initialDrawMode && !readOnly);
    setRibbonTab(initialDrawMode && !readOnly ? 'draw' : 'home');
    setDirty(false);
    selectedImageElRef.current = null;
    setSelectedImageInfo(null);
    setRequestedMinPages(1);
    if (editorRef.current) {
      editorRef.current.innerHTML = doc.contentHtml || '<p></p>';
      updateLiveCounts();
      window.requestAnimationFrame(() => updatePageMetrics());
    }
  }, [doc.id]);

  const hasUnsavedChanges = !readOnly && (dirty || Boolean(doc.isNewDraft));

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    renderOverlayCanvas(overlayStrokes, null);
  }, [overlayStrokes, doc.id]);

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

  const computeImageRect = (imgEl: HTMLImageElement) => {
    const sheet = pageSheetRef.current;
    if (!sheet) return null;
    const imgRect = imgEl.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const scale = Math.max(0.5, zoom / 100);
    return {
      left: (imgRect.left - sheetRect.left) / scale,
      top: (imgRect.top - sheetRect.top) / scale,
      width: imgRect.width / scale,
      height: imgRect.height / scale,
    };
  };

  const selectImageElement = (imgEl: HTMLImageElement | null) => {
    if (!imgEl || !editorRef.current || !editorRef.current.contains(imgEl)) {
      selectedImageElRef.current = null;
      setSelectedImageInfo(null);
      return;
    }
    selectedImageElRef.current = imgEl;
    const dId = imgEl.getAttribute('data-doodle-id');
    const styleWidth = imgEl.style.width || '';
    const editorWidth = Math.max(200, editorRef.current.clientWidth || 688);
    let pct = 55;
    if (styleWidth.endsWith('%')) {
      pct = Number(styleWidth.slice(0, -1)) || 55;
    } else if (styleWidth.endsWith('px')) {
      pct = (Number(styleWidth.slice(0, -2)) / editorWidth) * 100;
    } else if (imgEl.clientWidth > 0) {
      pct = (imgEl.clientWidth / editorWidth) * 100;
    }
    const clampedPct = Math.max(15, Math.min(100, Math.round(pct)));

    let align: 'left' | 'center' | 'right' = 'left';
    if (imgEl.style.marginLeft === 'auto' && imgEl.style.marginRight === 'auto') {
      align = 'center';
    } else if (imgEl.style.marginLeft === 'auto') {
      align = 'right';
    }

    setSelectedImageInfo({
      doodleId: dId || null,
      alt: imgEl.alt || 'Larawan',
      widthPercent: clampedPct,
      align,
      rect: computeImageRect(imgEl),
    });
  };

  const updatePageMetrics = (minPagesOverride?: number) => {
    const el = editorRef.current;
    if (!el) return;
    const explicitBreaks = el.querySelectorAll('hr.page-break').length;
    const usablePageHeight = Math.max(520, singlePageHeight - 130);
    let firstPageContentH = el.scrollHeight;
    const firstBreak = el.querySelector('hr.page-break') as HTMLElement | null;
    if (firstBreak) {
      firstPageContentH = Math.max(firstBreak.offsetTop, usablePageHeight);
    }
    const fillPct = Math.min(100, Math.round((firstPageContentH / usablePageHeight) * 100));
    const minPages = minPagesOverride ?? requestedMinPages;
    const overflowPages = Math.max(1, Math.ceil(el.scrollHeight / usablePageHeight));
    const pageCount = Math.max(1, explicitBreaks + 1, minPages, overflowPages);
    setPageMetrics({ pageCount, firstPageFillPct: fillPct, explicitBreaks });

    if (selectedImageElRef.current && el.contains(selectedImageElRef.current)) {
      selectImageElement(selectedImageElRef.current);
    }
  };

  useEffect(() => {
    updatePageMetrics();
  }, [
    pageSettings.orientation,
    pageSettings.margins,
    pageSettings.lineHeight,
    zoom,
    requestedMinPages,
  ]);

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

  const buildCurrentPageDoodle = (strokes = overlayStrokes): PageDoodleLayer => {
    const dataUrl = renderOverlayCanvas(strokes, null);
    return { strokes, dataUrl };
  };

  const markUnsaved = () => {
    if (readOnly) return;
    setDirty(true);
  };

  const performSave = async (
    nextTitle = title,
    nextFolderId = folderId,
    nextDoodles = doodles,
    nextOverlay = overlayStrokes,
    nextSettings = pageSettings,
    nextFav = isFavorite,
    silent = false
  ): Promise<boolean> => {
    if (readOnly || !editorRef.current) return true;
    setSaving(true);
    try {
      const pageDoodle = buildCurrentPageDoodle(nextOverlay);
      await onSaveDocument({
        id: doc.id,
        title: nextTitle.trim() || 'Walang Pamagat na Dokumento',
        folderId: nextFolderId,
        contentHtml: editorRef.current.innerHTML,
        doodles: nextDoodles,
        pageDoodle,
        pageSettings: nextSettings,
        isFavorite: nextFav,
      });
      setDirty(false);
      if (!silent) {
        onNotify('success', 'Nai-save na ang dokumento.');
      }
      return true;
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Hindi nai-save ang dokumento.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  latestSaveRef.current = () => performSave();

  useEffect(() => {
    registerSaveHandler?.(() => latestSaveRef.current());
    return () => registerSaveHandler?.(null);
  }, [registerSaveHandler]);

  const execCmd = (command: string, value?: string) => {
    if (readOnly) return;
    restoreSelection();
    window.document.execCommand(command, false, value);
    saveSelection();
    updateLiveCounts();
    markUnsaved();
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
    markUnsaved();
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
    const safeUrl =
      /^https?:\/\//i.test(cleanUrl) || /^mailto:/i.test(cleanUrl)
        ? cleanUrl
        : `https://${cleanUrl}`;
    const label = (linkText.trim() || safeUrl).replace(/[<>&"]/g, '');
    insertHtmlAtCursor(
      `<a href="${safeUrl.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
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
        const uid = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        insertHtmlAtCursor(
          `<p><img src="${reader.result}" data-img-uid="${uid}" alt="${file.name.replace(/"/g, '')}" style="display: block; margin-left: auto; margin-right: auto; max-width: 100%; width: 55%; height: auto; border-radius: 8px;" /></p><p><br/></p>`
        );
        window.requestAnimationFrame(() => {
          const inserted = editorRef.current?.querySelector(
            `img[data-img-uid="${uid}"]`
          ) as HTMLImageElement | null;
          if (inserted) {
            inserted.removeAttribute('data-img-uid');
            selectImageElement(inserted);
          }
          updatePageMetrics();
        });
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
          `<p><img src="${doodle.dataUrl}" data-doodle-id="${doodle.id}" alt="${doodle.title.replace(/"/g, '')}" style="display: block; margin-left: auto; margin-right: auto; max-width: 100%; width: 70%; height: auto;" /></p>`
        );
      }
    } else {
      nextDoodles = [...doodles, doodle];
      insertHtmlAtCursor(
        `<p><img src="${doodle.dataUrl}" data-doodle-id="${doodle.id}" alt="${doodle.title.replace(/"/g, '')}" style="display: block; margin-left: auto; margin-right: auto; max-width: 100%; width: 70%; height: auto;" /></p><p><br/></p>`
      );
    }
    setDoodles(nextDoodles);
    setDoodleStudioOpen(false);
    setEditingDoodle(null);
    window.requestAnimationFrame(() => {
      const targetImg = editorRef.current?.querySelector(
        `img[data-doodle-id="${doodle.id}"]`
      ) as HTMLImageElement | null;
      if (targetImg) selectImageElement(targetImg);
      updatePageMetrics();
    });
    markUnsaved();
  };

  const handleAddBlankPage = (fromEnd = false) => {
    if (readOnly || !editorRef.current) return;
    const el = editorRef.current;
    const markerId = `pb-${Date.now()}`;
    const breakHtml = `<hr class="page-break" data-page-break="true" /><p data-new-page="${markerId}"><br/></p>`;

    if (fromEnd) {
      el.focus();
      el.insertAdjacentHTML('beforeend', breakHtml);
    } else {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        el.insertAdjacentHTML('beforeend', breakHtml);
      } else {
        window.document.execCommand('insertHTML', false, breakHtml);
      }
    }

    const nextExplicitCount = el.querySelectorAll('hr.page-break').length;
    const nextMinPages = Math.max(requestedMinPages + (fromEnd ? 0 : 0), nextExplicitCount + 1);
    setRequestedMinPages(nextMinPages);

    window.requestAnimationFrame(() => {
      const targetPara = el.querySelector(`p[data-new-page="${markerId}"]`) as HTMLElement | null;
      if (targetPara) {
        targetPara.removeAttribute('data-new-page');
        const range = window.document.createRange();
        range.setStart(targetPara, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        savedRangeRef.current = range.cloneRange();
        targetPara.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      updateLiveCounts();
      updatePageMetrics(nextMinPages);
    });

    markUnsaved();
    onNotify('success', 'Nagdagdag ng bagong blangkong pahina.');
  };

  // Direct On-Document Drawing Pointer Handlers
  const getOverlayPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (OVERLAY_W / rect.width),
      y: (e.clientY - rect.top) * (OVERLAY_H / rect.height),
    };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode || readOnly) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const pt = getOverlayPoint(e);
    isDrawingOverlayRef.current = true;
    const effectiveWidth =
      drawTool === 'highlighter'
        ? Math.max(16, drawSize * 2.5)
        : drawTool === 'eraser'
          ? drawSize * 2.4
          : drawSize;

    const stroke: DoodleStroke = {
      tool: drawTool,
      color: drawColor,
      width: effectiveWidth,
      opacity: 1,
      points: [pt],
    };
    activeOverlayStrokeRef.current = stroke;
    renderOverlayCanvas(overlayStrokes, stroke);
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingOverlayRef.current || !activeOverlayStrokeRef.current) return;
    const pt = getOverlayPoint(e);
    const cur = activeOverlayStrokeRef.current;
    if (
      cur.tool === 'line' ||
      cur.tool === 'arrow' ||
      cur.tool === 'rect' ||
      cur.tool === 'circle' ||
      cur.tool === 'triangle'
    ) {
      cur.points = [cur.points[0], pt];
    } else {
      cur.points.push(pt);
    }
    renderOverlayCanvas(overlayStrokes, cur);
  };

  const finishOverlayStroke = () => {
    if (!isDrawingOverlayRef.current || !activeOverlayStrokeRef.current) return;
    isDrawingOverlayRef.current = false;
    const finished = activeOverlayStrokeRef.current;
    activeOverlayStrokeRef.current = null;
    const next = [...overlayStrokes, finished];
    setOverlayStrokes(next);
    setOverlayRedo([]);
    markUnsaved();
  };

  const handleOverlayUndo = () => {
    if (overlayStrokes.length === 0) return;
    const last = overlayStrokes[overlayStrokes.length - 1];
    const next = overlayStrokes.slice(0, -1);
    setOverlayStrokes(next);
    setOverlayRedo((r) => [...r, last]);
    markUnsaved();
  };

  const handleOverlayRedo = () => {
    if (overlayRedo.length === 0) return;
    const nextStroke = overlayRedo[overlayRedo.length - 1];
    const next = [...overlayStrokes, nextStroke];
    setOverlayRedo((r) => r.slice(0, -1));
    setOverlayStrokes(next);
    markUnsaved();
  };

  const handleOverlayClear = () => {
    if (overlayStrokes.length === 0) return;
    setOverlayStrokes([]);
    setOverlayRedo([]);
    markUnsaved();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    saveSelection();
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      selectImageElement(target as HTMLImageElement);
    } else {
      selectImageElement(null);
    }
  };

  const resizeSelectedImage = (widthPercent: number) => {
    const imgEl = selectedImageElRef.current;
    if (!imgEl || !editorRef.current?.contains(imgEl) || readOnly) return;
    const clamped = Math.max(15, Math.min(100, Math.round(widthPercent)));
    imgEl.style.width = `${clamped}%`;
    imgEl.style.maxWidth = '100%';
    imgEl.style.height = 'auto';
    selectImageElement(imgEl);
    window.requestAnimationFrame(() => updatePageMetrics());
    markUnsaved();
  };

  const alignSelectedImage = (align: 'left' | 'center' | 'right') => {
    const imgEl = selectedImageElRef.current;
    if (!imgEl || !editorRef.current?.contains(imgEl) || readOnly) return;
    imgEl.style.display = 'block';
    if (align === 'center') {
      imgEl.style.marginLeft = 'auto';
      imgEl.style.marginRight = 'auto';
    } else if (align === 'right') {
      imgEl.style.marginLeft = 'auto';
      imgEl.style.marginRight = '0';
    } else {
      imgEl.style.marginLeft = '0';
      imgEl.style.marginRight = 'auto';
    }
    selectImageElement(imgEl);
    markUnsaved();
  };

  const removeSelectedImage = () => {
    const imgEl = selectedImageElRef.current;
    if (!imgEl || readOnly) return;
    const dId = imgEl.getAttribute('data-doodle-id');
    imgEl.remove();
    if (dId) {
      setDoodles((prev) => prev.filter((d) => d.id !== dId));
    }
    selectImageElement(null);
    updateLiveCounts();
    window.requestAnimationFrame(() => updatePageMetrics());
    markUnsaved();
  };

  const handleStartImageDragResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    const imgEl = selectedImageElRef.current;
    const editorEl = editorRef.current;
    if (!imgEl || !editorEl || readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const scale = Math.max(0.5, zoom / 100);
    const startImgWidthPx = imgEl.getBoundingClientRect().width / scale;
    const editorWidthPx = Math.max(200, editorEl.clientWidth || 688);

    const onMove = (ev: PointerEvent) => {
      const deltaX = (ev.clientX - startX) / scale;
      const nextWidthPx = Math.max(60, Math.min(editorWidthPx, startImgWidthPx + deltaX));
      const pct = Math.max(15, Math.min(100, Math.round((nextWidthPx / editorWidthPx) * 100)));
      imgEl.style.width = `${pct}%`;
      imgEl.style.maxWidth = '100%';
      imgEl.style.height = 'auto';
      selectImageElement(imgEl);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.requestAnimationFrame(() => updatePageMetrics());
      markUnsaved();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      markUnsaved();
      onNotify('success', `Napalitan ang ${count} paglitaw ng "${findQuery}".`);
    } else {
      onNotify('info', `Walang nahanap na "${findQuery}".`);
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf' | 'doc' | 'html' | 'txt') => {
    setDownloadMenuOpen(false);
    if (doc.isNewDraft) {
      onNotify('info', 'Pindutin muna ang "I-save" upang maitala ang bagong dokumento bago mag-download.');
      return;
    }
    try {
      if (dirty && !readOnly) {
        onNotify(
          'info',
          'Paalala: Hindi awtomatikong nai-save ang mga pagbabago; ang huling nai-save na bersyon ang ida-download.'
        );
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

  const selectedDoodleObj =
    selectedImageInfo?.doodleId
      ? doodles.find((d) => d.id === selectedImageInfo.doodleId) || null
      : null;

  const overlayTools: Array<{ id: DrawingTool; label: string; icon: JSX.Element }> = [
    { id: 'pen', label: 'Panulat', icon: <PenTool className="h-4 w-4" /> },
    { id: 'pencil', label: 'Lapis', icon: <Pencil className="h-4 w-4" /> },
    { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="h-4 w-4" /> },
    { id: 'eraser', label: 'Pambura', icon: <Eraser className="h-4 w-4" /> },
    { id: 'line', label: 'Linya', icon: <Minus className="h-4 w-4" /> },
    { id: 'arrow', label: 'Palaso', icon: <ArrowUpRight className="h-4 w-4" /> },
    { id: 'rect', label: 'Parihaba', icon: <Square className="h-4 w-4" /> },
    { id: 'circle', label: 'Bilog', icon: <Circle className="h-4 w-4" /> },
    { id: 'triangle', label: 'Tatsulok', icon: <Triangle className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full flex-col bg-[#eef4fc] dark:bg-slate-950">
      {/* Top Document Bar (aligned 76px with sidebar header) */}
      <header className="no-print tintalata-header-bar px-3 sm:px-5 py-2 min-h-[76px] lg:h-[76px] flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buksan ang Sidebar"
            className="lg:hidden rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100"
          >
            <Menu className="h-5 w-5" />
          </button>

          {onBackToWorkspace && (
            <button
              type="button"
              onClick={onBackToWorkspace}
              title="Bumalik sa Workspace"
              className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 hover:text-blue-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Workspace</span>
            </button>
          )}

          <div className="min-w-0 flex-1 max-w-sm">
            <input
              type="text"
              value={title}
              disabled={readOnly}
              onChange={(e) => {
                const next = e.target.value;
                setTitle(next);
                markUnsaved();
              }}
              placeholder="Pamagat ng Dokumento"
              className="tintalata-inline-title w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 hover:border-blue-200 dark:hover:border-blue-700 focus:border-blue-500 focus:bg-blue-50/30 dark:focus:bg-slate-800/80 focus:outline-none truncate disabled:bg-transparent leading-tight"
            />
            {docStatusText && (
              <p className="px-2 text-[11px] text-slate-500 truncate leading-tight">
                {docStatusText}
              </p>
            )}
          </div>

          {isOwner && !readOnly && (
            <button
              type="button"
              onClick={() => {
                setIsFavorite((fav) => !fav);
                markUnsaved();
              }}
              title={isFavorite ? 'Alisin sa Mga Paborito' : 'Idagdag sa Mga Paborito'}
              className={`shrink-0 rounded-xl p-2 border transition ${
                isFavorite
                  ? 'border-amber-200 bg-amber-50 text-amber-500'
                  : 'border-slate-200 bg-white text-slate-400 hover:text-amber-500'
              }`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
          )}

          {isOwner && (
            <select
              value={folderId || ''}
              disabled={readOnly}
              onChange={(e) => {
                const nextFolder = e.target.value || null;
                setFolderId(nextFolder);
                markUnsaved();
              }}
              aria-label="Folder ng Dokumento"
              className="hidden xl:block max-w-[130px] shrink-0 rounded-xl border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-xs font-semibold text-blue-800 focus:border-blue-600 focus:outline-none disabled:opacity-60"
            >
              <option value="">Pangunahing Lalagyan</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  Folder: {f.name}
                </option>
              ))}
            </select>
          )}

          <span className="hidden xl:inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {formatBytes(doc.sizeBytes)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                const nextDraw = !drawMode;
                setDrawMode(nextDraw);
                if (nextDraw) setRibbonTab('draw');
                else if (ribbonTab === 'draw') setRibbonTab('home');
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                drawMode
                  ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                  : 'border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              {drawMode ? (
                <>
                  <Type className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Bumalik sa Pagsulat</span>
                  <span className="xl:hidden">Pagsulat</span>
                </>
              ) : (
                <>
                  <Brush className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Gumuhit sa Pahina</span>
                  <span className="xl:hidden">Guhit</span>
                </>
              )}
            </button>
          )}

          {isOwner && !readOnly && !supportStudentId && (
            <button
              type="button"
              onClick={() => {
                if (doc.isNewDraft) {
                  onNotify('info', 'Pindutin muna ang "I-save" bago ibahagi ang bagong dokumento.');
                  return;
                }
                setShareModalOpen(true);
              }}
              title="Ibahagi sa kaklase"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Ibahagi</span>
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={() => void performSave()}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                hasUnsavedChanges
                  ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                  : 'border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              {saving ? (
                'Sine-save...'
              ) : hasUnsavedChanges ? (
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

          {/* Download Dropdown with Real DOCX & PDF */}
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
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-blue-100 bg-white py-1.5 shadow-xl z-30">
                <button
                  type="button"
                  onClick={() => void handleDownload('docx')}
                  className="w-full px-4 py-2 text-left text-xs font-bold text-blue-800 hover:bg-blue-50"
                >
                  Microsoft Word (.docx)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload('pdf')}
                  className="w-full px-4 py-2 text-left text-xs font-bold text-blue-800 hover:bg-blue-50"
                >
                  PDF Dokumento (.pdf)
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => void handleDownload('doc')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  Word Classic (.doc)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload('html')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  Web Page (.html)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload('txt')}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50"
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
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 flex items-center gap-2"
                >
                  <Printer className="h-3.5 w-3.5" />
                  I-print ang Dokumento
                </button>
              </div>
            )}
          </div>

          {isOwner && !readOnly && (
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
      </header>

      {/* Ribbon Tabs & Tools */}
      {!readOnly ? (
        <div className="no-print border-b border-blue-200 bg-white">
          <div className="flex items-center justify-between px-4 border-b border-slate-100 bg-blue-50/50">
            <div className="flex items-center gap-1 pt-1 overflow-x-auto">
              {[
                { id: 'home', label: 'Panimula' },
                { id: 'insert', label: 'Isama' },
                { id: 'draw', label: 'Pagguhit at Doodle' },
                { id: 'layout', label: 'Anyo ng Pahina' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    const tabId = t.id as 'home' | 'insert' | 'draw' | 'layout';
                    setRibbonTab(tabId);
                    setDrawMode(tabId === 'draw');
                  }}
                  className={`rounded-t-lg px-4 py-1.5 text-xs font-bold whitespace-nowrap transition ${
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
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <PenTool className="h-3.5 w-3.5" />
                Maglagay ng Doodle Box
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

                <select
                  onChange={(e) => execCmd('formatBlock', e.target.value)}
                  defaultValue="P"
                  title="Estilo ng Talata"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  <option value="P">Normal na Teksto</option>
                  <option value="H1">Pamagat (Heading 1)</option>
                  <option value="H2">Pang-ulong 2 (Heading 2)</option>
                  <option value="H3">Pang-ulong 3 (Heading 3)</option>
                  <option value="BLOCKQUOTE">Sipian (Quote)</option>
                </select>

                <select
                  onChange={(e) => execCmd('fontName', e.target.value)}
                  defaultValue="Calibri, sans-serif"
                  title="Uri ng Font"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => execCmd('fontSize', e.target.value)}
                  defaultValue="3"
                  title="Laki ng Font"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <select
                  value={pageSettings.lineHeight || '1.6'}
                  onChange={(e) => {
                    const next = { ...pageSettings, lineHeight: e.target.value };
                    setPageSettings(next);
                    markUnsaved();
                  }}
                  title="Espasyo ng Linya (Line Spacing)"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {LINE_HEIGHTS.map((lh) => (
                    <option key={lh.value} value={lh.value}>
                      Espasyo: {lh.label}
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
                  title="May Guhit sa Gitna"
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
                  title="Pantay (Justify)"
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
                  Maglagay ng Doodle Box
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
                  onClick={() => handleAddBlankPage(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors duration-200 cursor-pointer"
                >
                  <FilePlus2 className="h-4 w-4 text-blue-600" />
                  Bagong Blangkong Pahina
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

            {ribbonTab === 'draw' && (
              <div className="flex flex-wrap items-center gap-2 w-full">
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-blue-50/70 p-1 border border-blue-100">
                  {overlayTools.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setDrawMode(true);
                        setDrawTool(t.id);
                      }}
                      title={t.label}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                        drawTool === t.id && drawMode
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {t.icon}
                      <span className="hidden xl:inline">{t.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                  {DRAW_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => {
                        setDrawColor(swatch);
                        if (drawTool === 'eraser') setDrawTool('pen');
                      }}
                      aria-label={`Kulay ${swatch}`}
                      className={`h-4 w-4 rounded-full border ${
                        drawColor === swatch && drawTool !== 'eraser'
                          ? 'ring-2 ring-blue-600 ring-offset-1 scale-110'
                          : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                  <input
                    type="color"
                    value={drawColor}
                    onChange={(e) => {
                      setDrawColor(e.target.value);
                      if (drawTool === 'eraser') setDrawTool('pen');
                    }}
                    title="Pumili ng Kulay"
                    className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                  <span>Kapal: {drawSize}px</span>
                  <input
                    type="range"
                    min={1}
                    max={28}
                    value={drawSize}
                    onChange={(e) => setDrawSize(Number(e.target.value))}
                    className="w-16 accent-blue-600"
                  />
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={handleOverlayUndo}
                    disabled={overlayStrokes.length === 0}
                    title="I-undo ang Guhit"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOverlayRedo}
                    disabled={overlayRedo.length === 0}
                    title="I-redo ang Guhit"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOverlayClear}
                    disabled={overlayStrokes.length === 0}
                    title="Burahin ang Lahat ng Guhit sa Pahina"
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Burahin ang Guhit
                  </button>
                </div>
              </div>
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
                      markUnsaved();
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
                      markUnsaved();
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
                        markUnsaved();
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

                <button
                  type="button"
                  onClick={() => handleAddBlankPage(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 font-bold text-blue-800 hover:bg-blue-600 hover:text-white transition-all duration-200 cursor-pointer"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Magdagdag ng Blangkong Pahina
                </button>
              </div>
            )}
          </div>

          {drawMode && (
            <div className="border-t border-indigo-200 bg-indigo-50 px-4 py-1.5 flex items-center justify-between text-xs text-indigo-900">
              <span className="font-semibold">
                Mode ng Direktang Pagguhit: Maaari kang gumuhit direkta sa ibabaw ng dokumento gamit
                ang mouse, touch, o stylus.
              </span>
              <button
                type="button"
                onClick={() => {
                  setDrawMode(false);
                  setRibbonTab('home');
                }}
                className="font-bold text-indigo-700 hover:underline shrink-0 ml-3"
              >
                Tapos na Gumuhit
              </button>
            </div>
          )}

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

          {selectedImageInfo && (
            <div className="border-t border-blue-300 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 px-4 py-2 text-white flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-2 font-semibold min-w-0">
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span className="truncate max-w-[180px]">
                  {selectedDoodleObj
                    ? `Guhit: "${selectedDoodleObj.title}"`
                    : `Napiling Larawan: ${selectedImageInfo.alt}`}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold">
                  {selectedImageInfo.widthPercent}%
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedDoodleObj && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDoodle(selectedDoodleObj);
                      setDoodleStudioOpen(true);
                    }}
                    className="rounded-lg bg-white px-3 py-1 font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                  >
                    I-edit ang Guhit
                  </button>
                )}

                <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1">
                  <span className="text-[11px] font-bold">Laki:</span>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={selectedImageInfo.widthPercent}
                    onChange={(e) => resizeSelectedImage(Number(e.target.value))}
                    aria-label="Laki ng Larawan"
                    className="w-24 accent-white cursor-pointer"
                  />
                </div>

                {[
                  { pct: 25, label: '25%' },
                  { pct: 50, label: '50%' },
                  { pct: 75, label: '75%' },
                  { pct: 100, label: '100%' },
                ].map((preset) => (
                  <button
                    key={preset.pct}
                    type="button"
                    onClick={() => resizeSelectedImage(preset.pct)}
                    className={`rounded-lg px-2 py-1 font-bold transition cursor-pointer ${
                      Math.abs(selectedImageInfo.widthPercent - preset.pct) <= 3
                        ? 'bg-white text-blue-700'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}

                <div className="flex items-center gap-1 bg-white/15 rounded-lg p-0.5">
                  <button
                    type="button"
                    title="Ihanay sa Kaliwa"
                    onClick={() => alignSelectedImage('left')}
                    className={`rounded p-1 cursor-pointer ${
                      selectedImageInfo.align === 'left' ? 'bg-white text-blue-700' : 'hover:bg-white/20'
                    }`}
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Igitna"
                    onClick={() => alignSelectedImage('center')}
                    className={`rounded p-1 cursor-pointer ${
                      selectedImageInfo.align === 'center' ? 'bg-white text-blue-700' : 'hover:bg-white/20'
                    }`}
                  >
                    <AlignCenter className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Ihanay sa Kanan"
                    onClick={() => alignSelectedImage('right')}
                    className={`rounded p-1 cursor-pointer ${
                      selectedImageInfo.align === 'right' ? 'bg-white text-blue-700' : 'hover:bg-white/20'
                    }`}
                  >
                    <AlignRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={removeSelectedImage}
                  className="rounded-lg bg-rose-500 px-2.5 py-1 font-semibold text-white hover:bg-rose-600 cursor-pointer"
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

      {/* Document Page Canvas with Direct Freehand Drawing Overlay */}
      <div className="flex-1 overflow-auto px-3 sm:px-8 py-6 sm:py-10 space-y-5">
        <div
          ref={pageSheetRef}
          className={`print-page relative mx-auto ${pageWidthClass} rounded-xl border border-blue-200/80 shadow-xl transition-transform origin-top overflow-hidden`}
          style={{
            backgroundColor: pageSettings.pageColor || '#ffffff',
            minHeight: `${pageMetrics.pageCount * singlePageHeight}px`,
            transform: `scale(${zoom / 100})`,
          }}
        >
          <div className={pagePaddingClass}>
            <div
              ref={editorRef}
              contentEditable={!readOnly && !drawMode}
              suppressContentEditableWarning
              data-placeholder="Magsimulang magsulat dito o pindutin ang 'Gumuhit sa Pahina' upang gumuhit direkta sa dokumento..."
              onInput={() => {
                saveSelection();
                updateLiveCounts();
                updatePageMetrics();
                markUnsaved();
              }}
              onKeyUp={() => {
                saveSelection();
                updatePageMetrics();
              }}
              onClick={handleEditorClick}
              className="tintalata-prose"
              style={{ lineHeight: pageSettings.lineHeight || '1.6' }}
            />
          </div>

          {/* Visual Page Boundary Guides across Multi-Page Sheets */}
          {pageMetrics.pageCount > 1 &&
            Array.from({ length: pageMetrics.pageCount - 1 }).map((_, idx) => (
              <div
                key={idx}
                aria-hidden="true"
                className="no-print pointer-events-none absolute left-0 right-0 border-t border-dashed border-blue-200 flex justify-end pr-4"
                style={{ top: `${(idx + 1) * singlePageHeight}px` }}
              >
                <span className="-mt-3 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                  Pahina {idx + 2}
                </span>
              </div>
            ))}

          {/* Interactive Corner Drag Handle Overlay for Selected Image */}
          {!readOnly && !drawMode && selectedImageInfo?.rect && (
            <div
              aria-hidden="true"
              className="no-print pointer-events-none absolute z-30 rounded-lg border-2 border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.18)]"
              style={{
                left: `${selectedImageInfo.rect.left}px`,
                top: `${selectedImageInfo.rect.top}px`,
                width: `${selectedImageInfo.rect.width}px`,
                height: `${selectedImageInfo.rect.height}px`,
              }}
            >
              <button
                type="button"
                onPointerDown={handleStartImageDragResize}
                title="Hilahin upang baguhin ang laki ng larawan"
                className="pointer-events-auto absolute -right-2 -bottom-2 h-4 w-4 rounded-sm border-2 border-white bg-blue-600 shadow cursor-nwse-resize hover:scale-110 transition-transform"
              />
            </div>
          )}

          {/* Transparent On-Page Freehand Drawing Layer */}
          <canvas
            ref={overlayCanvasRef}
            width={OVERLAY_W}
            height={OVERLAY_H}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={finishOverlayStroke}
            onPointerCancel={finishOverlayStroke}
            style={{ height: `${singlePageHeight}px` }}
            className={`absolute top-0 left-0 w-full ${
              drawMode
                ? 'pointer-events-auto cursor-crosshair touch-none z-20 ring-2 ring-inset ring-blue-500/40'
                : 'pointer-events-none z-10'
            }`}
          />
        </div>

        {/* Bottom Sheet Pagination Bar */}
        {!readOnly && (
          <div className="no-print mx-auto max-w-[816px] flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-white/90 px-4 py-3 text-xs shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-slate-600">
              <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 font-bold text-blue-800">
                Kabuuang Pahina: {pageMetrics.pageCount}
              </span>
              {pageMetrics.firstPageFillPct >= 85 && pageMetrics.explicitBreaks === 0 ? (
                <span className="font-semibold text-blue-800">
                  Puno na ang unang pahina — maaari ka nang magdagdag ng bagong blangkong pahina.
                </span>
              ) : (
                <span className="text-slate-500">
                  Pindutin ang larawan upang ayusin ang laki nito, o magdagdag ng blangkong pahina.
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleAddBlankPage(true)}
              className="inline-flex items-center gap-1.5 rounded-xl tintalata-blue-btn px-3.5 py-2 text-xs font-bold text-white shadow-sm cursor-pointer"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              + Magdagdag ng Blangkong Pahina
            </button>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="no-print border-t border-blue-200 bg-white px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-600">
        <div className="flex items-center gap-4">
          <span>
            Mga Salita: <strong className="text-slate-900">{wordCount}</strong>
          </span>
          <span>
            Mga Karakter: <strong className="text-slate-900">{charCount}</strong>
          </span>
          <span>
            Guhit: <strong className="text-blue-700">{doodles.length} box</strong> •{' '}
            <strong className="text-indigo-700">{overlayStrokes.length} hagod sa pahina</strong>
          </span>
          {!readOnly && (
            <span
              className={`font-semibold ${
                hasUnsavedChanges ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              •{' '}
              {hasUnsavedChanges
                ? 'Hindi pa nai-save (Manual na pag-save)'
                : 'Nai-save na'}
            </span>
          )}
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

      <DoodleStudioModal
        isOpen={doodleStudioOpen}
        initialDoodle={editingDoodle}
        onClose={() => {
          setDoodleStudioOpen(false);
          setEditingDoodle(null);
        }}
        onSave={handleDoodleSave}
      />

      <ShareModal
        isOpen={shareModalOpen}
        documentId={doc.id}
        documentTitle={title}
        onClose={() => setShareModalOpen(false)}
        onNotify={onNotify}
        onChanged={() => onSharesChanged?.()}
      />
    </div>
  );
}
