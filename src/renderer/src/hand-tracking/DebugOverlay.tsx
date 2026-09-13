import { useEffect, useRef } from 'react';
import { LANDMARK } from './types.js';
import type { HandFrame } from './types.js';
import styles from './DebugOverlay.module.css';

const SKELETON: Array<[number, number]> = [
  // Thumb
  [LANDMARK.WRIST, LANDMARK.THUMB_CMC],
  [LANDMARK.THUMB_CMC, LANDMARK.THUMB_MCP],
  [LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP],
  [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP],
  // Index
  [LANDMARK.WRIST, LANDMARK.INDEX_MCP],
  [LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP],
  [LANDMARK.INDEX_PIP, LANDMARK.INDEX_DIP],
  [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP],
  // Middle
  [LANDMARK.WRIST, LANDMARK.MIDDLE_MCP],
  [LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP],
  [LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_DIP],
  [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP],
  // Ring
  [LANDMARK.WRIST, LANDMARK.RING_MCP],
  [LANDMARK.RING_MCP, LANDMARK.RING_PIP],
  [LANDMARK.RING_PIP, LANDMARK.RING_DIP],
  [LANDMARK.RING_DIP, LANDMARK.RING_TIP],
  // Pinky
  [LANDMARK.WRIST, LANDMARK.PINKY_MCP],
  [LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP],
  [LANDMARK.PINKY_PIP, LANDMARK.PINKY_DIP],
  [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP],
  // Palm
  [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP],
  [LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP],
  [LANDMARK.RING_MCP, LANDMARK.PINKY_MCP]
];

interface Props {
  visible: boolean;
  frame: HandFrame | null;
  fps: number;
  inferenceMs: number;
}

/**
 * Developer overlay: draws hand landmarks and skeleton on top of the camera feed.
 * Coordinates are camera-space [0..1]; we project them to viewport pixels with
 * mirrored correction applied.
 */
export function DebugOverlay({ visible, frame, fps, inferenceMs }: Props): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (): void => {
      const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      if (!frame || frame.hands.length === 0) return;

      const mirror = true;
      frame.hands.forEach((hand) => {
        const project = (lx: number, ly: number): [number, number] => {
          const x = mirror ? (1 - lx) * w : lx * w;
          const y = ly * h;
          return [x, y];
        };

        // Skeleton
        ctx.strokeStyle = 'rgba(106, 169, 255, 0.7)';
        ctx.lineWidth = 2 * window.devicePixelRatio;
        SKELETON.forEach(([a, b]) => {
          const pa = hand.landmarks[a];
          const pb = hand.landmarks[b];
          if (!pa || !pb) return;
          const [ax, ay] = project(pa.x, pa.y);
          const [bx, by] = project(pb.x, pb.y);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        });

        // Landmarks
        hand.landmarks.forEach((lm, i) => {
          const [x, y] = project(lm.x, lm.y);
          ctx.fillStyle = i === LANDMARK.INDEX_TIP ? '#ffd76a' : '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 3.5 * window.devicePixelRatio, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    };

    draw();
  }, [visible, frame]);

  if (!visible) return null;

  return (
    <div className={styles.shell} aria-hidden>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.hud}>
        <div className={styles.row}>
          <span className={styles.label}>FPS</span>
          <span className={styles.value}>{fps.toFixed(1)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Inference</span>
          <span className={styles.value}>{inferenceMs.toFixed(1)} ms</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Hands</span>
          <span className={styles.value}>{frame?.hands.length ?? 0}</span>
        </div>
        {frame && frame.hands[0] && (
          <div className={styles.row}>
            <span className={styles.label}>Confidence</span>
            <span className={styles.value}>{frame.hands[0].score.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}