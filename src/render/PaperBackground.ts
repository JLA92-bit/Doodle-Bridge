import type Phaser from 'phaser';
import { PAPER } from '../config/world';
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

export function addPaper(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Image {
  const key = `paper-${width}x${height}`;
  createPaperTexture(scene, key, width, height);
  return scene.add.image(0, 0, key).setOrigin(0).setScale(1 / RENDER_SCALE).setDepth(-100);
}
