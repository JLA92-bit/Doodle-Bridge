import Phaser from 'phaser';
import { mulberry32 } from '../endless/SeededRandom';
import { settings } from '../game/Settings';
import type { Point } from '../physics/geometry';

interface Particle {
  kind: 'confetti' | 'puff' | 'fleck' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  colour: number;
  age: number;
  life: number;
  gravity: number;
  drag: number;
}

const CONFETTI = [0xe2574c, 0xf2c230, 0x3c8dde, 0x46b35a, 0x9a6ad6, 0xff9b3d, 0xffffff];

/** Lightweight particle effects drawn into one Graphics object. */
export class Effects {
  private readonly g: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private readonly rand = mulberry32(7);

  constructor(
    private readonly scene: Phaser.Scene,
    depth = 15,
  ) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  private r(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  /** Graphite puff and pencil flecks where a joint snapped. */
  snapPuff(at: Point): void {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        kind: 'puff', x: at.x, y: at.y, vx: this.r(-0.8, 0.8), vy: this.r(-0.9, 0.2), rot: 0, spin: 0,
        size: this.r(3, 6), colour: 0x6b6b72, age: 0, life: this.r(350, 600), gravity: -0.005, drag: 0.94,
      });
    }
    for (let i = 0; i < 7; i++) {
      this.particles.push({
        kind: 'fleck', x: at.x, y: at.y, vx: this.r(-2.4, 2.4), vy: this.r(-3, 0.5), rot: this.r(0, 6), spin: this.r(-0.3, 0.3),
        size: this.r(3, 6), colour: 0x3d3d44, age: 0, life: this.r(500, 900), gravity: 0.12, drag: 0.99,
      });
    }
  }

  /** Paper-scrap confetti bursting up from a point. */
  confetti(at: Point, count = 70): void {
    for (let i = 0; i < count; i++) {
      const a = this.r(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = this.r(3, 8.5);
      this.particles.push({
        kind: 'confetti', x: at.x + this.r(-10, 10), y: at.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        rot: this.r(0, 6), spin: this.r(-0.25, 0.25), size: this.r(4, 8),
        colour: CONFETTI[Math.floor(this.rand() * CONFETTI.length)]!, age: 0, life: this.r(1600, 2600), gravity: 0.11, drag: 0.975,
      });
    }
  }

  /** Smoke and sparks for a crash. */
  crashBurst(at: Point): void {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        kind: 'puff', x: at.x + this.r(-8, 8), y: at.y + this.r(-8, 8), vx: this.r(-1.6, 1.6), vy: this.r(-1.8, 0.4), rot: 0, spin: 0,
        size: this.r(6, 12), colour: 0x8a857c, age: 0, life: this.r(500, 900), gravity: -0.01, drag: 0.93,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = this.r(0, Math.PI * 2);
      const s = this.r(3, 7);
      this.particles.push({
        kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: a, spin: 0,
        size: this.r(5, 10), colour: i % 2 ? 0xf2c230 : 0xff7a1a, age: 0, life: this.r(250, 450), gravity: 0.05, drag: 0.9,
      });
    }
  }

  /** Small or medium screen shake, skipped with reduced motion. */
  shake(strength: 'small' | 'medium'): void {
    if (settings().reducedMotion) return;
    const cam = this.scene.cameras.main;
    if (strength === 'small') cam.shake(120, 0.004);
    else cam.shake(260, 0.012);
  }

  update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / (1000 / 60);
    const g = this.g;
    g.clear();
    this.particles = this.particles.filter((p) => (p.age += deltaMs) < p.life);
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt);
      p.vy *= Math.pow(p.drag, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      switch (p.kind) {
        case 'puff': {
          const r = p.size * (0.6 + k * 0.8);
          g.fillStyle(p.colour, 0.45 * (1 - k));
          g.fillCircle(p.x, p.y, r);
          break;
        }
        case 'fleck':
          g.lineStyle(1.6, p.colour, 1 - k);
          g.lineBetween(p.x, p.y, p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size);
          break;
        case 'spark':
          g.lineStyle(2.2, p.colour, 1 - k);
          g.lineBetween(p.x, p.y, p.x - p.vx * 1.6, p.y - p.vy * 1.6);
          break;
        case 'confetti': {
          // Paper scraps flutter: their width flips as they spin.
          const w = p.size * Math.abs(Math.cos(p.rot * 2));
          const h = p.size * 0.6;
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          const corner = (x: number, y: number) => ({ x: p.x + x * c - y * s, y: p.y + x * s + y * c });
          g.fillStyle(p.colour, k > 0.8 ? (1 - k) * 5 : 1);
          g.fillPoints([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)], true);
          break;
        }
      }
    }
  }

  clear(): void {
    this.particles = [];
    this.g.clear();
  }
}

/** Draws a 5-point star polygon. */
export function starPoints(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}
