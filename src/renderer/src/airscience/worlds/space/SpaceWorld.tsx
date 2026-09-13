/**
 * Space World — vertical slice.
 *
 * When in explore mode, shows the full-screen 3D explorer for any solar system body
 * (Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune).
 * When in mission mode, shows MissionRunner wrapped in WorldShell.
 */

import { useEffect, useState } from 'react';
import { WorldShell } from '../../components/WorldShell.js';
import { MissionPicker } from '../../components/MissionPicker.js';
import { MissionRunner } from '../../components/MissionRunner.js';
import { SpaceExplorer3D } from './SpaceExplorer3D.js';
import { SunExplorer3D } from './SunExplorer3D.js';
import { PlanetExplorer3D } from './PlanetExplorer3D.js';
import { missionEngine } from '../../engines/missionEngine.js';
import { useWorldBridge } from '../../worldBridge.js';

const SPACE_MISSION_IDS = ['space.solar-system', 'space.earth-moon', 'space.day-night'];

// All bodies available in explore mode
type ExploreBody = 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

interface BodyEntry {
  id: ExploreBody;
  name: string;
  glyph: string;
  accent: string;
}

const BODIES: BodyEntry[] = [
  { id: 'sun',     name: 'Mặt Trời',      glyph: '☀️', accent: '#ffb347' },
  { id: 'mercury', name: 'Sao Thủy',      glyph: '☿',  accent: '#a89070' },
  { id: 'venus',   name: 'Sao Kim',       glyph: '♀',  accent: '#e8c48a' },
  { id: 'earth',   name: 'Trái Đất',      glyph: '🌍', accent: '#4a90e2' },
  { id: 'moon',    name: 'Mặt Trăng',     glyph: '🌙', accent: '#d0d0d8' },
  { id: 'mars',    name: 'Sao Hỏa',       glyph: '♂',  accent: '#c1440e' },
  { id: 'jupiter', name: 'Sao Mộc',       glyph: '♃',  accent: '#d8ca9d' },
  { id: 'saturn',  name: 'Sao Thổ',       glyph: '♄',  accent: '#fad5a5' },
  { id: 'uranus',  name: 'Sao Thiên Vương', glyph: '♅', accent: '#4fd0e7' },
  { id: 'neptune', name: 'Sao Hải Vương', glyph: '♆',  accent: '#4b70dd' }
];

export function SpaceWorld(): JSX.Element {
  const mode = useWorldBridge((s) => s.mode);
  const activeMissionId = useWorldBridge((s) => s.activeMissionId);
  const setActiveMission = useWorldBridge((s) => s.setActiveMission);

  // Selected body in explore mode
  const [exploreBody, setExploreBody] = useState<ExploreBody>('earth');

  // Auto-select first mission when entering Space in mission mode.
  useEffect(() => {
    if (mode === 'mission' && !activeMissionId && SPACE_MISSION_IDS.length > 0) {
      setActiveMission(SPACE_MISSION_IDS[0]);
    }
  }, [mode, activeMissionId, setActiveMission]);

  // Explore mode: full-screen 3D for any body
  if (mode === 'explore') {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        {/* Body selector — all 10 solar system bodies (borderless, compact) */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '4px',
            zIndex: 50,
            background: 'rgba(8, 6, 4, 0.85)',
            padding: '6px 8px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(14px)',
            maxWidth: '96vw',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          {BODIES.map((b) => {
            const isActive = exploreBody === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setExploreBody(b.id)}
                title={b.name}
                style={{
                  padding: '7px 12px',
                  background: isActive
                    ? `linear-gradient(135deg, ${b.accent}, ${b.accent}cc)`
                    : 'transparent',
                  border: 'none',
                  borderRadius: '14px',
                  color: isActive ? '#1a0a00' : 'rgba(220, 215, 200, 0.85)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: '14px' }}>{b.glyph}</span>
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>

        {/* Render selected body — key forces a fresh mount per body so the
            WebGL context is rebuilt when switching planets. Without this, the
            `useEffect([])` in PlanetExplorer3D never re-runs and the old
            planet stays on screen, leaking WebGL contexts. */}
        {exploreBody === 'earth' && <SpaceExplorer3D key="earth" />}
        {exploreBody === 'sun' && <SunExplorer3D key="sun" />}
        {exploreBody !== 'earth' && exploreBody !== 'sun' && (
          <PlanetExplorer3D
            key={exploreBody}
            planetId={exploreBody as 'mercury' | 'venus' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'}
          />
        )}
      </div>
    );
  }

  // Mission mode: wrapped in WorldShell with mission picker
  const activeMission = activeMissionId !== null ? missionEngine.load(activeMissionId) : undefined;

  return (
    <WorldShell
      title="Vũ trụ"
      subtitle="Khám phá các hành tinh"
      showModeToggle
      missionPicker={
        <MissionPicker
          worldId="space"
          activeId={activeMissionId}
          onSelect={setActiveMission}
        />
      }
    >
      {activeMission ? (
        <MissionRunner
          key={activeMission.id}
          mission={activeMission}
          glyph="🪐"
        />
      ) : (
        <div />
      )}
    </WorldShell>
  );
}
