import type { PaperStyle } from '../config/notebooks';
import type { PenId } from '../config/pens';
import type { VehicleId } from '../config/vehicles';
import { isConvex, toPoint, type Point, type PointTuple } from '../physics/geometry';

/** An axis-aligned rectangle in world pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A platform that slides back and forth: it starts at `points` and moves by `move`
 * and back again every `periodMs` (smooth, sine-eased). Vehicles ride on it.
 */
export interface PlatformDef {
  /** Convex polygon at its starting position. */
  points: PointTuple[];
  /** Offset [dx, dy] to the far end of its travel. */
  move: PointTuple;
  /** Time for a full there-and-back trip. */
  periodMs: number;
  /** Starting point in the cycle, 0 to 1 (default 0). */
  phase?: number;
  /** Nails fixed to the platform (world positions at the start); strokes pinned here move with it. */
  nails?: PointTuple[];
}

/** A gust zone: pushes the vehicle and drawn lines inside it with a steady acceleration. */
export interface WindZone extends Rect {
  /** Acceleration [ax, ay] in px per step squared (try 0.02 to 0.12). Positive x blows right. */
  force: PointTuple;
}

/** Level JSON as stored in /src/levels. All coordinates are in game pixels (480 wide). */
export interface LevelData {
  id: string;
  name: string;
  notebook: number;
  index: number;
  /** World size; defaults to one screen. */
  width?: number;
  height?: number;
  /** Convex polygons, listed as [x, y] pairs. Split concave shapes into several pieces. */
  terrain: { points: PointTuple[] }[];
  /** Nail positions that pin stroke ends. */
  anchors: PointTuple[];
  /** Ground point the vehicle starts on (its wheels rest just above this). */
  start: PointTuple;
  /** Win zone: the front wheel must enter this rectangle. */
  flag: { x: number; y: number; w: number; h: number };
  /** Ink allowance in px of stroke length (before the pen multiplier). */
  ink: number;
  stars: { ink: number; timeMs: number };
  /** One short line shown before the first try (no tutorial walls). */
  tip?: string;
  vehicle?: VehicleId;
  pen?: PenId;
  hint?: PointTuple[][];
  /** Moving platforms (Notebook 3 onwards). */
  platforms?: PlatformDef[];
  /** Wind zones (Notebook 3 onwards). */
  wind?: WindZone[];
  /** Eraser zones: any part of a drawn line that enters one is rubbed out (Notebook 5 onwards). */
  erasers?: Rect[];
  /** 0 to 1: how dark the page is outside a pool of light around the vehicle (Notebook 5). Visual only. */
  darkness?: number;
  /** Long levels: a ground point. After passing it, a crash retries from here with the same drawing. */
  checkpoint?: PointTuple;
  /** Timed levels: the run fails ("Out of time") if the flag is not reached in time (Notebook 6). */
  timeLimitMs?: number;
  /** Paper style; defaults to the notebook's paper. */
  paper?: PaperStyle;
  /** Known solution used by the automated solver test. */
  solution: { strokes: PointTuple[][]; boosts?: number[] };
}

export function levelSize(level: LevelData): { width: number; height: number } {
  return { width: level.width ?? 480, height: level.height ?? 854 };
}

export function terrainPolygons(level: LevelData): Point[][] {
  return level.terrain.map((t) => t.points.map(toPoint));
}

export function anchorPoints(level: LevelData): Point[] {
  return level.anchors.map(toPoint);
}

/** Returns a list of problems with a level; empty means valid. */
export function validateLevel(level: LevelData): string[] {
  const errors: string[] = [];
  if (!level.id) errors.push('missing id');
  if (!(level.ink > 0)) errors.push('ink must be positive');
  level.terrain.forEach((t, i) => {
    if (!isConvex(t.points.map(toPoint))) errors.push(`terrain[${i}] is not convex`);
  });
  if (!level.solution?.strokes?.length) errors.push('missing solution stroke');
  level.platforms?.forEach((p, i) => {
    if (!isConvex(p.points.map(toPoint))) errors.push(`platforms[${i}] is not convex`);
    if (!(p.periodMs > 0)) errors.push(`platforms[${i}] needs a positive periodMs`);
  });
  const rects: [string, Rect[] | undefined][] = [['wind', level.wind], ['erasers', level.erasers]];
  for (const [name, list] of rects) {
    list?.forEach((r, i) => {
      if (!(r.w > 0 && r.h > 0)) errors.push(`${name}[${i}] needs a positive size`);
    });
  }
  const { width } = levelSize(level);
  if (level.checkpoint && !(level.checkpoint[0] > level.start[0] && level.checkpoint[0] < level.flag.x)) {
    errors.push('checkpoint must lie between start and flag');
  }
  if (level.timeLimitMs !== undefined && !(level.timeLimitMs > 0)) errors.push('timeLimitMs must be positive');
  if (level.flag.x + level.flag.w > width) errors.push('flag lies outside the level width');
  if (level.notebook >= 1 && level.id !== `nb${level.notebook}-${String(level.index).padStart(2, '0')}`) {
    errors.push('id does not match notebook and index');
  }
  return errors;
}
