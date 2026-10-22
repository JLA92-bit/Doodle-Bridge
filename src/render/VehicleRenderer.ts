import Phaser from 'phaser';
import type { VehicleConfig, VehicleId } from '../config/vehicles';
import { mulberry32 } from '../endless/SeededRandom';
import type { Point } from '../physics/geometry';
import type { SimStatus } from '../physics/Simulation';
import type { Vehicle } from '../physics/Vehicle';
import { RENDER_SCALE } from './scale';
import { drawWheelArt, VEHICLE_ART, type VehicleArt } from './vehicleArt';

/** Vehicle textures are painted at this many pixels per game unit, so they stay sharp when scaled. */
const ART_SCALE = RENDER_SCALE * 2;
const OUTLINE = 0x1c1c21;

/** A piece of a burst vehicle flying off. */
interface Piece {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r0: number;
  r1: number;
  age: number;
  life: number;
  colour: number;
  alpha: number;
}

/**
 * Draws a vehicle as polished cartoon art: painted body and wheel textures that follow
 * the physics, plus live parts (suspension, rider limbs, flame), squash on landing,
 * an idling engine rumble, exhaust and wheel dust.
 */
export class VehicleRenderer {
  private readonly fxG: Phaser.GameObjects.Graphics;
  private readonly backG: Phaser.GameObjects.Graphics;
  private readonly frontG: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Image | null = null;
  private wheels: Phaser.GameObjects.Image[] = [];
  private currentId: VehicleId | null = null;
  private puffs: Puff[] = [];
  private squash = 0;
  private squashVel = 0;
  private pieces: Piece[] = [];
  private burst = false;
  private exhaustTimer = 0;
  private dustTimer = 0;
  private readonly rand = mulberry32(99);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth = 5,
  ) {
    this.fxG = scene.add.graphics().setDepth(depth - 1);
    this.backG = scene.add.graphics().setDepth(depth);
    this.frontG = scene.add.graphics().setDepth(depth + 4);
  }

  /** Clears transient effects and reassembles the vehicle, for example after Retry. */
  reset(): void {
    this.puffs = [];
    this.squash = 0;
    this.squashVel = 0;
    this.pieces.forEach((p) => p.img.destroy());
    this.pieces = [];
    this.burst = false;
    this.setVisible(true);
  }

  private setVisible(on: boolean): void {
    this.body?.setVisible(on);
    this.wheels.forEach((w) => w.setVisible(on));
    this.backG.setVisible(on);
    this.frontG.setVisible(on);
  }

  /** Landing squash, driven by impact speed. */
  onLand(impact: number): void {
    this.squashVel += Math.min(0.1, impact * 0.016);
  }

  /** A puff of exhaust out the back when a boost starts. */
  onBoost(vehicle: Vehicle): void {
    const art = VEHICLE_ART[vehicle.config.id];
    const c = vehicle.chassis;
    const rear = art.exhaust ?? { x: art.box.x0 + 4, y: 0 };
    const x = c.position.x + rear.x * Math.cos(c.angle) - rear.y * Math.sin(c.angle);
    const y = c.position.y + rear.x * Math.sin(c.angle) + rear.y * Math.cos(c.angle);
    for (let i = 0; i < 8; i++) {
      this.puffs.push({
        x, y, vx: -Math.cos(c.angle) * (1 + this.rand() * 2) + (this.rand() - 0.5), vy: (this.rand() - 0.7) * 1.5,
        r0: 3, r1: 9 + this.rand() * 4, age: 0, life: 500, colour: 0xe8e2d4, alpha: 0.7,
      });
    }
  }

  /** The vehicle bursts into pieces: the body splits in four and the wheels fly off. */
  explode(vehicle: Vehicle): void {
    if (this.burst || !this.body) return;
    this.burst = true;
    const c = vehicle.chassis;
    const tex = this.body.texture.getSourceImage() as HTMLCanvasElement;
    const hw = tex.width / 2;
    const hh = tex.height / 2;
    const quads: [number, number, number, number][] = [
      [0, 0, -1, -1],
      [hw, 0, 1, -1],
      [0, hh, -1, 1],
      [hw, hh, 1, 1],
    ];
    for (const [cx, cy, dx, dy] of quads) {
      const img = this.scene.add
        .image(c.position.x, c.position.y, this.body.texture.key)
        .setOrigin(this.body.originX, this.body.originY)
        .setRotation(c.angle)
        .setScale(1 / ART_SCALE)
        .setCrop(cx, cy, hw, hh)
        .setDepth(this.body.depth);
      this.pieces.push({ img, vx: dx * (1.5 + this.rand() * 2) + c.velocity.x * 0.5, vy: dy * 1.5 - 4 - this.rand() * 3, spin: dx * (0.05 + this.rand() * 0.1) });
    }
    vehicle.wheels.forEach((w, i) => {
      const img = this.scene.add.image(w.position.x, w.position.y, this.wheels[i]!.texture.key).setScale(1 / ART_SCALE).setDepth(this.depth + 2);
      this.pieces.push({ img, vx: (i === 0 ? -1 : 1) * (2 + this.rand() * 2), vy: -5 - this.rand() * 3, spin: (this.rand() - 0.5) * 0.6 });
    });
    this.setVisible(false);
  }

  private ensureSprites(config: VehicleConfig): VehicleArt {
    const art = VEHICLE_ART[config.id];
    if (this.currentId === config.id) return art;
    this.body?.destroy();
    this.wheels.forEach((w) => w.destroy());
    this.currentId = config.id;

    const keys = vehicleTextures(this.scene, config);
    const { x0, y0, x1, y1 } = art.box;
    this.body = this.scene.add
      .image(0, 0, keys.body)
      .setOrigin(-x0 / (x1 - x0), -y0 / (y1 - y0))
      .setDepth(this.depth + (art.bodyOverWheels ? 3 : 1));
    this.wheels = keys.wheels.map((key) =>
      this.scene.add.image(0, 0, key).setDepth(this.depth + 2).setScale(1 / ART_SCALE),
    );
    return art;
  }

  update(vehicle: Vehicle, status: SimStatus, time: number, deltaMs: number, boosting = false): void {
    const config = vehicle.config;
    const art = this.ensureSprites(config);
    const chassis = vehicle.chassis;
    const dt = Math.min(deltaMs, 50) / (1000 / 60);
    const running = status === 'running';

    if (this.burst) {
      for (const p of this.pieces) {
        p.vy += 0.35 * dt;
        p.img.x += p.vx * dt;
        p.img.y += p.vy * dt;
        p.img.rotation += p.spin * dt;
      }
      this.drawPuffs(deltaMs);
      return;
    }

    for (let i = 0; i < dt; i++) {
      this.squashVel += -this.squash * 0.25 - this.squashVel * 0.22;
      this.squash += this.squashVel;
    }
    // Engine idling while you draw: a tiny rumble.
    const rumble = status === 'drawing' && art.exhaust ? Math.sin(time / 28) * 0.25 : 0;
    const sx = 1 + this.squash * 0.5;
    const sy = 1 - this.squash;

    const cos = Math.cos(chassis.angle);
    const sin = Math.sin(chassis.angle);
    const lift = (this.squash * config.chassisHeight) / 2 + rumble;
    const px = chassis.position.x - sin * lift;
    const py = chassis.position.y + cos * lift;
    const toLocal = (p: Point): Point => {
      const dx = p.x - chassis.position.x;
      const dy = p.y - chassis.position.y;
      return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    };
    const toWorld = (p: Point): Point => ({
      x: chassis.position.x + p.x * cos - p.y * sin,
      y: chassis.position.y + p.x * sin + p.y * cos,
    });

    this.body!.setPosition(px, py).setRotation(chassis.angle).setScale(sx / ART_SCALE, sy / ART_SCALE);
    vehicle.wheels.forEach((w, i) => this.wheels[i]!.setPosition(w.position.x, w.position.y).setRotation(w.angle));

    for (const g of [this.backG, this.frontG]) {
      g.clear();
      g.setPosition(px, py).setRotation(chassis.angle).setScale(sx, sy);
    }
    this.drawLiveParts(
      config,
      vehicle.wheels.map((w) => toLocal(w.position)),
      vehicle.wheels.map((w) => w.angle - chassis.angle),
      time,
      running,
    );
    if (boosting) this.drawSpeedLines(art, time);

    // Effects: exhaust while the engine runs, dust from wheels touching the ground.
    this.exhaustTimer -= deltaMs;
    if (art.exhaust && status !== 'crashed' && status !== 'won' && this.exhaustTimer <= 0) {
      this.exhaustTimer = running ? 110 : 520;
      const p = toWorld(art.exhaust);
      const back = toWorld({ x: art.exhaust.x - 1, y: art.exhaust.y - 0.4 });
      this.puffs.push({
        x: p.x,
        y: p.y,
        vx: (back.x - p.x) * (running ? 0.9 : 0.4) + chassis.velocity.x * 0.3,
        vy: (back.y - p.y) * 0.9 - 0.25,
        r0: 2,
        r1: running ? 7 : 5,
        age: 0,
        life: running ? 520 : 800,
        colour: art.exhaustColour ?? 0xb9b4ab,
        alpha: 0.5,
      });
    }
    this.dustTimer -= deltaMs;
    if (running && this.dustTimer <= 0) {
      this.dustTimer = 70;
      vehicle.wheels.forEach((w, i) => {
        if (!vehicle.wheelContacts[i] || Math.abs(w.angularVelocity) < 0.08) return;
        const r = config.wheels[i]!.r;
        this.puffs.push({
          x: w.position.x - r * 0.4,
          y: w.position.y + r * 0.85,
          vx: -0.6 - this.rand() * 0.8,
          vy: -0.5 - this.rand() * 0.6,
          r0: 1.5,
          r1: 3.5 + this.rand() * 2,
          age: 0,
          life: 380,
          colour: 0xa89a80,
          alpha: 0.45,
        });
      });
    }
    this.drawPuffs(deltaMs);
  }

  /** Parts that move relative to the body, drawn in chassis-local space. */
  private drawLiveParts(config: VehicleConfig, wheels: Point[], wheelSpin: number[], t: number, running: boolean): void {
    const back = this.backG;
    const front = this.frontG;
    switch (config.id) {
      case 'skateboard':
        for (const w of wheels) {
          // Truck: baseplate, hanger down to the axle, orange bushing.
          back.fillStyle(0x9ca3ab, 1).lineStyle(1.2, OUTLINE, 1);
          back.fillRect(w.x - 6, 0.5, 12, 2).strokeRect(w.x - 6, 0.5, 12, 2);
          back.fillStyle(0xc3c9cf, 1);
          back.fillTriangle(w.x - 3, 2.5, w.x + 3, 2.5, w.x, w.y);
          back.strokeTriangle(w.x - 3, 2.5, w.x + 3, 2.5, w.x, w.y);
          back.fillStyle(0xff8a3d, 1).fillCircle(w.x, 3.2, 1.8).strokeCircle(w.x, 3.2, 1.8);
        }
        break;
      case 'monsterTruck':
        for (const w of wheels) {
          // Shock absorbers from the frame to each hub.
          const top = { x: w.x * 0.45, y: 5 };
          limb(back, top, w, 4.5, 0xd8433b);
          limb(back, top, { x: (top.x + w.x) / 2, y: (top.y + w.y) / 2 }, 2.6, 0xe6e9ed);
        }
        break;
      case 'unicycle': {
        const w = wheels[0]!;
        const a = wheelSpin[0]!;
        limb(front, { x: 0.5, y: 14 }, w, 2.6, 0xc9ced4);
        front.fillStyle(0x2a2a2f, 1).lineStyle(1.2, OUTLINE, 1);
        front.fillRoundedRect(-6, 12, 13, 3.5, 1.6).strokeRoundedRect(-6, 12, 13, 3.5, 1.6);
        const pedal = (k: number): Point => ({
          x: w.x + Math.cos(a + k * Math.PI) * 8,
          y: w.y + Math.sin(a + k * Math.PI) * 8,
        });
        const p1 = pedal(0);
        const p2 = pedal(1);
        limb(front, p1, p2, 2, 0x8d949d);
        for (const [hip, p] of [
          [-2, p1],
          [3, p2],
        ] as [number, Point][]) {
          const knee = { x: (hip + p.x) / 2 + 6, y: (11 + p.y) / 2 - 1 };
          limb(front, { x: hip, y: 10 }, knee, 4.2, 0x2d3140);
          limb(front, knee, p, 3.6, 0x2d3140);
          front.fillStyle(0xf2f2f2, 1).lineStyle(1.1, OUTLINE, 1);
          front.fillRoundedRect(p.x - 2.5, p.y - 2, 7, 3.6, 1.6).strokeRoundedRect(p.x - 2.5, p.y - 2, 7, 3.6, 1.6);
        }
        // Arms out for balance.
        const speed = running ? 140 : 400;
        for (const side of [-1, 1]) {
          const swing = Math.sin(t / speed + side) * 5;
          const elbow = { x: side * 12, y: -8 + swing * 0.4 };
          const hand = { x: side * 18, y: -12 + swing };
          limb(front, { x: side * 6, y: -11 }, elbow, 4.4, config.colour);
          limb(front, elbow, hand, 3.8, config.colour);
          front.fillStyle(0xffffff, 1).lineStyle(1.1, OUTLINE, 1);
          front.fillCircle(hand.x, hand.y, 2.4).strokeCircle(hand.x, hand.y, 2.4);
        }
        break;
      }
      case 'rocketCar': {
        if (!running) break;
        const at = VEHICLE_ART.rocketCar.flame!;
        const flicker = 0.75 + Math.abs(Math.sin(t / 37)) * 0.25 + Math.sin(t / 13) * 0.08;
        const len = 20 * flicker;
        back.fillStyle(0xff7a1a, 0.25).fillCircle(at.x - len * 0.4, at.y, 8);
        back.fillStyle(0xff8a2a, 0.95);
        back.fillTriangle(at.x, at.y - 6, at.x, at.y + 6, at.x - len, at.y + Math.sin(t / 21) * 1.5);
        back.fillStyle(0xffd84a, 1);
        back.fillTriangle(at.x, at.y - 3.5, at.x, at.y + 3.5, at.x - len * 0.6, at.y);
        back.fillStyle(0xffffff, 0.9);
        back.fillTriangle(at.x, at.y - 1.5, at.x, at.y + 1.5, at.x - len * 0.25, at.y);
        break;
      }
      default:
        break;
    }
  }

  /** Motion streaks behind the vehicle while boosting. */
  private drawSpeedLines(art: VehicleArt, t: number): void {
    const g = this.backG;
    const x0 = art.box.x0 - 4;
    const h = art.box.y1 - art.box.y0;
    for (let i = 0; i < 4; i++) {
      const y = art.box.y0 + h * (0.2 + i * 0.2);
      const len = 14 + ((t / 9 + i * 37) % 18);
      g.lineStyle(2, 0x3d3d44, 0.5);
      g.lineBetween(x0 - 4, y, x0 - 4 - len, y);
    }
  }

  private drawPuffs(deltaMs: number): void {
    const g = this.fxG;
    g.clear();
    const dt = Math.min(deltaMs, 50) / (1000 / 60);
    this.puffs = this.puffs.filter((p) => (p.age += deltaMs) < p.life);
    for (const p of this.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.97;
      const k = p.age / p.life;
      const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k);
      const a = p.alpha * (1 - k);
      g.fillStyle(p.colour, a);
      g.fillCircle(p.x, p.y, r);
      g.fillStyle(0xffffff, a * 0.5);
      g.fillCircle(p.x - r * 0.3, p.y - r * 0.3, r * 0.45);
    }
  }

  destroy(): void {
    this.pieces.forEach((p) => p.img.destroy());
    this.body?.destroy();
    this.wheels.forEach((w) => w.destroy());
    this.fxG.destroy();
    this.backG.destroy();
    this.frontG.destroy();
  }
}

