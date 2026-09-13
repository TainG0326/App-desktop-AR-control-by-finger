/**
 * MissionRunner — renders a single Mission.
 *
 * Handles:
 *  - Mission intro overlay (auto-shown on first render).
 *  - Drag-and-place for placeable objects.
 *  - Drop validation against correct slots.
 *  - Fact card on success.
 *  - "+XP" reward chip.
 *
 * Scene coords are normalized (0..1) relative to the scene container.
 * The scene container is positioned to fill the world container; its
 * size is observed so we can convert pointer events into normalized
 * coordinates.
 */

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { missionEngine, type Placement, type CompletionResult } from '../engines/missionEngine.js';
import { getFact } from '../engines/contentEngine.js';
import { useProgressStore } from '../stores/progressStore.js';
import { useWorldBridge } from '../worldBridge.js';
import { MissionIntro } from './MissionIntro.js';
import { FactCard } from './FactCard.js';
import { Planet3DRender } from '../worlds/space/Planet3DRender.js';
import { SpaceBackground } from './SpaceBackground.js';
import { useDraggable } from '../engines/objectAdapter.js';
import type { Mission, PlaceableObject } from '../types.js';
import styles from './MissionRunner.module.css';

interface MissionRunnerProps {
  mission: Mission;
  /** Glyph shown in the intro overlay. */
  glyph?: string;
  /** Called when the user finishes (success or give-up). */
  onExit?: () => void;
}

interface ObjectPlacement {
  /** Current normalized position. */
  x: number;
  y: number;
  /** Whether the object is locked at its correct slot. */
  locked: boolean;
}

