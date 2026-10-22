import type { PaperStyle } from './notebooks';

/** Colours for one paper style: the page itself plus the pencil-and-text colours drawn on top of it. */
export interface PaperTheme {
  /** Page base colour. */
  base: number;
  /** Ruled or grid line colour. */
  line: number;
  /** Margin line colour (lined styles only). */
  margin: number;
  /** HUD text colour (CSS). */
  text: string;
  /** Pencil outline colour for level art and HUD frames (CSS). */
  ink: string;
  /** Fill under terrain. */
  terrainFill: number;
  /** Terrain hatching colour (CSS). */
  hatch: string;
  /** Replaces a dark pen colour so lines stay readable on dark paper (null keeps the pen colour). */
  pencil: number | null;
  /** True for dark pages (lights, glows and pale lines). */
  dark: boolean;
}

export const PAPER_THEMES: Record<PaperStyle, PaperTheme> = {
  lined: {
    base: 0xfbf7ea, line: 0x9cc3e6, margin: 0xe58a8a, text: '#3d3d44', ink: '#3d3d44',
    terrainFill: 0xe3dccb, hatch: 'rgba(70,70,80,0.5)', pencil: null, dark: false,
  },
  graph: {
    base: 0xf2e4be, line: 0xc9a86e, margin: 0xc9a86e, text: '#3d3d44', ink: '#3d3d44',
    terrainFill: 0xe6d3a6, hatch: 'rgba(90,70,50,0.5)', pencil: null, dark: false,
  },
  wet: {
    base: 0xf1f3ee, line: 0x9cbbd8, margin: 0xd99a9a, text: '#3a4047', ink: '#3d3d44',
    terrainFill: 0xdde0d6, hatch: 'rgba(60,70,85,0.5)', pencil: null, dark: false,
  },
  sketch: {
    base: 0xf0e4c8, line: 0xd8c9a6, margin: 0xd8c9a6, text: '#3d3d44', ink: '#3d3d44',
    terrainFill: 0xe0d2b2, hatch: 'rgba(80,65,50,0.5)', pencil: null, dark: false,
  },
  night: {
    base: 0x1c2447, line: 0x5967a3, margin: 0x9a5a86, text: '#e9ebf7', ink: '#d9dcee',
    terrainFill: 0x2f3a68, hatch: 'rgba(200,208,240,0.45)', pencil: 0xeceaf5, dark: true,
  },
  scraps: {
    base: 0xf4eedd, line: 0x9cc3e6, margin: 0xe58a8a, text: '#3d3d44', ink: '#3d3d44',
    terrainFill: 0xe3dccb, hatch: 'rgba(70,70,80,0.5)', pencil: null, dark: false,
  },
};

/** Sideways scrolling on levels wider than the screen. */
export const PAN = {
  /** Speed while an edge arrow is held, in page px per second. */
  arrowSpeed: 460,
  /** Camera follow smoothing while running (higher is snappier). */
  followRate: 5,
  /** The camera looks this far ahead of the vehicle. */
  lookAhead: 70,
  /** Smoothing when gliding back to the start after a retry. */
  glideRate: 7,
};

/** Light pools on dark levels. */
export const DARKNESS = {
  vehicleRadius: 140,
  fingerRadius: 105,
  nailRadius: 38,
  flagRadius: 70,
  /** The darkness texture is drawn at this fraction of full resolution (soft light needs no more). */
  resolution: 0.4,
  /** Overlay colour. */
  colour: 0x070a1c,
  /** Maximum overlay alpha at darkness 1. */
  maxAlpha: 0.97,
};

/** Wind zone look. */
export const WIND = {
  /** Gust lines per 10000 px2 of zone area (capped). */
  density: 1.1,
  maxLines: 18,
  /** Page px per second of drift at force 0.1. */
  speedAt01: 190,
  colour: 0x5f8fc2,
  colourDark: 0xb7c7ee,
  scrapColours: [0xf2c230, 0xe2574c, 0x3c8dde, 0xffffff],
};

/** Seconds left at which a countdown turns red and pulses. */
export const TIMER_WARN_MS = 3000;