/** Paints (once) and returns the texture keys for a vehicle's body and wheels. */
export function vehicleTextures(scene: Phaser.Scene, config: VehicleConfig): { body: string; wheels: string[] } {
  const art = VEHICLE_ART[config.id];
  const body = `vehicle-${config.id}`;
  const { x0, y0, x1, y1 } = art.box;
  paintTexture(scene, body, x1 - x0, y1 - y0, (ctx) => {
    ctx.translate(-x0, -y0);
    art.draw(ctx, config);
  });
  const wheels = config.wheels.map((w) => {
    const key = `wheel-${art.wheel}-${w.r}`;
    const size = w.r * 2 + 4;
    paintTexture(scene, key, size, size, (ctx) => {
      ctx.translate(size / 2, size / 2);
      drawWheelArt(ctx, art.wheel, w.r);
    });
    return key;
  });
  return { body, wheels };
}

/** A still picture of a vehicle (title screen, garage), centred on its chassis at (x, y). */
export function addVehiclePicture(
  scene: Phaser.Scene,
  config: VehicleConfig,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Container {
  const art = VEHICLE_ART[config.id];
  const keys = vehicleTextures(scene, config);
  const { x0, y0, x1, y1 } = art.box;
  const body = scene.add.image(0, 0, keys.body).setOrigin(-x0 / (x1 - x0), -y0 / (y1 - y0)).setScale(1 / ART_SCALE);
  const wheels = keys.wheels.map((k, i) =>
    scene.add.image(config.wheels[i]!.x, config.wheels[i]!.y, k).setScale(1 / ART_SCALE),
  );
  const parts = art.bodyOverWheels ? [...wheels, body] : [body, ...wheels];
  return scene.add.container(x, y, parts).setScale(scale);
}

/** A rounded, outlined bar between two points (limbs, struts). */
function limb(g: Phaser.GameObjects.Graphics, a: Point, b: Point, width: number, colour: number): void {
  g.lineStyle(width + 2, OUTLINE, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(a.x, a.y, width / 2 + 1);
  g.fillCircle(b.x, b.y, width / 2 + 1);
  g.lineStyle(width, colour, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.fillStyle(colour, 1);
  g.fillCircle(a.x, a.y, width / 2);
  g.fillCircle(b.x, b.y, width / 2);
}

/** Paints once into a canvas texture at ART_SCALE pixels per game unit. */
function paintTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.ceil(width * ART_SCALE), Math.ceil(height * ART_SCALE));
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(ART_SCALE, ART_SCALE);
  paint(ctx);
  tex.refresh();
}
