import { useCallback, useEffect, useRef } from 'react';
import { pointerRef } from '../stores/pointerStore.js';
import { useGestureStore } from '../stores/gestureStore.js';
import { PAINT_COLORS, useToolStore } from '../stores/toolStore.js';
import styles from './DrawingOverlay.module.css';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  size: number;
  points: Point[];
}

/**
 * Full-screen drawing overlay. Active when toolStore.activeTool === 'paint'.
 *
 * Strokes are driven by:
 *   1. Native pointer events (mouse / touch).
 *   2. Hand-cursor drag (gesture FSM DRAGGING state) — pinch and move finger
 *      draws a stroke that follows the hand cursor.
 *
 * Strokes are kept in a ref so we never trigger React re-renders mid-stroke.
 * A `strokesVersion` counter in toolStore forces a re-render only when
 * strokes are committed (clear / unmount).
 */
export function DrawingOverlay(): JSX.Element | null {
  const activeTool = useToolStore((s) => s.activeTool);
  const paintColor = useToolStore((s) => s.paintColor);
  const paintSize = useToolStore((s) => s.paintSize);
  const setPaintColor = useToolStore((s) => s.setPaintColor);
  const setPaintSize = useToolStore((s) => s.setPaintSize);
  const clearStrokes = useToolStore((s) => s.clearStrokes);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const lastPointRef = useRef<Point | null>(null);

  const active = activeTool === 'paint';

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, s: Stroke): void => {
    if (s.points.length === 0) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.size;
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    const [first, ...rest] = s.points;
    if (!first) return;
    ctx.moveTo(first.x, first.y);
    for (const p of rest) ctx.lineTo(p.x, p.y);
    if (rest.length === 0) {
      // Single point — draw a small dot so the user sees the click.
      ctx.arc(first.x, first.y, s.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    if (currentStrokeRef.current) drawStroke(ctx, currentStrokeRef.current);
  }, [drawStroke]);

  // Resize canvas to viewport, handle DPR.
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [active, redraw]);

  // Re-render when clearStrokes() bumps version.
  useEffect(() => {
    const unsub = useToolStore.subscribe(
      (s) => s.strokesVersion,
      () => {
        strokesRef.current = [];
        currentStrokeRef.current = null;
        redraw();
      }
    );
    return unsub;
  }, [redraw]);

  // Native pointer events (mouse / touch).
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const localPoint = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY });

    const begin = (e: PointerEvent): void => {
      e.preventDefault();
      const p = localPoint(e);
      lastPointRef.current = p;
      currentStrokeRef.current = {
        color: paintColor,
        size: paintSize,
        points: [p]
      };
      redraw();
    };

    const extend = (e: PointerEvent): void => {
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      const p = localPoint(e);
      stroke.points.push(p);
      lastPointRef.current = p;
      redraw();
    };

    const end = (): void => {
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      lastPointRef.current = null;
      if (stroke && stroke.points.length > 0) {
        strokesRef.current = [...strokesRef.current, stroke];
        useToolStore.getState().bumpStrokeVersion();
      }
    };

    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', extend);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener('pointercancel', end);
    return () => {
      canvas.removeEventListener('pointerdown', begin);
      canvas.removeEventListener('pointermove', extend);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointerleave', end);
      canvas.removeEventListener('pointercancel', end);
    };
  }, [active, paintColor, paintSize, redraw]);

  // Hand-driven drawing: pinch + move over the canvas → continuous stroke.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let lastFsState = '';

    const tick = (): void => {
      const fsState = useGestureStore.getState().fsmState;
      const overToolbar = pointerRef.position.x > window.innerWidth - 96;

      if (
        fsState === 'DRAGGING' &&
        pointerRef.visible &&
        !overToolbar
      ) {
        const p: Point = { x: pointerRef.position.x, y: pointerRef.position.y };
        if (!currentStrokeRef.current) {
          currentStrokeRef.current = {
            color: paintColor,
            size: paintSize,
            points: [p]
          };
        } else {
          currentStrokeRef.current.points.push(p);
        }
        redraw();
      } else if (currentStrokeRef.current) {
        const stroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        lastPointRef.current = null;
        if (stroke && stroke.points.length > 1) {
          strokesRef.current = [...strokesRef.current, stroke];
          useToolStore.getState().bumpStrokeVersion();
        }
      }

      if (fsState !== lastFsState) lastFsState = fsState;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paintColor, paintSize, redraw]);

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `airvision-paint-${Date.now()}.png`;
    a.click();
  }, []);

  if (!active) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Bảng vẽ cử chỉ tay"
      />
      <div className={styles.toolbar}>
        <div className={styles.section}>
          <div className={styles.title}>Màu</div>
          <div className={styles.colors}>
            {PAINT_COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.swatch} ${paintColor === c ? styles.swatchActive : ''}`}
                style={{ background: c }}
                onClick={() => setPaintColor(c)}
                aria-label={`Màu ${c}`}
                data-color={c}
              />
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.title}>Cỡ</div>
          <input
            type="range"
            min={2}
            max={32}
            value={paintSize}
            onChange={(e) => setPaintSize(Number(e.target.value))}
            className={styles.slider}
            aria-label="Cỡ nét vẽ"
          />
          <div className={styles.sizeValue}>{paintSize}px</div>
        </div>
        <div className={styles.section}>
          <button className={styles.actionBtn} onClick={clearStrokes} data-action="clear">
            ✕ Xóa
          </button>
          <button className={styles.actionBtn} onClick={exportPng} data-action="export">
            ↓ PNG
          </button>
        </div>
        <div className={styles.hint}>
          Chụm ngón cái + ngón trỏ và di để vẽ.
        </div>
      </div>
    </>
  );
}