export function MissionRunner({ mission, glyph = '✨' }: MissionRunnerProps): JSX.Element {
  const completeMission = useProgressStore((s) => s.completeMission);
  const setActiveMission = useWorldBridge((s) => s.setActiveMission);

  const [introOpen, setIntroOpen] = useState(true);
  const placements = useRef<Placement[]>([]);
  const [placementsTick, setPlacementsTick] = useState(0);
  const [objectStates, setObjectStates] = useState<Record<string, ObjectPlacement>>(() =>
    Object.fromEntries(
      mission.objects.map((o) => [
        o.id,
        {
          x: o.initialPosition.x,
          y: o.initialPosition.y,
          locked: false
        }
      ])
    )
  );
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [showReward, setShowReward] = useState(false);

  const sceneRef = useRef<HTMLDivElement>(null);
  const objectRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [sceneSize, setSceneSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSceneSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSceneSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Validate placements whenever they change.
  useEffect(() => {
    // Force re-validation when placements tick changes.
    void placementsTick;
  }, [placementsTick]);

  const finalizeAndValidate = useCallback(() => {
    const result = missionEngine.validate(mission, placements.current);
    setCompletion(result);
    if (result.success) {
      completeMission(mission.id, 3, mission.worldId);
      setShowReward(true);
      setTimeout(() => setShowReward(false), 2400);
    }
  }, [mission, completeMission]);

  // Hook for drag listener installed by MissionObject child.
  // Exposed via global callback to keep this component in charge of state.
  const handleObjectPlaced = useCallback(
    (objectId: string, slotId: string) => {
      // Replace any existing placement for this object.
      placements.current = [
        ...placements.current.filter((p) => p.objectId !== objectId),
        { objectId, slotId }
      ];
      setPlacementsTick((t) => t + 1);

      // Validate immediately to know if the mission is done.
      const result = missionEngine.validate(mission, placements.current);
      if (result.success) {
        completeMission(mission.id, 3, mission.worldId);
        setCompletion(result);
        setShowReward(true);
        setTimeout(() => setShowReward(false), 2400);
      } else {
        setCompletion(result);
      }
    },
    [mission, completeMission]
  );

  const handleWrong = useCallback((objectId: string) => {
    // Return the object to its initial position.
    const obj = mission.objects.find((o) => o.id === objectId);
    if (!obj) return;
    setObjectStates((prev) => ({
      ...prev,
      [objectId]: {
        x: obj.initialPosition.x,
        y: obj.initialPosition.y,
        locked: false
      }
    }));
    // Remove its placement record so it can be re-attempted.
    placements.current = placements.current.filter((p) => p.objectId !== objectId);
    setPlacementsTick((t) => t + 1);
  }, [mission]);

  const handleLockAtSlot = useCallback((objectId: string, slotId: string) => {
    const slot = mission.slots.find((s) => s.id === slotId);
    if (!slot) return;
    setObjectStates((prev) => ({
      ...prev,
      [objectId]: { x: slot.x, y: slot.y, locked: true }
    }));
  }, [mission]);

  const successFact = completion?.success ? getFact(mission.factIdOnSuccess) : null;

  return (
    <div className={styles.runner}>
      {introOpen && (
        <MissionIntro
          mission={mission}
          glyph={glyph}
          onStart={() => {
            setIntroOpen(false);
            setActiveMission(mission.id);
          }}
        />
      )}

      <SpaceBackground />
      <div className={styles.scene} ref={sceneRef}>
        {/* Drop slot indicators */}
        {mission.slots.map((slot) => (
          <div
            key={slot.id}
            className={styles.slot}
            style={{
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${(slot.radius ?? 0.06) * 100}%`,
              paddingBottom: `${(slot.radius ?? 0.06) * 100}%`
            }}
            data-slot-id={slot.id}
          >
            <div className={styles.slotInner} />
          </div>
        ))}

        {/* Placeable objects */}
        {mission.objects.map((obj) => {
          const state = objectStates[obj.id];
          const isLocked = state.locked;
          return (
            <MissionObject
              key={obj.id}
              obj={obj}
              sceneSize={sceneSize}
              state={state}
              ref={(node) => {
                objectRefs.current[obj.id] = node;
              }}
              onMove={(x, y) => {
                if (isLocked) return;
                setObjectStates((prev) => ({
                  ...prev,
                  [obj.id]: { ...prev[obj.id], x, y }
                }));
              }}
              onDragEnd={(x, y) => {
                if (isLocked) return;
                // Find which slot this drop hit (if any).
                const hit = mission.slots.find((slot) => {
                  const dx = (x - slot.x) * sceneSize.w;
                  const dy = (y - slot.y) * sceneSize.h;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  return dist <= (slot.radius ?? 0.06) * sceneSize.w;
                });
                if (!hit) {
                  handleWrong(obj.id);
                  return;
                }
                if (hit.id === obj.correctSlotId) {
                  handleLockAtSlot(obj.id, hit.id);
                  handleObjectPlaced(obj.id, hit.id);
                } else {
                  handleWrong(obj.id);
                }
              }}
            />
          );
        })}
      </div>

      {/* Wrong-answer hint */}
      {completion && !completion.success && completion.remaining.length < mission.objects.length && (
        <div className={styles.hint}>
          <span>{mission.wrongHint}</span>
        </div>
      )}

      {/* Success fact card */}
      {successFact && (
        <FactCard
          fact={successFact}
          showReward={showReward ? mission.xpReward : undefined}
          onClose={() => {
            setCompletion(null);
          }}
        />
      )}

      {void finalizeAndValidate}
    </div>
  );
}

// ── MissionObject: a single draggable element ───────────────────────────────

interface MissionObjectProps {
  obj: PlaceableObject;
  sceneSize: { w: number; h: number };
  state: ObjectPlacement;
  onMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  ref?: (node: HTMLDivElement | null) => void;
}

function MissionObject({ obj, sceneSize, state, onMove, onDragEnd, ref }: MissionObjectProps): JSX.Element {
  const localRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      ref?.(node);
    },
    [ref]
  );

  const toLocalViewport = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const node = localRef.current;
      if (!node) return { x: 0, y: 0 };
      const parent = node.parentElement;
      if (!parent) return { x: 0, y: 0 };
      const rect = parent.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      };
    },
    []
  );

  useDraggable({
    ref: localRef,
    viewportToLocal: toLocalViewport,
    onDragMove: (local) => {
      if (state.locked) return;
      // Clamp to scene bounds.
      const cx = Math.max(0.04, Math.min(0.96, local.x));
      const cy = Math.max(0.04, Math.min(0.96, local.y));
      onMove(cx, cy);
    },
    onDragEnd: (local) => {
      if (!local.dragged) return;
      if (state.locked) return;
      onDragEnd(local.x, local.y);
    }
  });

  const diameterPx = Math.max(48, sceneSize.w * 0.07);

  // Map object IDs to planet types for Space World
  const planetTypeMap: Record<string, string> = {
    mercury: 'mercury',
    venus: 'venus',
    earth: 'earth',
    mars: 'mars',
    jupiter: 'jupiter',
    saturn: 'saturn',
    moon: 'moon',
    sun: 'sun'
  };

  const planetType = planetTypeMap[obj.id];
  const isPlanet = planetType !== undefined;

  return (
    <div
      ref={setRefs}
      className={`${styles.object} ${state.locked ? styles.locked : ''}`}
      style={{
        left: `${state.x * 100}%`,
        top: `${state.y * 100}%`,
        width: diameterPx,
        height: diameterPx,
        background: isPlanet ? 'transparent' : `radial-gradient(circle at 30% 30%, ${obj.color}, ${shade(obj.color, -30)})`,
        touchAction: 'none'
      }}
      data-object-id={obj.id}
      aria-label={obj.labelVi}
      role="button"
      tabIndex={-1}
    >
      {isPlanet ? (
        <Planet3DRender type={planetType} size={diameterPx} />
      ) : (
        <span className={styles.glyph} aria-hidden>{obj.glyph}</span>
      )}
      <span className={styles.label}>{obj.labelVi}</span>
    </div>
  );
}

// ── Color helper: produce a darker shade for gradient stops ─────────────────
function shade(hex: string, percent: number): string {
  // Accepts #rrggbb or rgb(r,g,b). Simple HSL lightness nudge by converting to
  // rgb integers, computing new lightness.
  let r = 0, g = 0, b = 0;
  if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    }
  } else {
    return hex;
  }
  const adjust = (c: number): number => {
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    return Math.round((t - c) * p) + c;
  };
  return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`;
}
