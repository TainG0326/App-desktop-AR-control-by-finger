/**
 * Space Explore Mode - Immersive 3D solar system exploration.
 * 
 * - 3D planets floating in real space (not just circles)
 * - Each planet is interactive and draggable
 * - Click to focus and see scientific facts
 * - Smooth animations and realistic rendering
 */

import { useRef, useState, useCallback } from 'react';
import { getFact } from '@renderer/airscience/engines/contentEngine.js';
import { useProgressStore } from '@renderer/airscience/stores/progressStore.js';
import { useDraggable } from '@renderer/airscience/engines/objectAdapter.js';
import { FactCard } from '@renderer/airscience/components/FactCard.js';
import { Planet3DRender } from './Planet3DRender.js';
import { SpaceBackground } from '@renderer/airscience/components/SpaceBackground.js';
import type { ScienceFact } from '@renderer/airscience/types.js';
import styles from './SpaceExplore.module.css';

interface PlanetSpec {
  id: string;
  labelVi: string;
  labelEn: string;
  glyph: string;
  color: string;
  factId: string;
  baseSize: number; // relative to viewport
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle: number;
}

const PLANETS: PlanetSpec[] = [
  { id: 'mercury', labelVi: 'Sao Thủy', labelEn: 'Mercury', glyph: '☿', color: '#b8a98c', factId: 'space.mercury.basic', baseSize: 0.05, orbitRadius: 0.18, orbitSpeed: 0.008, initialAngle: 0 },
  { id: 'venus',   labelVi: 'Sao Kim',   labelEn: 'Venus',   glyph: '♀', color: '#e8c98a', factId: 'space.venus.basic',   baseSize: 0.07, orbitRadius: 0.28, orbitSpeed: 0.006, initialAngle: 0.8 },
  { id: 'earth',   labelVi: 'Trái Đất', labelEn: 'Earth',   glyph: '🌍', color: '#4a90e2', factId: 'space.earth.basic',   baseSize: 0.075, orbitRadius: 0.40, orbitSpeed: 0.005, initialAngle: 1.6 },
  { id: 'mars',    labelVi: 'Sao Hỏa',  labelEn: 'Mars',    glyph: '♂', color: '#d96b3e', factId: 'space.mars.basic',    baseSize: 0.06, orbitRadius: 0.52, orbitSpeed: 0.004, initialAngle: 2.4 },
  { id: 'jupiter', labelVi: 'Sao Mộc',  labelEn: 'Jupiter', glyph: '♃', color: '#d8a878', factId: 'space.jupiter.basic', baseSize: 0.13, orbitRadius: 0.68, orbitSpeed: 0.002, initialAngle: 3.2 },
  { id: 'saturn',  labelVi: 'Sao Thổ',  labelEn: 'Saturn',  glyph: '♄', color: '#e0c290', factId: 'space.saturn.basic',  baseSize: 0.11, orbitRadius: 0.84, orbitSpeed: 0.0015, initialAngle: 4.0 },
  { id: 'uranus',  labelVi: 'Sao Thiên Vương', labelEn: 'Uranus', glyph: '♅', color: '#4fd0e7', factId: 'space.uranus.basic', baseSize: 0.08, orbitRadius: 0.90, orbitSpeed: 0.001, initialAngle: 4.8 },
  { id: 'neptune', labelVi: 'Sao Hải Vương', labelEn: 'Neptune', glyph: '♆', color: '#4b70dd', factId: 'space.neptune.basic', baseSize: 0.08, orbitRadius: 0.94, orbitSpeed: 0.0008, initialAngle: 5.6 }
];

interface PlanetState {
  x: number;
  y: number;
  scale: number;
}

export function SpaceExplore(): JSX.Element {
  const discoverObject = useProgressStore((s) => s.discoverObject);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, PlanetState>>(() => {
    // Distribute planets along realistic orbital paths
    const positions: Record<string, PlanetState> = {};
    PLANETS.forEach(p => {
      const angle = p.initialAngle;
      positions[p.id] = {
        x: 0.5 + Math.cos(angle) * p.orbitRadius * 0.35,
        y: 0.5 + Math.sin(angle) * p.orbitRadius * 0.25,
        scale: 1
      };
    });
    return positions;
  });

  const sceneRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId((prev) => {
        if (prev === id) return null;
        // Discover this object (idempotent — only grants XP once)
        const p = PLANETS.find((pl) => pl.id === id);
        if (p) {
          const fact = getFact(p.factId);
          if (fact) discoverObject('space', id, fact.xpReward);
        }
        return id;
      });
    },
    [discoverObject]
  );

  // Click empty area → deselect
  const handleSceneClick = useCallback((e: React.MouseEvent) => {
    if (e.target === sceneRef.current || (e.target as HTMLElement).classList.contains('planet-orbit')) {
      setSelectedId(null);
    }
  }, []);

  const selectedFact: ScienceFact | undefined = selectedId
    ? getFact(PLANETS.find((p) => p.id === selectedId)?.factId ?? '')
    : undefined;

  return (
    <div className={styles.explore}>
      <SpaceBackground />
      <div className={styles.scene} ref={sceneRef} onClick={handleSceneClick}>
        {/* Sun center */}
        <div className={styles.sunContainer}>
          <Planet3DRender type="sun" size={180} autoRotate rotationSpeed={0.002} />
          <div className={styles.sunLabel}>Mặt Trời</div>
        </div>

        {/* Planets */}
        {PLANETS.map((p) => {
          const pos = positions[p.id];
          const selected = selectedId === p.id;
          const sizePx = Math.max(60, window.innerWidth * p.baseSize);
          return (
            <ExplorePlanet
              key={p.id}
              planet={p}
              pos={pos}
              selected={selected}
              size={sizePx}
              onMove={(x, y) => {
                setPositions((prev) => ({ ...prev, [p.id]: { ...prev[p.id], x, y } }));
              }}
              onClick={() => handleSelect(p.id)}
            />
          );
        })}
      </div>

      {selectedFact && (
        <FactCard
          fact={selectedFact}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

interface ExplorePlanetProps {
  planet: PlanetSpec;
  pos: PlanetState;
  selected: boolean;
  size: number;
  onMove: (x: number, y: number) => void;
  onClick: () => void;
}

function ExplorePlanet({ planet, pos, selected, size, onMove, onClick }: ExplorePlanetProps): JSX.Element {
  const localRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const toLocal = useCallback(
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
    viewportToLocal: toLocal,
    onDragStart: () => {
      dragging.current = true;
    },
    onDragMove: (local) => {
      const cx = Math.max(0.05, Math.min(0.95, local.x));
      const cy = Math.max(0.1, Math.min(0.85, local.y));
      onMove(cx, cy);
    },
    onDragEnd: () => {
      setTimeout(() => { dragging.current = false; }, 0);
    }
  });

  const scaleFactor = selected ? 1.4 : 1;

  return (
    <div
      ref={localRef}
      className={`${styles.planet} ${selected ? styles.selected : ''}`}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${scaleFactor})`
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!dragging.current) onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      role="button"
      tabIndex={-1}
      aria-label={`${planet.labelVi} - ${planet.labelEn}`}
      data-planet-id={planet.id}
    >
      <Planet3DRender
        type={planet.id}
        size={size}
        autoRotate={!selected}
        rotationSpeed={0.004}
        selected={selected}
      />
      <div className={styles.planetInfo}>
        <span className={styles.label}>{planet.labelVi}</span>
        <span className={styles.labelEn}>{planet.labelEn}</span>
      </div>
    </div>
  );
}