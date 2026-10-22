/** Tuning for endless and daily mode: ink, streaming distances, difficulty tiers and chunk shapes. */
import type { ChunkType } from '../endless/types';

export const ENDLESS = {
  /** Written into replays so old ones can be told apart after physics changes. */
  gameVersion: '0.7.0',
  /** Ink at the start (before the pen's multiplier), refill per second, and per ink pot. */
  ink: 600,
  inkRefillPerSec: 8,
  inkPotRefill: 150,
  /** The chassis must pass within this distance (px) of a pot to collect it. */
  inkPotRadius: 30,
  /** The world always extends this far (px) ahead of the vehicle ... */
  aheadPx: 1200,
  /** ... and things further than this behind it are removed. */
  behindPx: 720,
  /** Stall time (ms) before a no-progress crash; shorter than campaign since nobody waits at a gap edge. */
  stallMs: 2000,
  /** The chassis position is sampled into the trail every this many steps. */
  trailEvery: 6,
  /** Airborne at least this long (ms) before a landing counts as an "air" event. */
  airMs: 500,
  /** Strokes whose segments all fell below this y are dropped (debris off the page). */
  debrisY: 1200,
  /** Cleanup of far-away strokes runs every this many steps. */
  cullEvery: 20,
  /** Where the vehicle starts (x) and the ground height of the runway. */
  startX: 120,
  runwayY: 600,
  /** Length of the first, flat chunk: time for the player to start drawing. */
  runwayLength: 1100,
};

export const DIFFICULTY = {
  /** The course gets harder every this many metres. */
  tierMetres: 250,
  /** Gap width multiplier: 1 + perTier * tier, up to max. */
  gapScalePerTier: 0.1,
  gapScaleMax: 1.6,
  /** Chance that a gap edge gets a nail: 1 - perTier * tier, never below min (keeps it fair). */
  anchorChancePerTier: 0.1,
  anchorChanceMin: 0.5,
  /** Vehicle speed multiplier: 1 + perTier * tier, capped. */
  speedPerTier: 0.08,
  speedMax: 1.8,
  /** Chunk types that join the mix at each tier (tier 0 first); earlier ones stay. */
  typesByTier: [
    ['flat', 'gap'],
    ['doubleGap', 'rampGap'],
    ['pitIsland'],
    ['platform'],
    ['wind'],
    ['eraser'],
  ] as ChunkType[][],
  /** Relative chance of each chunk type among those allowed. */
  weights: {
    flat: 1, gap: 3, doubleGap: 2, rampGap: 2, pitIsland: 2, platform: 2, wind: 2, eraser: 2,
  } as Record<ChunkType, number>,
};

/** Shapes of the generated course (all lengths in world px, y grows downwards). */
export const CHUNK = {
  /** Ground y stays inside this range so it fits the 854-tall page. */
  minY: 420,
  maxY: 680,
  bottomY: 854,
  /** Flat approach before a gap, multiplied by the difficulty speed so reaction time stays similar. */
  leadMin: 230,
  leadRange: 90,
  /** Flat landing after the last gap of a chunk. */
  runOutMin: 130,
  runOutRange: 80,
  /** Single gap width before scaling (px), and the hard limit for one drawn span. */
  gapMin: 90,
  gapRange: 60,
  maxSpan: 200,
  /**
   * Widest gap when only one edge has a nail (the line's other end just rests on the ground) and when
   * neither does. Measured with the headless physics: lines pinned at both ends are reliable, free ends slide.
   */
  maxOneNailSpan: 70,
  maxFreeSpan: 40,
  /** With a missing nail the far side must be nearly level (a line resting on sloped ground slides). */
  looseSlope: 8,
  /** A gap's far side may be this much higher (negative y) or lower than its near side. */
  uphillMax: 8,
  downhillMax: 24,
  /** Expected ink for a straight bridge = span length times this (sag allowance). */
  inkSlack: 1.1,
  /** Chance of an ink pot above each gap, and its height above the bridge line. */
  potChance: 0.9,
  potHeight: 30,
  /** Gentle hills in plain flat chunks. */
  flatPieces: 2,
  flatPieceMin: 130,
  flatPieceRange: 80,
  flatSlope: 18,
  /** Double gap: each gap's share of the normal width, and the island length. */
  doubleGapShare: 0.8,
  islandMin: 150,
  islandRange: 40,
  /** Pit with a pillar island: spans are wider than a normal gap, the pillar is short. */
  pitShare: 1.05,
  pillarMin: 80,
  pillarRange: 30,
  /** Ramp: length, height range and how far below the lip the landing is. */
  rampLength: 90,
  rampHeightMin: 34,
  rampHeightRange: 20,
  rampLandMax: 40,
  /** Moving platform: width, thickness, vertical travel, cycle time and the spans either side. */
  platformWidth: 90,
  platformThickness: 18,
  platformTravel: 32,
  platformPeriodMin: 3200,
  platformPeriodRange: 1200,
  platformSpanMin: 85,
  platformSpanRange: 35,
  /** Wind: gust strength range (px per step squared), gap share and the zone margin around the gap. */
  windMin: 0.015,
  windRange: 0.02,
  windGapShare: 0.9,
  windMargin: 120,
  windAbove: 340,
  windBelow: 110,
  /** Eraser: spans either side of a floating nail, the nail height, and the eraser zone size. */
  eraserSpanMin: 100,
  eraserSpanRange: 25,
  floatingNailHeight: 24,
  eraserWidth: 44,
  eraserTop: 6,
  eraserHeight: 104,
};
