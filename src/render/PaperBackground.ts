import type Phaser from 'phaser';
import type { PaperStyle } from '../config/notebooks';
import { PAPER_THEMES, type PaperTheme } from '../config/theme';
import { DESK, PAPER } from '../config/world';
import { mulberry32 } from '../endless/SeededRandom';
import { RENDER_SCALE } from './scale';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type Ctx = CanvasRenderingContext2D;

/** Faint paper fibres scattered over a region. */
function fibres(ctx: Ctx, w: number, h: number, rand: () => number, density = 90, tone = [30, 40, 70], alpha = 0.08): void {
  for (let i = 0; i < (w * h) / density; i++) {
    const shade = 200 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${shade - tone[0]!}, ${shade - tone[1]!}, ${shade - tone[2]!}, ${0.05 + rand() * alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1);
  }
}

/** Horizontal ruled lines, plus an optional red margin line. */
function ruled(ctx: Ctx, w: number, h: number, theme: PaperTheme, margin: boolean): void {
  ctx.strokeStyle = hex(theme.line);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  for (let y = PAPER.firstLineY; y < h; y += PAPER.lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  if (margin) {
    ctx.strokeStyle = hex(theme.margin);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAPER.marginX, 0);
    ctx.lineTo(PAPER.marginX, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Paints one paper style into the region (0, 0, w, h) of the current transform. */
function paintPaper(ctx: Ctx, style: PaperStyle, w: number, h: number, seed: number, first: boolean, depth = 0): void {
  const theme = PAPER_THEMES[style];
  const rand = mulberry32(seed);
  ctx.fillStyle = hex(theme.base);
  ctx.fillRect(0, 0, w, h);
  switch (style) {
    case 'lined':
      fibres(ctx, w, h, rand);
      ruled(ctx, w, h, theme, first);
      break;
    case 'graph': {
      fibres(ctx, w, h, rand, 90, [40, 60, 90], 0.1);
      const step = 24;
      for (let i = 0; i * step <= Math.max(w, h); i++) {
        const major = i % 5 === 0;
        ctx.strokeStyle = hex(theme.line);
        ctx.globalAlpha = major ? 0.6 : 0.32;
        ctx.lineWidth = major ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(i * step + 0.5, 0);
        ctx.lineTo(i * step + 0.5, h);
        ctx.moveTo(0, i * step + 0.5);
        ctx.lineTo(w, i * step + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'wet': {
      fibres(ctx, w, h, rand);
      ruled(ctx, w, h, theme, first);
      // Blue ink smudges: soft blots that bled into the page.
      const blots = Math.max(2, Math.round((w * h) / 60000));
      for (let i = 0; i < blots; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 28 + rand() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const a = 0.1 + rand() * 0.08;
        g.addColorStop(0, `rgba(60,90,170,${a})`);
        g.addColorStop(0.6, `rgba(70,100,175,${a * 0.5})`);
        g.addColorStop(1, 'rgba(70,100,175,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Water rings: a darker rim with a faintly bleached middle.
      const rings = Math.max(1, Math.round((w * h) / 130000));
      for (let i = 0; i < rings; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 36 + rand() * 40;
        ctx.fillStyle = 'rgba(120,150,190,0.05)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,115,160,0.14)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r, rand() * 6, rand() * 6 + 5.2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,115,160,0.1)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r - 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Tiny ink droplets.
      for (let i = 0; i < w / 30; i++) {
        ctx.fillStyle = `rgba(50,80,160,${0.08 + rand() * 0.12})`;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, 0.8 + rand() * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sketch': {
      // Thick cream sketchbook paper: visible grain, no lines.
      fibres(ctx, w, h, rand, 18, [70, 90, 130], 0.2);
      ctx.lineWidth = 1;
      for (let i = 0; i < (w * h) / 700; i++) {
        ctx.strokeStyle = `rgba(110,90,60,${0.06 + rand() * 0.08})`;
        const x = rand() * w;
        const y = rand() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 + rand() * 7, y + (rand() - 0.5) * 3);
        ctx.stroke();
      }
      break;
    }
    case 'night': {
      fibres(ctx, w, h, rand, 160, [-30, -20, 0], 0.05);
      ruled(ctx, w, h, theme, first);
      for (let i = 0; i < (w * h) / 5000; i++) {
        ctx.fillStyle = `rgba(210,220,255,${0.05 + rand() * 0.12})`;
        ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
      }
      break;
    }
    case 'scraps':
      if (depth === 0) paintScraps(ctx, w, h, rand);
      break;
  }
}

const SCRAP_TINTS = ['rgba(255,235,160,0.09)', 'rgba(170,200,240,0.08)', 'rgba(255,190,190,0.07)', 'rgba(190,230,190,0.07)', 'rgba(0,0,0,0.04)'];
const SCRAP_STYLES: PaperStyle[] = ['lined', 'graph', 'sketch', 'wet', 'lined', 'graph'];

/** A patchwork of torn paper pieces in the other styles, each a little rotated with a soft shadow. */
function paintScraps(ctx: Ctx, w: number, h: number, rand: () => number): void {
  ctx.fillStyle = hex(0xe4dcc4);
  ctx.fillRect(0, 0, w, h);
  const cols = Math.max(2, Math.round(w / 150));
  const rows = Math.max(3, Math.round(h / 200));
  const cw = w / cols;
  const rh = h / rows;
  const order: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([c, r]);
  order.sort(() => rand() - 0.5);
  for (const [c, r] of order) {
    const pw = cw + 40 + rand() * 24;
    const ph = rh + 40 + rand() * 24;
    const cx = (c + 0.5) * cw + (rand() - 0.5) * 16;
    const cy = (r + 0.5) * rh + (rand() - 0.5) * 16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rand() - 0.5) * 0.12);
    ctx.beginPath();
    tornRect(ctx, pw, ph, rand);
    ctx.shadowColor = 'rgba(40,30,20,0.35)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.translate(-pw / 2, -ph / 2);
    const style = SCRAP_STYLES[Math.floor(rand() * SCRAP_STYLES.length)]!;
    paintPaper(ctx, style, pw, ph, Math.floor(rand() * 1e6), rand() < 0.5, 1);
    // A faint tint per scrap so the pieces read as different papers.
    ctx.fillStyle = SCRAP_TINTS[Math.floor(rand() * SCRAP_TINTS.length)]!;
    ctx.fillRect(0, 0, pw, ph);
    ctx.restore();
  }
}

/** Path of a rectangle (centred on the origin) with ragged torn edges. */
function tornRect(ctx: Ctx, w: number, h: number, rand: () => number): void {
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + (rand() - 0.5) * 5, y0 + (y1 - y0) * t + (rand() - 0.5) * 5]);
    }
  };
  edge(-w / 2, -h / 2, w / 2, -h / 2);
  edge(w / 2, -h / 2, w / 2, h / 2);
  edge(w / 2, h / 2, -w / 2, h / 2);
  edge(-w / 2, h / 2, -w / 2, -h / 2);
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Bakes one page segment of a paper style into a texture. `first` segments carry the margin line. */
function createPaperTexture(scene: Phaser.Scene, key: string, style: PaperStyle, width: number, height: number, seed: number, first: boolean): void {
  if (scene.textures.exists(key)) return;
  const s = RENDER_SCALE;
  const tex = scene.textures.createCanvas(key, width * s, height * s);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(s, s);
  paintPaper(ctx, style, width, height, seed, first);
  tex.refresh();
}

/** The desk around the page: warm wood with faint grain, baked into a tile so it costs nothing per frame. */
function addDesk(scene: Phaser.Scene, width: number, height: number): void {
  const key = 'desk-tile';
  const size = 256;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, size, size);
    if (tex) {
      const ctx = tex.getContext();
      ctx.fillStyle = hex(DESK.colour);
      ctx.fillRect(0, 0, size, size);
      const rand = mulberry32(42);
      ctx.strokeStyle = hex(DESK.grain);
      for (let i = 0; i < 26; i++) {
        const y = rand() * size;
        ctx.globalAlpha = 0.2 + rand() * 0.25;
        ctx.lineWidth = 1 + rand() * 2;
        ctx.beginPath();
        // Lines wrap around so the tile repeats seamlessly.
        ctx.moveTo(-10, y);
        ctx.bezierCurveTo(size * 0.3, y + (rand() - 0.5) * 6, size * 0.7, y + (rand() - 0.5) * 6, size + 10, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      tex.refresh();
    }
  }
  const margin = 1600;
  scene.add
    .tileSprite(-margin, -margin, width + margin * 2, height + margin * 2, key)
    .setOrigin(0)
    .setDepth(-120);
  // Soft shadow along the page's right and bottom edges (thin strips, so almost no overdraw).
  const shadow = scene.add.graphics().setDepth(-110);
  for (let i = 1; i <= 4; i++) {
    shadow.fillStyle(0x000000, 0.07);
    shadow.fillRect(width, i, i + 1, height);
    shadow.fillRect(i, height, width, i + 1);
  }
}

/** Width of one baked page segment; wide levels are covered by several segments with different seeds. */
const SEGMENT_W = 480;

/** The notebook page (any paper style) on the desk. Wide levels get one baked segment per 480 px. */
export function addPaper(scene: Phaser.Scene, width: number, height: number, style: PaperStyle = 'lined'): Phaser.GameObjects.Image {
  addDesk(scene, width, height);
  let first: Phaser.GameObjects.Image | null = null;
  for (let x = 0, i = 0; x < width; x += SEGMENT_W, i++) {
    const w = Math.min(SEGMENT_W, width - x);
    // Segment 0 of the lined style keeps the original seed, so single-screen levels look as before.
    const variant = i % 3;
    const key = `paper-${style}-${w}x${height}-${variant}-${i === 0 ? 'a' : 'b'}`;
    createPaperTexture(scene, key, style, w, height, 1234 + variant * 101, i === 0);
    const img = scene.add.image(x, 0, key).setOrigin(0).setScale(1 / RENDER_SCALE).setDepth(-100);
    first ??= img;
  }
  return first!;
}
