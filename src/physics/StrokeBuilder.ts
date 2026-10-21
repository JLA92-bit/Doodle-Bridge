import { DRAWING } from '../config/drawing';
import { dist, lerpPoint, polylineLength, type Point } from './geometry';

/**
 * Adds a raw finger sample if it is far enough from the previous one.
 * Returns true when the sample was kept.
 */
export function addSample(points: Point[], p: Point, spacing = DRAWING.sampleSpacing): boolean {
  const last = points[points.length - 1];
  if (last && dist(last, p) < spacing) return false;
  points.push({ x: p.x, y: p.y });
  return true;
}

/** Ramer-Douglas-Peucker simplification. */
export function simplify(points: readonly Point[], epsilon = DRAWING.simplifyEpsilon): Point[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = points[start]!;
    const b = points[end]!;
    let maxD = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegment(points[i]!, a, b);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index !== -1 && maxD > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Returns the point at a given distance along a polyline. */
export function pointAtLength(points: readonly Point[], target: number): Point {
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (travelled + d >= target) return lerpPoint(a, b, d === 0 ? 0 : (target - travelled) / d);
    travelled += d;
  }
  return { ...points[points.length - 1]! };
}

/**
 * Cuts a polyline into evenly spaced joints so every segment is between
 * minSegment and maxSegment long (except a stroke shorter than minSegment, which is one segment).
 */
export function resample(
  points: readonly Point[],
  target = DRAWING.targetSegment,
  min = DRAWING.minSegment,
  max = DRAWING.maxSegment,
): Point[] {
  const length = polylineLength(points);
  if (points.length < 2 || length === 0) return points.map((p) => ({ ...p }));
  let n = Math.max(1, Math.round(length / target));
  while (n > 1 && length / n < min) n--;
  while (length / n > max) n++;
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(pointAtLength(points, (length * i) / n));
  return out;
}

/** Trims a polyline so its length does not exceed maxLength. */
export function clipToLength(points: readonly Point[], maxLength: number): Point[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const out: Point[] = [{ ...points[0]! }];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (travelled + d >= maxLength) {
      out.push(lerpPoint(a, b, d === 0 ? 0 : (maxLength - travelled) / d));
      return out;
    }
    out.push({ ...b });
    travelled += d;
  }
  return out;
}

export interface BuiltStroke {
  points: Point[];
  startAnchor: number | null;
  endAnchor: number | null;
  length: number;
}

/**
 * Turns raw finger samples into physics-ready joints: smooths, snaps the ends
 * onto nearby nails, then resamples into even segments.
 */
export function buildStroke(raw: readonly Point[], anchors: readonly Point[]): BuiltStroke | null {
  if (raw.length < 2 || polylineLength(raw) < DRAWING.minStrokeLength) return null;
  const smooth = simplify(raw);
  const startAnchor = nearestAnchor(smooth[0]!, anchors);
  const endAnchor = nearestAnchor(smooth[smooth.length - 1]!, anchors);
  if (startAnchor !== null) smooth[0] = { ...anchors[startAnchor]! };
  if (endAnchor !== null && endAnchor !== startAnchor) smooth[smooth.length - 1] = { ...anchors[endAnchor]! };
  const points = resample(smooth);
  if (points.length < 2) return null;
  return {
    points,
    startAnchor,
    endAnchor: endAnchor === startAnchor ? null : endAnchor,
    length: polylineLength(points),
  };
}

export function nearestAnchor(p: Point, anchors: readonly Point[], radius = DRAWING.anchorSnapRadius): number | null {
  let best: number | null = null;
  let bestD = radius;
  anchors.forEach((a, i) => {
    const d = dist(a, p);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
