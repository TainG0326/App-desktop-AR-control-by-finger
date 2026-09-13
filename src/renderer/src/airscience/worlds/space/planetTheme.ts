/**
 * PlanetTheme — shared color theming for all 3D planet explorers.
 * Each theme defines CSS variable values that are applied as inline style
 * on the root `.explorer` div, making the guide modal and header
 * use colors matching each celestial body.
 */

export interface PlanetTheme {
  /** CSS var value: primary button/accent color */
  primary: string;
  /** CSS var value: primary as "r,g,b" for rgba() usage */
  primaryRgb: string;
  /** CSS var value: secondary gradient color */
  secondary: string;
  /** CSS var value: light/accent text color */
  accent: string;
  /** CSS var value: glow / shadow color */
  glow: string;
  /** CSS var value: subtle background fill */
  soft: string;
  /** Display name in uppercase */
  name: string;
  /** Emoji glyph */
  glyph: string;
}

export const PLANET_THEMES: Record<string, PlanetTheme> = {
  sun: {
    primary: '#ff8c00',
    primaryRgb: '255, 140, 0',
    secondary: '#ffb347',
    accent: '#ffd580',
    glow: 'rgba(255, 140, 0, 0.5)',
    soft: 'rgba(255, 140, 0, 0.18)',
    name: 'MẶT TRỜI',
    glyph: '☀️'
  },
  earth: {
    primary: '#3b82f6',
    primaryRgb: '59, 130, 246',
    secondary: '#60a5fa',
    accent: '#93c5fd',
    glow: 'rgba(59, 130, 246, 0.45)',
    soft: 'rgba(59, 130, 246, 0.18)',
    name: 'TRÁI ĐẤT',
    glyph: '🌍'
  },
  mercury: {
    primary: '#a89070',
    primaryRgb: '168, 144, 112',
    secondary: '#c8b090',
    accent: '#d8ccb8',
    glow: 'rgba(168, 144, 112, 0.45)',
    soft: 'rgba(168, 144, 112, 0.18)',
    name: 'SAO THỦY',
    glyph: '☿'
  },
  venus: {
    primary: '#d4a56a',
    primaryRgb: '212, 165, 106',
    secondary: '#e8c48a',
    accent: '#f0d8a8',
    glow: 'rgba(212, 165, 106, 0.45)',
    soft: 'rgba(212, 165, 106, 0.18)',
    name: 'SAO KIM',
    glyph: '♀'
  },
  moon: {
    primary: '#a0a0a8',
    primaryRgb: '160, 160, 168',
    secondary: '#c8c8d0',
    accent: '#d8d8e0',
    glow: 'rgba(160, 160, 168, 0.45)',
    soft: 'rgba(160, 160, 168, 0.18)',
    name: 'MẶT TRĂNG',
    glyph: '🌙'
  },
  mars: {
    primary: '#c1440e',
    primaryRgb: '193, 68, 14',
    secondary: '#e05020',
    accent: '#ff8060',
    glow: 'rgba(193, 68, 14, 0.45)',
    soft: 'rgba(193, 68, 14, 0.18)',
    name: 'SAO HỎA',
    glyph: '♂'
  },
  jupiter: {
    primary: '#d8ca9d',
    primaryRgb: '216, 202, 157',
    secondary: '#e8daa8',
    accent: '#f0e8c0',
    glow: 'rgba(216, 202, 157, 0.45)',
    soft: 'rgba(216, 202, 157, 0.18)',
    name: 'SAO MỘC',
    glyph: '♃'
  },
  saturn: {
    primary: '#d0a070',
    primaryRgb: '208, 160, 112',
    secondary: '#e8c090',
    accent: '#f0d0a8',
    glow: 'rgba(208, 160, 112, 0.45)',
    soft: 'rgba(208, 160, 112, 0.18)',
    name: 'SAO THỔ',
    glyph: '♄'
  },
  uranus: {
    primary: '#4fd0e7',
    primaryRgb: '79, 208, 231',
    secondary: '#70e0f8',
    accent: '#a0f0ff',
    glow: 'rgba(79, 208, 231, 0.45)',
    soft: 'rgba(79, 208, 231, 0.18)',
    name: 'SAO THIÊN VƯƠNG',
    glyph: '♅'
  },
  neptune: {
    primary: '#4b70dd',
    primaryRgb: '75, 112, 221',
    secondary: '#6090f0',
    accent: '#90b0ff',
    glow: 'rgba(75, 112, 221, 0.45)',
    soft: 'rgba(75, 112, 221, 0.18)',
    name: 'SAO HẢI VƯƠNG',
    glyph: '♆'
  }
};

/** Convert a PlanetTheme to CSS inline style object for the root explorer div */
export function themeToStyle(theme: PlanetTheme): Record<string, string> {
  return {
    '--planet-primary': theme.primary,
    '--planet-primary-rgb': theme.primaryRgb,
    '--planet-secondary': theme.secondary,
    '--planet-accent': theme.accent,
    '--planet-glow': theme.glow,
    '--planet-soft': theme.soft,
    '--planet-name': theme.name,
    '--planet-glyph': theme.glyph
  };
}
