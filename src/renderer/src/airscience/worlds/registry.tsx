/**
 * AirScience world registry.
 *
 * Adding a world = adding an entry here. Worlds know their own renderer
 * and their placeholder label.
 */

import type { WorldId } from '../types.js';
import { SpaceWorld } from './space/SpaceWorld.js';

export interface WorldEntry {
  id: WorldId;
  label: string;
  subtitle: string;
  glyph: string;
  status: 'live' | 'coming-soon';
  renderer: () => JSX.Element;
}

export const WORLDS: WorldEntry[] = [
  {
    id: 'space',
    label: 'Vũ trụ',
    subtitle: 'Các hành tinh và Mặt Trời',
    glyph: '🪐',
    status: 'live',
    renderer: () => <SpaceWorld />
  }
];

export function findWorld(id: WorldId): WorldEntry | undefined {
  return WORLDS.find((w) => w.id === id);
}
