import type Phaser from 'phaser';
import rough from 'roughjs';
import { settings } from '../game/Settings';
import type { Point } from '../physics/geometry';
import { RENDER_SCALE } from './scale';

/** Hand-drawn outlines "boil": each drawing has a few versions shown in turn at 12 fps. */
export const BOIL_FRAMES = 3;
export const BOIL_MS = 1000 / 12;

export type RoughCanvas = ReturnType<typeof rough.canvas>;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shared pencil and crayon styles. */
export const INK = '#3d3d44';
export const PENCIL = { stroke: INK, strokeWidth: 2.2, roughness: 1.1, bowing: 0.9 } as const;

/**
 * Paints BOIL_FRAMES versions of a drawing into canvas textures with roughjs. Each frame
 * gets a different seed so the wobble changes. `box` is the area (game units) the
 * drawing covers; a little padding stops rough overshoot being clipped.
 */
export function roughTextures(
  scene: Phaser.Scene,
  key: string,
  box: Box,
  draw: (rc: RoughCanvas, ctx: CanvasRenderingContext2D, seed: number) => void,
  pad = 6,
): string[] {
  const keys: string[] = [];
  for (let f = 0; f < BOIL_FRAMES; f++) {
    const k = `${key}#${f}`;
    keys.push(k);
    if (scene.textures.exists(k)) continue;
    const s = RENDER_SCALE;
    const tex = scene.textures.createCanvas(k, Math.ceil((box.w + pad * 2) * s), Math.ceil((box.h + pad * 2) * s));
    if (!tex) continue;
    const ctx = tex.getContext();
    ctx.scale(s, s);
    ctx.translate(pad - box.x, pad - box.y);
    draw(rough.canvas(tex.getCanvas()), ctx, 1 + f * 7919);
    tex.refresh();
  }
  return keys;
}

const boiling = new WeakMap<Phaser.Scene, Set<{ img: Phaser.GameObjects.Image; keys: string[] }>>();

/**
 * Adds an image showing a rough drawing at its box position, flipping between
 * its boil frames at 12 fps (unless reduced motion is on).
 */
export function boilImage(scene: Phaser.Scene, keys: string[], box: Box, pad = 6): Phaser.GameObjects.Image {
  const img = scene.add
    .image(box.x - pad, box.y - pad, keys[0]!)
    .setOrigin(0)
    .setScale(1 / RENDER_SCALE);
  registerBoil(scene, img, keys);
  return img;
}

/** Makes an existing image cycle through boil frames. */
export function registerBoil(scene: Phaser.Scene, img: Phaser.GameObjects.Image, keys: string[]): void {
  let set = boiling.get(scene);
  if (!set) {
    const items = new Set<{ img: Phaser.GameObjects.Image; keys: string[] }>();
    set = items;
    boiling.set(scene, items);
    let frame = 0;
    const timer = scene.time.addEvent({
      delay: BOIL_MS,
      loop: true,
      callback: () => {
        if (settings().reducedMotion) return;
        frame = (frame + 1) % BOIL_FRAMES;
        for (const it of items) {
          if (!it.img.active) items.delete(it);
          else it.img.setTexture(it.keys[frame % it.keys.length]!);
        }
      },
    });
    scene.events.once('shutdown', () => {
      timer.remove();
      boiling.delete(scene);
    });
  }
  set.add({ img, keys });
}

/** Current boil frame for things drawn per frame (pencil lines), so they wobble in step. */
export function boilFrame(time: number): number {
  return settings().reducedMotion ? 0 : Math.floor(time / BOIL_MS) % BOIL_FRAMES;
}

export const tuples = (pts: readonly Point[]): [number, number][] => pts.map((p) => [p.x, p.y]);

/** SVG path for a rounded rectangle, for roughjs. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  return (
    `M${x + k},${y} L${x + w - k},${y} Q${x + w},${y} ${x + w},${y + k} ` +
    `L${x + w},${y + h - k} Q${x + w},${y + h} ${x + w - k},${y + h} ` +
    `L${x + k},${y + h} Q${x},${y + h} ${x},${y + h - k} ` +
    `L${x},${y + k} Q${x},${y} ${x + k},${y} Z`
  );
}

export function starPath(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

export const css = (hex: number, alpha = 1): string =>
  `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;
