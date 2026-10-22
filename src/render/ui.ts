import type Phaser from 'phaser';
import { COLOURS, FONT_TITLE, FONT_UI } from '../config/ui';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/world';
import type { PaperStyle } from '../config/notebooks';
import { addPaper } from './PaperBackground';
import { boilImage, css, PENCIL, registerBoil, roughTextures, roundedRectPath, starPath, type Box } from './RoughRenderer';
import { RENDER_SCALE, setupCamera } from './scale';

const FADE_MS = 140;

/** Camera, desk and page for a screen, with a quick fade in. */
export function setupScreen(scene: Phaser.Scene, paper: boolean | PaperStyle = true, focusX?: () => number): void {
  setupCamera(scene, focusX);
  if (paper) addPaper(scene, GAME_WIDTH, GAME_HEIGHT, paper === true ? 'lined' : paper);
  scene.cameras.cameras.forEach((c) => c.fadeIn(FADE_MS, 139, 107, 82));
}

/** Fades out, then starts another scene. */
export function goTo(scene: Phaser.Scene, key: string, data?: object): void {
  const cam = scene.cameras.main;
  if (scene.registry.get('navigating')) return;
  scene.registry.set('navigating', true);
  scene.cameras.cameras.forEach((c) => c.fadeOut(FADE_MS, 139, 107, 82));
  cam.once('camerafadeoutcomplete', () => {
    scene.registry.set('navigating', false);
    scene.scene.start(key, data);
  });
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  opts: { title?: boolean; colour?: string; origin?: number } = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: opts.title ? FONT_TITLE : FONT_UI,
      fontSize: `${size}px`,
      color: opts.colour ?? '#3d3d44',
      align: 'center',
    })
    .setOrigin(opts.origin ?? 0.5)
    .setResolution(RENDER_SCALE);
}

/** A sketchy paper panel (rounded rectangle) behind content. */
export function addPanel(scene: Phaser.Scene, box: Box, fill = 0xfbf7ea, hatch?: number): Phaser.GameObjects.Image {
  const keys = roughTextures(scene, `panel-${box.w}x${box.h}-${fill}-${hatch ?? 0}`, { x: 0, y: 0, w: box.w, h: box.h }, (rc, ctx, seed) => {
    const outline = roundedRectPath(0, 0, box.w, box.h, 16);
    ctx.fillStyle = css(fill);
    ctx.fill(new Path2D(outline));
    rc.path(outline, {
      ...PENCIL,
      strokeWidth: 2.8,
      ...(hatch !== undefined ? { fill: css(hatch, 0.35), fillStyle: 'hachure', hachureGap: 8, hachureAngle: -40 } : {}),
      seed,
    });
  });
  const img = scene.add.image(box.x - 6, box.y - 6, keys[0]!).setOrigin(0).setScale(1 / RENDER_SCALE);
  registerBoil(scene, img, keys);
  return img;
}

/** Star textures (earned gold, or empty outline) at a given radius. */
export function starKeys(scene: Phaser.Scene, on: boolean, r: number): string[] {
  const size = r * 2 + 4;
  return roughTextures(scene, `star-${on ? 'on' : 'off'}-${r}`, { x: -size / 2, y: -size / 2, w: size, h: size }, (rc, ctx, seed) => {
    const pts = starPath(0, 0, r);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = on ? css(COLOURS.star) : 'rgba(255,255,255,0.7)';
    ctx.fill();
    rc.polygon(pts, {
      ...PENCIL,
      stroke: on ? '#3d3d44' : '#8a8790',
      strokeWidth: Math.max(1.4, r / 11),
      fill: on ? 'rgba(214,150,20,0.8)' : undefined,
      fillStyle: 'hachure',
      hachureGap: Math.max(2.5, r / 7),
      seed,
    });
  });
}

/** A boiling star image centred at (x, y). */
export function addStar(scene: Phaser.Scene, x: number, y: number, on: boolean, r: number): Phaser.GameObjects.Image {
  const keys = starKeys(scene, on, r);
  const img = scene.add.image(x, y, keys[0]!).setScale(1 / RENDER_SCALE);
  registerBoil(scene, img, keys);
  return img;
}

/** A small doodled padlock centred at (x, y). */
export function addLock(scene: Phaser.Scene, x: number, y: number, size = 22): Phaser.GameObjects.Image {
  const s = size;
  const box = { x: x - s / 2, y: y - s * 0.6, w: s, h: s * 1.15 };
  const keys = roughTextures(scene, `lock-${s}`, { x: -s / 2, y: -s * 0.6, w: s, h: s * 1.15 }, (rc, _ctx, seed) => {
    rc.arc(0, -s * 0.05, s * 0.6, s * 0.75, Math.PI, Math.PI * 2, false, { ...PENCIL, strokeWidth: 2.4, seed });
    rc.rectangle(-s / 2, -s * 0.05, s, s * 0.6, { ...PENCIL, fill: css(0xf2c230), fillStyle: 'solid', seed: seed + 1 });
    rc.circle(0, s * 0.22, s * 0.16, { ...PENCIL, strokeWidth: 1.6, fill: '#3d3d44', fillStyle: 'solid', seed: seed + 2 });
  });
  return boilImage(scene, keys, box);
}
