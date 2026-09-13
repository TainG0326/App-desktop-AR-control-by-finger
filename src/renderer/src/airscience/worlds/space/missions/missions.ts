/**
 * Space World mission data.
 *
 * All missions for the Space World vertical slice live here. Each
 * mission is a *data* object — the React renderer (MissionRunner) just
 * consumes it.
 *
 * Geometry is normalized (0..1) relative to the world container. The
 * renderer scales to actual pixels, so missions remain responsive.
 */

import type { Mission } from '@renderer/airscience/types.js';

/** Six orbit slots arranged in concentric rings around the sun. */
const ORBIT_SLOTS = [
  { id: 'orbit-1', x: 0.18, y: 0.5, radius: 0.06 }, // Mercury
  { id: 'orbit-2', x: 0.30, y: 0.5, radius: 0.07 }, // Venus
  { id: 'orbit-3', x: 0.43, y: 0.5, radius: 0.08 }, // Earth
  { id: 'orbit-4', x: 0.57, y: 0.5, radius: 0.075 }, // Mars
  { id: 'orbit-5', x: 0.72, y: 0.5, radius: 0.10 }, // Jupiter
  { id: 'orbit-6', x: 0.86, y: 0.5, radius: 0.09 } // Saturn
];

/**
 * Mission 1: Build the Solar System.
 *
 * Six planets appear scattered at the bottom of the screen. The child
 * drags each one onto its correct orbit slot from inside out.
 */
export const SOLAR_SYSTEM_MISSION: Mission = {
  id: 'space.solar-system',
  worldId: 'space',
  title: 'Xây dựng Hệ Mặt Trời',
  description: 'Các hành tinh bị lạc rồi! Em hãy giúp đưa chúng về đúng quỹ đạo.',
  ageRange: [7, 10],
  difficulty: 'easy',
  instructions: [
    'Mặt Trời ở giữa.',
    'Em hãy kéo từng hành tinh về đúng quỹ đạo của nó.',
    'Bắt đầu từ hành tinh gần Mặt Trời nhất.'
  ],
  slots: ORBIT_SLOTS,
  objects: [
    {
      id: 'mercury',
      labelVi: 'Sao Thủy',
      glyph: '☿',
      color: '#b8a98c',
      initialPosition: { x: 0.12, y: 0.82 },
      correctSlotId: 'orbit-1'
    },
    {
      id: 'venus',
      labelVi: 'Sao Kim',
      glyph: '♀',
      color: '#e8c98a',
      initialPosition: { x: 0.27, y: 0.85 },
      correctSlotId: 'orbit-2'
    },
    {
      id: 'earth',
      labelVi: 'Trái Đất',
      glyph: '🌍',
      color: '#4a90e2',
      initialPosition: { x: 0.42, y: 0.88 },
      correctSlotId: 'orbit-3'
    },
    {
      id: 'mars',
      labelVi: 'Sao Hỏa',
      glyph: '♂',
      color: '#d96b3e',
      initialPosition: { x: 0.57, y: 0.85 },
      correctSlotId: 'orbit-4'
    },
    {
      id: 'jupiter',
      labelVi: 'Sao Mộc',
      glyph: '♃',
      color: '#d8a878',
      initialPosition: { x: 0.72, y: 0.88 },
      correctSlotId: 'orbit-5'
    },
    {
      id: 'saturn',
      labelVi: 'Sao Thổ',
      glyph: '♄',
      color: '#e0c290',
      initialPosition: { x: 0.87, y: 0.85 },
      correctSlotId: 'orbit-6'
    }
  ],
  factIdOnSuccess: 'space.earth.basic',
  wrongHint: 'Hãy thử quỹ đạo khác nhé!',
  xpReward: 100
};

/**
 * Mission 2: Earth and Moon.
 *
 * Sun stays at center. Earth is placed. Moon is loose and must be
 * dropped near Earth. Once correct, Moon begins orbiting animation.
 */
export const EARTH_MOON_MISSION: Mission = {
  id: 'space.earth-moon',
  worldId: 'space',
  title: 'Trái Đất và Mặt Trăng',
  description: 'Hãy đặt Mặt Trăng gần Trái Đất nhé.',
  ageRange: [7, 10],
  difficulty: 'easy',
  instructions: [
    'Trái Đất đang ở quỹ đạo thứ 3.',
    'Mặt Trăng cần quay quanh Trái Đất.',
    'Hãy đặt Mặt Trăng gần Trái Đất.'
  ],
  slots: [
    { id: 'near-earth', x: 0.50, y: 0.30, radius: 0.07 }
  ],
  objects: [
    {
      id: 'moon',
      labelVi: 'Mặt Trăng',
      glyph: '🌙',
      color: '#dfe2e8',
      initialPosition: { x: 0.20, y: 0.85 },
      correctSlotId: 'near-earth'
    }
  ],
  factIdOnSuccess: 'space.earth_moon.relationship',
  wrongHint: 'Mặt Trăng cần ở gần Trái Đất hơn!',
  xpReward: 80
};

/**
 * Mission 3: Day and Night.
 *
 * Educational, less interactive. Sun + Earth. Earth rotates auto.
 * Child observes — the "interaction" is the rotation animation and a
 * "Tuyệt vời!" success state after a few seconds.
 *
 * Single drop slot triggers "completion" so the XP system still flows.
 */
export const DAY_NIGHT_MISSION: Mission = {
  id: 'space.day-night',
  worldId: 'space',
  title: 'Ngày và Đêm',
  description: 'Quan sát Trái Đất quay và khám phá ngày đêm.',
  ageRange: [7, 10],
  difficulty: 'easy',
  instructions: [
    'Trái Đất luôn tự quay quanh trục của mình.',
    'Mặt quay về phía Mặt Trời là ban ngày.',
    'Mặt quay ra phía sau là ban đêm.'
  ],
  slots: [
    { id: 'observe', x: 0.5, y: 0.55, radius: 0.10 }
  ],
  objects: [
    {
      id: 'observer',
      labelVi: 'Quan sát',
      glyph: '👀',
      color: '#9ad6ff',
      initialPosition: { x: 0.85, y: 0.92 },
      correctSlotId: 'observe'
    }
  ],
  factIdOnSuccess: 'space.day_night.basic',
  wrongHint: 'Hãy quan sát thêm nhé!',
  xpReward: 60
};
