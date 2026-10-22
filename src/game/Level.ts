import type { PenId } from '../config/pens';
import type { VehicleId } from '../config/vehicles';
import { isConvex, toPoint, type Point, type PointTuple } from '../physics/geometry';

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
  if (level.notebook >= 1 && level.id !== `nb${level.notebook}-${String(level.index).padStart(2, '0')}`) {
    errors.push('id does not match notebook and index');
  }
  return errors;
}
