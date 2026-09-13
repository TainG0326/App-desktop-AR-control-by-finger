/**
 * Planet configuration data - extracted to its own file for cleaner imports.
 */

export interface PlanetConfig {
  id: string;
  nameVi: string;
  nameEn: string;
  baseColor: string;
  accentColor: string;
  roughness: number;
  metalness: number;
  hasAtmosphere?: boolean;
  atmosphereColor?: string;
  atmosphereThickness?: number;
  hasRings?: boolean;
  ringInnerRadius?: number;
  ringOuterRadius?: number;
  ringColor?: string;
  isEmissive?: boolean;
  emissiveColor?: string;
  emissiveIntensity?: number;
  textureUrl?: string;
  normalMapUrl?: string;
  bumpMapUrl?: string;
  hasClouds?: boolean;
  cloudUrl?: string;
  hasIceCaps?: boolean;
  hasGreatRedSpot?: boolean;
  orbitRadius?: number;
  orbitSpeed?: number;
}

export const PLANET_CONFIGS: Record<string, PlanetConfig> = {
  sun: {
    id: 'sun',
    nameVi: 'Mặt Trời',
    nameEn: 'Sun',
    baseColor: '#fdb813',
    accentColor: '#ff6b00',
    roughness: 1,
    metalness: 0,
    isEmissive: true,
    emissiveColor: '#ffaa00',
    emissiveIntensity: 2.5
  },
  mercury: {
    id: 'mercury',
    nameVi: 'Sao Thủy',
    nameEn: 'Mercury',
    baseColor: '#8c7853',
    accentColor: '#5a4a35',
    roughness: 0.95,
    metalness: 0.1,
    hasIceCaps: true,
    orbitRadius: 0.18,
    orbitSpeed: 0.008
  },
  venus: {
    id: 'venus',
    nameVi: 'Sao Kim',
    nameEn: 'Venus',
    baseColor: '#e8c48a',
    accentColor: '#d4a56a',
    roughness: 0.7,
    metalness: 0.0,
    hasAtmosphere: true,
    atmosphereColor: '#ffcc88',
    atmosphereThickness: 0.15,
    orbitRadius: 0.30,
    orbitSpeed: 0.006
  },
  earth: {
    id: 'earth',
    nameVi: 'Trái Đất',
    nameEn: 'Earth',
    baseColor: '#2f6a9d',
    accentColor: '#1a4a7a',
    roughness: 0.5,
    metalness: 0.1,
    hasAtmosphere: true,
    atmosphereColor: '#6aa3ff',
    atmosphereThickness: 0.08,
    hasClouds: true,
    hasIceCaps: true,
    orbitRadius: 0.45,
    orbitSpeed: 0.005
  },
  moon: {
    id: 'moon',
    nameVi: 'Mặt Trăng',
    nameEn: 'Moon',
    baseColor: '#d0d0d8',
    accentColor: '#a0a0a8',
    roughness: 0.9,
    metalness: 0.05,
    orbitRadius: 0.08,
    orbitSpeed: 0.02
  },
  mars: {
    id: 'mars',
    nameVi: 'Sao Hỏa',
    nameEn: 'Mars',
    baseColor: '#c1440e',
    accentColor: '#8a2808',
    roughness: 0.95,
    metalness: 0.0,
    hasAtmosphere: true,
    atmosphereColor: '#ff8866',
    atmosphereThickness: 0.03,
    hasIceCaps: true,
    orbitRadius: 0.58,
    orbitSpeed: 0.004
  },
  jupiter: {
    id: 'jupiter',
    nameVi: 'Sao Mộc',
    nameEn: 'Jupiter',
    baseColor: '#d8ca9d',
    accentColor: '#a89870',
    roughness: 0.7,
    metalness: 0.1,
    hasGreatRedSpot: true,
    orbitRadius: 0.74,
    orbitSpeed: 0.002
  },
  saturn: {
    id: 'saturn',
    nameVi: 'Sao Thổ',
    nameEn: 'Saturn',
    baseColor: '#fad5a5',
    accentColor: '#d0a070',
    roughness: 0.7,
    metalness: 0.1,
    hasAtmosphere: true,
    atmosphereColor: '#ffe8c8',
    atmosphereThickness: 0.06,
    hasRings: true,
    ringInnerRadius: 1.4,
    ringOuterRadius: 2.3,
    ringColor: '#e8d8b8',
    orbitRadius: 0.88,
    orbitSpeed: 0.0015
  },
  uranus: {
    id: 'uranus',
    nameVi: 'Sao Thiên Vương',
    nameEn: 'Uranus',
    baseColor: '#4fd0e7',
    accentColor: '#30a0c0',
    roughness: 0.5,
    metalness: 0.3,
    hasAtmosphere: true,
    atmosphereColor: '#80e8ff',
    atmosphereThickness: 0.05,
    orbitRadius: 0.92,
    orbitSpeed: 0.001
  },
  neptune: {
    id: 'neptune',
    nameVi: 'Sao Hải Vương',
    nameEn: 'Neptune',
    baseColor: '#4b70dd',
    accentColor: '#3050a8',
    roughness: 0.5,
    metalness: 0.3,
    hasAtmosphere: true,
    atmosphereColor: '#7090f0',
    atmosphereThickness: 0.05,
    orbitRadius: 0.96,
    orbitSpeed: 0.0008
  }
};