import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '@renderer/components/GlassPanel.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';
import { useGestureStore } from '@renderer/stores/gestureStore.js';
import styles from './DrawingApp.module.css';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  size: number;
  mode: 'paint' | 'erase';
  points: Point[];
}

const COLORS = ['#ffffff', '#ffd76a', '#6cd28e', '#6aa9ff', '#b08cff', '#f08080'];

export function DrawingApp({ windowId: _windowId }: { windowId: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>('#ffffff');
  const [size, setSize] = useState<number>(6);
  const [mode, setMode] = useState<'paint' | 'erase'>('paint');
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Size canvas to its container, observing size changes.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    const obs = new ResizeObserver(resize);
    obs.observe(wrap);
    resize();
    return () => obs.disconnect();
  }, []);

  // Redraw whenever strokes change.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) {
      drawStroke(ctx, s);
    }
    if (currentStrokeRef.current) {
      drawStroke(ctx, currentStrokeRef.current);
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  // Pointer-based drawing (mouse or hand cursor). The hand cursor is
  // represented as a system pointer position via pointerRef; we drive
  // drawing by listening to native pointerdown on the canvas, and
  // synthesize pointermove from pointerRef while drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localPoint = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const begin = (e: PointerEvent): void => {
      e.preventDefault();
      drawingRef.current = true;
      currentStrokeRef.current = {
        color,
        size,
        mode,
        points: [localPoint(e)]
      };
      redraw();
    };

    const extend = (e: PointerEvent): void => {
      if (!drawingRef.current) return;
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      stroke.points.push(localPoint(e));
      redraw();
    };

    const end = (): void => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      if (stroke && stroke.points.length > 0) {
        setStrokes((prev) => [...prev, stroke]);
        setRedoStack([]);
      }
    };

    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', extend);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    return () => {
      canvas.removeEventListener('pointerdown', begin);
      canvas.removeEventListener('pointermove', extend);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointerleave', end);
    };
    // redraw is recreated every render but its behavior is stable; including it
    // would trigger re-binding listeners every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, size, mode]);

  // Hand-driven drawing: when the hand cursor is over the canvas AND
  // the gesture FSM is in DRAGGING state, treat as a continuous stroke.
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const p = pointerRef.position;
      const over = p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
      if (over && pointerRef.visible && useDraggingRef.current) {
        if (!currentStrokeRef.current) {
          currentStrokeRef.current = {
            color,
            size,
            mode,
            points: [{ x: p.x - rect.left, y: p.y - rect.top }]
          };
        } else {
          const stroke = currentStrokeRef.current;
          stroke.points.push({ x: p.x - rect.left, y: p.y - rect.top });
        }
        redraw();
      } else if (currentStrokeRef.current) {
        const stroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        if (stroke && stroke.points.length > 1) {
          setStrokes((prev) => [...prev, stroke]);
          setRedoStack([]);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [color, size, mode, redraw]);

  // Track dragging state from gesture store.
  const useDraggingRef = useRef(false);
  useEffect(() => {
    return useGestureStore.subscribe(
      (s) => s.fsmState === 'DRAGGING',
      (v) => (useDraggingRef.current = v)
    );
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
  }, []);

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `airvision-drawing-${Date.now()}.png`;
    a.click();
  }, []);

  const palette = useMemo(() => COLORS, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.colors}>
          {palette.map((c) => (
            <button
              key={c}
              className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className={styles.sizeRow}>
          <label className={styles.sizeLabel}>Size</label>
          <input
            type="range"
            min={2}
            max={24}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className={styles.sizeInput}
          />
          <span className={styles.sizeValue}>{size}</span>
        </div>
        <div className={styles.modeRow}>
          <GlassButton
            size="sm"
            variant={mode === 'paint' ? 'primary' : 'secondary'}
            onClick={() => setMode('paint')}
          >
            Brush
          </GlassButton>
          <GlassButton
            size="sm"
            variant={mode === 'erase' ? 'primary' : 'secondary'}
            onClick={() => setMode('erase')}
          >
            Erase
          </GlassButton>
        </div>
      </header>
      <GlassPanel padding="none" className={styles.canvasWrap} elevation={0}>
        <div ref={wrapRef} className={styles.canvasInner}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </GlassPanel>
      <footer className={styles.footer}>
        <GlassButton size="sm" variant="ghost" onClick={undo} disabled={strokes.length === 0}>
          Undo
        </GlassButton>
        <GlassButton size="sm" variant="ghost" onClick={redo} disabled={redoStack.length === 0}>
          Redo
        </GlassButton>
        <GlassButton size="sm" variant="ghost" onClick={clear} disabled={strokes.length === 0}>
          Clear
        </GlassButton>
        <GlassButton size="sm" variant="primary" onClick={exportPng}>
          Export PNG
        </GlassButton>
      </footer>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  if (s.points.length === 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  if (s.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;
  }
  ctx.beginPath();
  const [first, ...rest] = s.points;
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (const p of rest) {
    ctx.lineTo(p.x, p.y);
  }
  if (rest.length === 0) {
    ctx.lineTo(first.x + 0.01, first.y + 0.01);
  }
  ctx.stroke();
}