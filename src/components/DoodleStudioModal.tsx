import { useEffect, useRef, useState } from 'react';
import {
  PenTool,
  Pencil,
  Highlighter,
  Eraser,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  Triangle,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Check,
  X,
} from 'lucide-react';
import type { DoodleItem, DoodleStroke, DrawingTool } from '../types';
import {
  DRAW_COLOR_SWATCHES,
  drawStrokeOnContext,
  renderCanvasBackground,
} from '../utils/drawing';

interface DoodleStudioModalProps {
  isOpen: boolean;
  initialDoodle: DoodleItem | null;
  onClose: () => void;
  onSave: (doodle: DoodleItem) => void;
}

const CANVAS_W = 760;
const CANVAS_H = 420;

export function DoodleStudioModal({
  isOpen,
  initialDoodle,
  onClose,
  onSave,
}: DoodleStudioModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [title, setTitle] = useState('Aking Guhit');
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState('#1d4ed8');
  const [brushSize, setBrushSize] = useState(4);
  const [background, setBackground] = useState<'white' | 'transparent' | 'grid'>('white');
  const [strokes, setStrokes] = useState<DoodleStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DoodleStroke[]>([]);
  const activeStrokeRef = useRef<DoodleStroke | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialDoodle) {
      setTitle(initialDoodle.title || 'Aking Guhit');
      setBackground(initialDoodle.background || 'white');
      setStrokes(Array.isArray(initialDoodle.strokes) ? initialDoodle.strokes : []);
    } else {
      setTitle('Bagong Guhit');
      setBackground('white');
      setStrokes([]);
    }
    setRedoStack([]);
  }, [isOpen, initialDoodle]);

  const redrawAll = (
    strokesToDraw: DoodleStroke[],
    previewStroke: DoodleStroke | null,
    bg: 'white' | 'transparent' | 'grid'
  ) => {
    const visible = canvasRef.current;
    if (!visible) return;
    if (!inkCanvasRef.current) {
      inkCanvasRef.current = document.createElement('canvas');
      inkCanvasRef.current.width = CANVAS_W;
      inkCanvasRef.current.height = CANVAS_H;
    }
    const ink = inkCanvasRef.current;
    const inkCtx = ink.getContext('2d');
    const visCtx = visible.getContext('2d');
    if (!inkCtx || !visCtx) return;

    inkCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    for (const s of strokesToDraw) {
      drawStrokeOnContext(inkCtx, s);
    }
    if (previewStroke) {
      drawStrokeOnContext(inkCtx, previewStroke);
    }

    renderCanvasBackground(visCtx, CANVAS_W, CANVAS_H, bg);
    visCtx.drawImage(ink, 0, 0);
  };

  useEffect(() => {
    if (!isOpen) return;
    redrawAll(strokes, null, background);
  }, [isOpen, strokes, background]);

  if (!isOpen) return null;

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    isDrawingRef.current = true;
    const effectiveWidth =
      tool === 'highlighter'
        ? Math.max(14, brushSize * 2.5)
        : tool === 'eraser'
          ? brushSize * 2
          : brushSize;

    const stroke: DoodleStroke = {
      tool,
      color,
      width: effectiveWidth,
      opacity: 1,
      points: [pt],
    };
    activeStrokeRef.current = stroke;
    redrawAll(strokes, stroke, background);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    const pt = getCanvasPoint(e);
    const cur = activeStrokeRef.current;
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
    redrawAll(strokes, cur, background);
  };

  const finishStroke = () => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setStrokes((prev) => [...prev, finished]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    setStrokes((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setStrokes((prev) => [...prev, next]);
  };

  const handleClear = () => {
    if (strokes.length === 0) return;
    setStrokes([]);
    setRedoStack([]);
  };

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'guhit').replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handleInsertIntoDoc = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redrawAll(strokes, null, background);
    const dataUrl = canvas.toDataURL('image/png');
    onSave({
      id: initialDoodle?.id || `doodle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim() || 'Aking Guhit',
      width: CANVAS_W,
      height: CANVAS_H,
      background,
      strokes,
      dataUrl,
      updatedAt: new Date().toISOString(),
    });
  };

  const toolsList: Array<{ id: DrawingTool; label: string; icon: JSX.Element }> = [
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-5">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-blue-200 overflow-hidden flex flex-col max-h-[95vh]">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-600 px-5 py-3.5 text-white">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <PenTool className="h-5 w-5 shrink-0" />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-bold hidden sm:inline">Studio ng Pagguhit:</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pamagat ng Guhit"
                className="max-w-xs rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold text-white placeholder-blue-200 focus:bg-white focus:text-slate-900 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            className="rounded-lg p-1.5 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-2.5 flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white p-1 border border-blue-100">
            {toolsList.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  tool === t.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-blue-50'
                }`}
              >
                {t.icon}
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-blue-100">
            {DRAW_COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  setColor(swatch);
                  if (tool === 'eraser') setTool('pen');
                }}
                aria-label={`Kulay ${swatch}`}
                className={`h-5 w-5 rounded-full border transition ${
                  color === swatch && tool !== 'eraser'
                    ? 'ring-2 ring-blue-500 ring-offset-1 scale-110'
                    : 'border-slate-300'
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                if (tool === 'eraser') setTool('pen');
              }}
              title="Pumili ng ibang kulay"
              className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-blue-100 text-xs font-medium text-slate-700">
            <span>Kapal: {brushSize}px</span>
            <input
              type="range"
              min={2}
              max={28}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20 accent-blue-600"
            />
          </div>

          <select
            value={background}
            onChange={(e) => setBackground(e.target.value as 'white' | 'transparent' | 'grid')}
            className="rounded-xl border border-blue-100 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value="white">Puting Papel</option>
            <option value="grid">May Grid / Kuwaderno</option>
            <option value="transparent">Transparent</option>
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              title="I-undo"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="I-redo"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={strokes.length === 0}
              title="Burahin Lahat"
              className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center">
          <div
            className="tintalata-keep-light rounded-xl border-2 border-blue-200 shadow-lg overflow-hidden bg-white"
            style={{
              backgroundImage:
                background === 'transparent'
                  ? 'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)'
                  : undefined,
              backgroundSize: background === 'transparent' ? '20px 20px' : undefined,
              backgroundPosition:
                background === 'transparent' ? '0 0, 0 10px, 10px -10px, -10px 0px' : undefined,
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              className="block max-w-full h-auto touch-none cursor-crosshair"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Download className="h-4 w-4" />
            I-download bilang PNG
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kanselahin
            </button>
            <button
              type="button"
              onClick={handleInsertIntoDoc}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
            >
              <Check className="h-4 w-4" />
              {initialDoodle ? 'I-update ang Guhit sa Dokumento' : 'Ilagay sa Dokumento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
