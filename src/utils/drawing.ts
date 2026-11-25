import type { DoodleStroke } from '../types';

export const DRAW_COLOR_SWATCHES = [
  '#1d4ed8',
  '#0f172a',
  '#dc2626',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0284c7',
  '#db2777',
];

export function drawStrokeOnContext(ctx: CanvasRenderingContext2D, stroke: DoodleStroke) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.width;

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = stroke.color;
  } else if (stroke.tool === 'pencil') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1.5, stroke.width * 0.65);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = stroke.opacity;
    ctx.strokeStyle = stroke.color;
  }

  const pts = stroke.points;
  const start = pts[0];
  const end = pts[pts.length - 1];

  if (stroke.tool === 'line' && pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'arrow' && pts.length >= 2) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = Math.max(10, stroke.width * 3);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'rect' && pts.length >= 2) {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.restore();
    return;
  }

  if (stroke.tool === 'circle' && pts.length >= 2) {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'triangle' && pts.length >= 2) {
    const topX = (start.x + end.x) / 2;
    ctx.beginPath();
    ctx.moveTo(topX, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(start.x, end.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Smooth freehand stroke (pen / pencil / highlighter / eraser)
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
    ctx.fill();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderCanvasBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: 'white' | 'transparent' | 'grid'
) {
  ctx.clearRect(0, 0, width, height);
  if (bg === 'transparent') return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (bg === 'grid') {
    ctx.save();
    ctx.strokeStyle = '#dbeafe';
    ctx.lineWidth = 1;
    const step = 24;
    for (let x = step; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
