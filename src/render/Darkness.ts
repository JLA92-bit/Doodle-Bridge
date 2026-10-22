import Phaser from 'phaser';
import { DARKNESS } from '../config/theme';

export interface Light {
  /** Position in world (page) pixels. */
  x: number;
  y: number;
  radius: number;
}

const LIGHT_SIZE = 128;

/**
 * A dark veil over the page with soft pools of light. It is one small low resolution
 * canvas texture: each frame it is filled and a baked radial gradient is cut out at every
 * light, so the cost does not depend on the page size. Meant to be shown by a static camera
 * (the UI camera), below the HUD, so the HUD is never darkened.
 */
export class Darkness {
  private readonly img: Phaser.GameObjects.Image;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly veil: string;
  private w = 0;
  private h = 0;

  constructor(
    scene: Phaser.Scene,
    strength: number,
    /** The camera that scrolls with the world (lights are placed relative to its view). */
    private readonly world: Phaser.Cameras.Scene2D.Camera,
    /** The static camera that shows the veil. */
    private readonly screen: Phaser.Cameras.Scene2D.Camera,
    depth: number,
  ) {
    // The soft light pool, baked once.
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = this.lightCanvas.height = LIGHT_SIZE;
    const lc = this.lightCanvas.getContext('2d')!;
    const r = LIGHT_SIZE / 2;
    const grad = lc.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.35, 'rgba(0,0,0,0.96)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.88, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = grad;
    lc.fillRect(0, 0, LIGHT_SIZE, LIGHT_SIZE);

    const c = DARKNESS.colour;
    this.veil = `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${Math.min(1, strength) * DARKNESS.maxAlpha})`;
    const key = `darkness-veil-${scene.sys.settings.key}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const view = screen.worldView;
    this.w = Math.max(8, Math.ceil(view.width * DARKNESS.resolution));
    this.h = Math.max(8, Math.ceil(view.height * DARKNESS.resolution));
    this.tex = scene.textures.createCanvas(key, this.w, this.h)!;
    this.ctx = this.tex.getContext();
    this.img = scene.add.image(0, 0, key).setOrigin(0).setDepth(depth);
  }

  /** The veil game object (so the scene can assign it to a camera). */
  get object(): Phaser.GameObjects.GameObject {
    return this.img;
  }

  private resize(): void {
    const view = this.screen.worldView;
    const w = Math.max(8, Math.ceil(view.width * DARKNESS.resolution));
    const h = Math.max(8, Math.ceil(view.height * DARKNESS.resolution));
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.tex.setSize(w, h);
    }
    this.img.setScale(view.width / this.w, view.height / this.h);
  }

  /** Redraws the veil with the given lights. */
  update(lights: readonly Light[]): void {
    this.resize();
    const sv = this.screen.worldView;
    const wv = this.world.worldView;
    this.img.setPosition(sv.x, sv.y);
    const k = DARKNESS.resolution;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.veil;
    ctx.fillRect(0, 0, this.w, this.h);
    // Light pools cut holes in the veil.
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const x = (l.x - wv.x) * k;
      const y = (l.y - wv.y) * k;
      const r = l.radius * k;
      if (x < -r || y < -r || x > this.w + r || y > this.h + r) continue;
      ctx.drawImage(this.lightCanvas, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.tex.refresh();
  }

  destroy(): void {
    this.img.destroy();
  }
}
