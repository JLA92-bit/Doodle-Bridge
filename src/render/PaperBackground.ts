import type Phaser from 'phaser';
import { DESK, PAPER } from '../config/world';
import { mulberry32 } from '../endless/SeededRandom';
import { RENDER_SCALE } from './scale';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Lined notebook paper with faint fibres, baked once into a texture. */
export function createPaperTexture(scene: Phaser.Scene, key: string, width: number, height: number): void {
  if (scene.textures.exists(key)) return;
  const s = RENDER_SCALE;
  const tex = scene.textures.createCanvas(key, width * s, height * s);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(s, s);
  ctx.fillStyle = hex(PAPER.colour);
  ctx.fillRect(0, 0, width, height);

  const rand = mulberry32(1234);
  for (let i = 0; i < (width * height) / 90; i++) {
    const shade = 200 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${shade - 30}, ${shade - 40}, ${shade - 70}, ${0.05 + rand() * 0.08})`;
    ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 2, 1);
  }

  ctx.strokeStyle = hex(PAPER.lineColour);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  for (let y = PAPER.firstLineY; y < height; y += PAPER.lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = hex(PAPER.marginColour);
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAPER.marginX, 0);
  ctx.lineTo(PAPER.marginX, height);
  ctx.stroke();
  ctx.globalAlpha = 1;
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

/** The notebook page (lined paper) on the desk. */
export function addPaper(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Image {
  addDesk(scene, width, height);
  const key = `paper-${width}x${height}`;
  createPaperTexture(scene, key, width, height);
  return scene.add.image(0, 0, key).setOrigin(0).setScale(1 / RENDER_SCALE).setDepth(-100);
}
