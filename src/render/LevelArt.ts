import type Phaser from 'phaser';
import { COLOURS } from '../config/ui';
import { PAPER_THEMES, type PaperTheme } from '../config/theme';
import type { LevelData } from '../game/Level';
import { boilImage, css, INK, PENCIL, roughTextures, type Box } from './RoughRenderer';

const DEFAULT_THEME = PAPER_THEMES.lined;

function boundsOf(points: [number, number][]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The static drawing of a level (terrain shaded with pencil hatching and the flag),
 * baked into boiling textures. Returns the image so the scene can layer it.
 */
export function addLevelArt(scene: Phaser.Scene, level: LevelData, theme: PaperTheme = DEFAULT_THEME): Phaser.GameObjects.Image {
  const pencil = { ...PENCIL, stroke: theme.ink };
  const f = level.flag;
  const poleX = f.x + f.w / 2;
  const groundY = f.y + f.h;
  const all: [number, number][] = [
    ...level.terrain.flatMap((t) => t.points),
    [poleX - 4, groundY - 76],
    [poleX + 40, groundY],
  ];
  const box = boundsOf(all);
  // Key by content, so an edited level (editor test runs) never reuses stale art.
  const keys = roughTextures(scene, `level-${level.id}-${hash(JSON.stringify([level.terrain, level.flag, theme.ink, theme.terrainFill]))}`, box, (rc, ctx, seed) => {
    for (const t of level.terrain) {
      // Solid paper-grey underlay, then pencil hatching and a sketchy outline.
      ctx.beginPath();
      t.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = css(theme.terrainFill, 0.85);
      ctx.fill();
      rc.polygon(t.points, {
        ...pencil,
        strokeWidth: 2.6,
        fill: theme.hatch,
        fillStyle: 'hachure',
        hachureGap: 7,
        hachureAngle: -41,
        fillWeight: 1.1,
        seed,
      });
    }
    // Flag: pole and a crayon-filled pennant.
    rc.line(poleX, groundY, poleX, groundY - 72, { ...pencil, strokeWidth: 3, seed });
    rc.polygon(
      [
        [poleX, groundY - 72],
        [poleX + 36, groundY - 61],
        [poleX, groundY - 50],
      ],
      { ...pencil, fill: css(COLOURS.danger), fillStyle: 'zigzag', hachureGap: 3.5, fillWeight: 2, seed: seed + 1 },
    );
    rc.circle(poleX, groundY - 74, 6, { ...pencil, fill: css(COLOURS.star), fillStyle: 'solid', seed: seed + 2 });
  });
  return boilImage(scene, keys, box).setDepth(1);
}

/** Nails as small boiling doodles, drawn above the lines they pin. */
export function addNails(
  scene: Phaser.Scene,
  nails: readonly { x: number; y: number }[],
  theme: PaperTheme = DEFAULT_THEME,
): Phaser.GameObjects.Image[] {
  const pencil = { ...PENCIL, stroke: theme.ink };
  const keys = roughTextures(scene, `nail-${theme.ink}`, { x: -9, y: -9, w: 18, h: 18 }, (rc, _ctx, seed) => {
    rc.circle(0, 0, 15, { ...pencil, fill: '#c9c4ba', fillStyle: 'solid', seed });
    rc.line(-3.5, -3.5, 3.5, 3.5, { ...pencil, strokeWidth: 1.8, seed: seed + 3 });
  });
  return nails.map((n) => boilImage(scene, keys, { x: n.x - 9, y: n.y - 9, w: 18, h: 18 }).setDepth(3));
}

/** A scribbled underline under a title. */
export function addScribbleUnderline(
  scene: Phaser.Scene,
  cx: number,
  y: number,
  width: number,
  colour: string = INK,
): Phaser.GameObjects.Image {
  const box = { x: cx - width / 2, y: y - 6, w: width, h: 12 };
  const keys = roughTextures(scene, `underline-${width}-${colour}`, box, (rc, _ctx, seed) => {
    rc.curve(
      [
        [box.x, y + 1],
        [box.x + width * 0.3, y - 2],
        [box.x + width * 0.7, y + 2],
        [box.x + width, y - 1],
      ],
      { stroke: colour, strokeWidth: 2, roughness: 1.4, seed },
    );
  });
  return boilImage(scene, keys, box).setDepth(10);
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
