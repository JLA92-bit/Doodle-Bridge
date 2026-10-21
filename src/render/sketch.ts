import type Phaser from 'phaser';
import { mulberry32 } from '../endless/SeededRandom';
import type { Point } from '../physics/geometry';

/** Points around a rounded rectangle (centre-based), clockwise from the top-left. */
export function roundedRectPoints(cx: number, cy: number, w: number, h: number, r: number, perCorner = 4): Point[] {
  const rr = Math.min(r, w / 2, h / 2);
  const corners: [number, number, number][] = [
    [cx + w / 2 - rr, cy - h / 2 + rr, -Math.PI / 2],
    [cx + w / 2 - rr, cy + h / 2 - rr, 0],
    [cx - w / 2 + rr, cy + h / 2 - rr, Math.PI / 2],
    [cx - w / 2 + rr, cy - h / 2 + rr, Math.PI],
  ];
  const out: Point[] = [];
  for (const [x, y, start] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      out.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
  }
  return out;
}

export function circlePoints(cx: number, cy: number, r: number, n = 18, wobble = 0, phase = 0): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(a * 3 + phase));
    out.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return out;
}

/** Arc points from angle a0 to a1. */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n = 8): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export interface SketchStyle {
  width: number;
  colour: number;
  alpha?: number;
  /** Max random offset of each point, in px. */
  jitter?: number;
  /** Second, fainter pass like a pencil going over a line twice. */
  doublePass?: boolean;
  closed?: boolean;
}

/**
 * Strokes a path with small random offsets, so it looks hand drawn. The seed
 * changes a few times a second to make outlines "boil" like a flipbook.
 */
export function sketch(g: Phaser.GameObjects.Graphics, pts: readonly Point[], style: SketchStyle, seed: number): void {
  if (pts.length < 2) return;
  const rand = mulberry32(seed);
  const j = style.jitter ?? 0.6;
  const wobble = (p: Point): Point => ({ x: p.x + (rand() - 0.5) * 2 * j, y: p.y + (rand() - 0.5) * 2 * j });
  const pass = (width: number, alpha: number) => {
    const w = pts.map(wobble);
    g.lineStyle(width, style.colour, alpha);
    g.beginPath();
    g.moveTo(w[0]!.x, w[0]!.y);
    for (let i = 1; i < w.length; i++) g.lineTo(w[i]!.x, w[i]!.y);
    if (style.closed) g.closePath();
    g.strokePath();
  };
  pass(style.width, style.alpha ?? 1);
  if (style.doublePass) pass(Math.max(1, style.width * 0.45), (style.alpha ?? 1) * 0.45);
}

/** Fill a shape cleanly, then sketch its outline. */
export function sketchShape(
  g: Phaser.GameObjects.Graphics,
  pts: readonly Point[],
  fill: number,
  outline: SketchStyle,
  seed: number,
  fillAlpha = 1,
): void {
  g.fillStyle(fill, fillAlpha);
  g.fillPoints(pts as Point[], true);
  sketch(g, pts, { ...outline, closed: true }, seed);
}

/** Diagonal pencil hatching clipped roughly to a rectangle (local coordinates). */
export function hatch(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
  colour: number,
  alpha: number,
): void {
  g.lineStyle(1.2, colour, alpha);
  for (let d = -h; d < w; d += spacing) {
    const x0 = x + Math.max(d, 0);
    const y0 = y + h - Math.max(0, -d);
    const len = Math.min(w - Math.max(d, 0), h - Math.max(0, -d));
    if (len <= 0) continue;
    g.lineBetween(x0, y0, x0 + len, y0 - len);
  }
}
