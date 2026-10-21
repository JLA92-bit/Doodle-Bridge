import Phaser from 'phaser';
import type { VehicleId } from '../config/vehicles';
import { mulberry32 } from '../endless/SeededRandom';
import type { Point } from '../physics/geometry';
import type { SimStatus } from '../physics/Simulation';
import type { Vehicle } from '../physics/Vehicle';
import { arcPoints, circlePoints, hatch, roundedRectPoints, sketch, sketchShape, type SketchStyle } from './sketch';

const INK = 0x2b2b30;
const GLASS = 0xcde9f7;
const CHROME = 0xc9c6c0;
const TYRE = 0x3a3a40;
const LINE: SketchStyle = { width: 2.5, colour: INK, jitter: 0.45, doublePass: true };
const THIN: SketchStyle = { width: 1.6, colour: INK, jitter: 0.35 };
/** Outlines redraw with fresh wobble at 12 fps for a living-sketch "boil". */
const BOIL_MS = 1000 / 12;

export type Mood = 'idle' | 'driving' | 'scared' | 'happy' | 'dizzy';

interface Eye {
  x: number;
  y: number;
  r: number;
  /** Draw a little stalk down to this point (skateboard). */
  stalk?: Point;
}

interface WheelStyle {
  hub: number;
  hubScale: number;
  spokes: number;
  treads: number;
  chunky: boolean;
  /** Bicycle-style wheel: a thin tyre around a light rim of this size (fraction of radius). */
  rim?: number;
}

interface LookContext {
  g: Phaser.GameObjects.Graphics;
  seed: number;
  mood: Mood;
  t: number;
  colour: number;
  shade: number;
  /** Wheel centres in chassis-local coordinates (they move with the suspension). */
  wheels: Point[];
  wheelAngles: number[];
  /** Chassis velocity in local coordinates. */
  vel: Point;
  driving: boolean;
}

interface Look {
  eyes: Eye[];
  mouth?: { x: number; y: number; w: number };
  /** Local point where exhaust puffs appear. */
  exhaust?: Point;
  exhaustColour?: number;
  /** Local point of a rocket flame. */
  flame?: Point;
  wheel: WheelStyle;
  /** Draw the body over the wheels (rider legs, skateboard deck). */
  bodyOverWheels?: boolean;
  drawBody(ctx: LookContext): void;
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

/** Draws a vehicle as a hand-drawn doodle with googly eyes, moods, squash and stretch, exhaust and dust. */
export class VehicleRenderer {
  private readonly bodyG: Phaser.GameObjects.Graphics;
  private readonly wheelG: Phaser.GameObjects.Graphics;
  private readonly fxG: Phaser.GameObjects.Graphics;
  private puffs: Puff[] = [];
  private squash = 0;
  private squashVel = 0;
  private wasGrounded = true;
  private prevVy = 0;
  private nextBlink = 1500;
  private blinkUntil = 0;
  private exhaustTimer = 0;
  private dustTimer = 0;
  private readonly rand = mulberry32(99);

  constructor(scene: Phaser.Scene, depth = 5) {
    this.fxG = scene.add.graphics().setDepth(depth - 1);
    this.wheelG = scene.add.graphics().setDepth(depth + 1);
    this.bodyG = scene.add.graphics().setDepth(depth);
  }

  /** Clears transient effects, for example after Retry. */
  reset(): void {
    this.puffs = [];
    this.squash = 0;
    this.squashVel = 0;
    this.wasGrounded = true;
    this.prevVy = 0;
  }

  update(vehicle: Vehicle, status: SimStatus, time: number, deltaMs: number): void {
    const look = LOOKS[vehicle.config.id];
    const body = vehicle.chassis;
    const dt = Math.min(deltaMs, 50) / (1000 / 60);
    const seed = Math.floor(time / BOIL_MS);
    const running = status === 'running';

    // Mood from what the vehicle is doing.
    let mood: Mood = 'idle';
    if (status === 'won') mood = 'happy';
    else if (status === 'crashed') mood = 'dizzy';
    else if (running) mood = !vehicle.grounded && body.velocity.y > 4.5 ? 'scared' : 'driving';

    // Squash on landing: a little spring driven by the impact speed.
    const grounded = vehicle.grounded;
    if (running && grounded && !this.wasGrounded && this.prevVy > 2) {
      this.squashVel += Math.min(0.12, this.prevVy * 0.02);
    }
    this.wasGrounded = grounded;
    this.prevVy = body.velocity.y;
    for (let i = 0; i < dt; i++) {
      this.squashVel += -this.squash * 0.25 - this.squashVel * 0.22;
      this.squash += this.squashVel;
    }
    const breathe = status === 'drawing' ? Math.sin(time / 380) * 0.015 : 0;
    const sy = 1 - this.squash + breathe;
    const sx = 1 + this.squash * 0.6 - breathe * 0.5;

    // Local frame data for the look.
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);
    const toLocal = (p: Point): Point => {
      const dx = p.x - body.position.x;
      const dy = p.y - body.position.y;
      return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    };
    const toWorld = (p: Point): Point => ({
      x: body.position.x + p.x * cos - p.y * sin,
      y: body.position.y + p.x * sin + p.y * cos,
    });
    const vel = { x: body.velocity.x * cos + body.velocity.y * sin, y: -body.velocity.x * sin + body.velocity.y * cos };

    if (time > this.nextBlink) {
      this.blinkUntil = time + 120;
      this.nextBlink = time + 2200 + this.rand() * 3000;
    }

    // Body.
    const g = this.bodyG;
    g.clear();
    const lift = (this.squash * vehicle.config.chassisHeight) / 2;
    g.setPosition(body.position.x - sin * lift, body.position.y + cos * lift);
    g.setRotation(body.angle);
    g.setScale(sx, sy);
    g.setDepth(look.bodyOverWheels ? this.wheelG.depth + 1 : this.wheelG.depth - 1);
    const ctx: LookContext = {
      g,
      seed,
      mood,
      t: time,
      colour: vehicle.config.colour,
      shade: vehicle.config.shade,
      wheels: vehicle.wheels.map((w) => toLocal(w.position)),
      wheelAngles: vehicle.wheels.map((w) => w.angle),
      vel,
      driving: running,
    };
    look.drawBody(ctx);
    if (look.flame && running) drawFlame(g, look.flame, time);
    drawEyes(g, look.eyes, mood, vel, time < this.blinkUntil, seed, time);
    if (look.mouth) drawMouth(g, look.mouth, mood, seed);

    // Wheels in world space.
    const wg = this.wheelG;
    wg.clear();
    vehicle.wheels.forEach((w, i) => {
      drawWheel(wg, w.position, vehicle.config.wheels[i]!.r, w.angle, look.wheel, seed + i * 7);
    });

    // Effects: exhaust while the engine runs, dust from wheels touching the ground.
    this.exhaustTimer -= deltaMs;
    if (look.exhaust && status !== 'crashed' && this.exhaustTimer <= 0) {
      this.exhaustTimer = running ? 110 : 520;
      const p = toWorld(look.exhaust);
      const back = toWorld({ x: look.exhaust.x - 1, y: look.exhaust.y - 0.4 });
      this.puffs.push({
        x: p.x,
        y: p.y,
        vx: (back.x - p.x) * (running ? 0.9 : 0.4) + body.velocity.x * 0.3,
        vy: (back.y - p.y) * 0.9 - 0.25,
        r0: 2.5,
        r1: running ? 8 : 6,
        age: 0,
        life: running ? 520 : 800,
        colour: look.exhaustColour ?? 0xb9b4ab,
        alpha: 0.55,
      });
    }
    this.dustTimer -= deltaMs;
    if (running && this.dustTimer <= 0) {
      this.dustTimer = 70;
      vehicle.wheels.forEach((w, i) => {
        if (!vehicle.wheelContacts[i] || Math.abs(w.angularVelocity) < 0.08) return;
        const r = vehicle.config.wheels[i]!.r;
        this.puffs.push({
          x: w.position.x - r * 0.4,
          y: w.position.y + r * 0.85,
          vx: -0.6 - this.rand() * 0.8,
          vy: -0.5 - this.rand() * 0.6,
          r0: 1.5,
          r1: 4 + this.rand() * 2,
          age: 0,
          life: 380,
          colour: 0xa89a80,
          alpha: 0.5,
        });
      });
    }
    this.drawPuffs(deltaMs, seed);
  }

  private drawPuffs(deltaMs: number, seed: number): void {
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
      g.fillStyle(p.colour, a * 0.6);
      g.fillCircle(p.x, p.y, r);
      sketch(g, circlePoints(p.x, p.y, r, 9), { width: 1.2, colour: p.colour, alpha: a, jitter: 0.5, closed: true }, seed);
    }
  }

  destroy(): void {
    this.bodyG.destroy();
    this.wheelG.destroy();
    this.fxG.destroy();
  }
}

// ---------- shared parts ----------

function drawWheel(g: Phaser.GameObjects.Graphics, c: Point, r: number, angle: number, s: WheelStyle, seed: number): void {
  // The tyre is slightly lumpy and the lumps turn with the wheel, so it wobbles as it spins.
  const tyre = circlePoints(c.x, c.y, r, 22, 0.035, -angle * 3);
  sketchShape(g, tyre, TYRE, LINE, seed);
  for (let i = 0; i < s.treads; i++) {
    const a = angle + (i / s.treads) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (s.chunky) {
      g.lineStyle(4, INK, 1);
      g.lineBetween(c.x + ca * r * 0.9, c.y + sa * r * 0.9, c.x + ca * r * 1.1, c.y + sa * r * 1.1);
    } else {
      g.lineStyle(1.4, 0x6c6c74, 1);
      g.lineBetween(c.x + ca * r * 0.72, c.y + sa * r * 0.72, c.x + ca * r * 0.92, c.y + sa * r * 0.92);
    }
  }
  const hr = r * s.hubScale;
  if (s.rim) {
    sketchShape(g, circlePoints(c.x, c.y, r * s.rim, 18), 0xf3efe4, THIN, seed + 2);
    g.lineStyle(1.1, 0x6c6c74, 1);
    for (let i = 0; i < s.spokes; i++) {
      const a = angle + (i / s.spokes) * Math.PI * 2;
      g.lineBetween(c.x, c.y, c.x + Math.cos(a) * r * s.rim, c.y + Math.sin(a) * r * s.rim);
    }
  }
  sketchShape(g, circlePoints(c.x, c.y, hr, 14), s.hub, THIN, seed + 1);
  g.lineStyle(1.6, INK, 0.85);
  for (let i = 0; i < (s.rim ? 0 : s.spokes); i++) {
    const a = angle + (i / s.spokes) * Math.PI * 2;
    g.lineBetween(c.x, c.y, c.x + Math.cos(a) * hr * 0.85, c.y + Math.sin(a) * hr * 0.85);
  }
  g.fillStyle(INK, 1);
  g.fillCircle(c.x, c.y, Math.max(1.5, hr * 0.22));
  // Fixed highlight gives the tyre some roundness.
  g.lineStyle(1.5, 0xffffff, 0.35);
  g.beginPath();
  g.arc(c.x, c.y, r * 0.8, Math.PI * 1.1, Math.PI * 1.45);
  g.strokePath();
}

function drawEyes(
  g: Phaser.GameObjects.Graphics,
  eyes: readonly Eye[],
  mood: Mood,
  vel: Point,
  blinking: boolean,
  seed: number,
  t: number,
): void {
  eyes.forEach((e, i) => {
    if (e.stalk) sketch(g, [e.stalk, { x: e.x, y: e.y + e.r * 0.8 }], THIN, seed + 40 + i);
    const r = mood === 'scared' ? e.r * 1.2 : e.r;
    if (mood === 'happy') {
      sketch(g, arcPoints(e.x, e.y + r * 0.3, r * 0.7, Math.PI * 1.1, Math.PI * 1.9, 6), { ...LINE, width: 2.4 }, seed + i);
      g.fillStyle(0xff8fa3, 0.45);
      g.fillCircle(e.x + (i === 0 ? -r * 0.6 : r * 0.6), e.y + r * 1.3, r * 0.55);
      return;
    }
    sketchShape(g, circlePoints(e.x, e.y, r, 14), 0xffffff, { ...THIN, width: 1.8 }, seed + 20 + i);
    if (mood === 'dizzy') {
      const k = r * 0.5;
      g.lineStyle(1.8, INK, 1);
      g.lineBetween(e.x - k, e.y - k, e.x + k, e.y + k);
      g.lineBetween(e.x - k, e.y + k, e.x + k, e.y - k);
      return;
    }
    if (blinking && mood !== 'scared') {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(e.x, e.y, r);
      sketch(g, [{ x: e.x - r, y: e.y }, { x: e.x + r, y: e.y }], { ...THIN, width: 2 }, seed + i);
      return;
    }
    // Pupils look ahead while driving, lag behind sudden moves, and wobble when scared.
    const max = r * 0.45;
    const lookAhead = mood === 'driving' ? max * 0.5 : 0;
    const shake = mood === 'scared' ? Math.sin(t / 25 + i) * 0.8 : 0;
    const px = Phaser.Math.Clamp(lookAhead - vel.x * 0.5 + shake, -max, max);
    const py = Phaser.Math.Clamp(-vel.y * 0.5 + (mood === 'scared' ? -max * 0.5 : r * 0.12), -max, max);
    const pr = mood === 'scared' ? r * 0.3 : r * 0.45;
    g.fillStyle(0x1e1e22, 1);
    g.fillCircle(e.x + px, e.y + py, pr);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(e.x + px - pr * 0.35, e.y + py - pr * 0.35, pr * 0.3);
    if (mood === 'scared') {
      const dir = i === 0 ? 1 : -1;
      sketch(
        g,
        [
          { x: e.x - r * 0.8, y: e.y - r * 1.5 + dir * 2 },
          { x: e.x + r * 0.8, y: e.y - r * 1.5 - dir * 2 },
        ],
        { ...THIN, width: 2 },
        seed + 60 + i,
      );
    }
  });
  if (mood === 'scared' && eyes.length > 0) {
    const last = eyes[eyes.length - 1]!;
    const sx = last.x + last.r * 1.6;
    const sy = last.y - last.r * 0.6;
    g.fillStyle(0x8fd0ff, 0.9);
    g.fillTriangle(sx, sy - 4, sx - 2.5, sy + 1, sx + 2.5, sy + 1);
    g.fillCircle(sx, sy + 1.5, 2.6);
  }
}

function drawMouth(g: Phaser.GameObjects.Graphics, m: { x: number; y: number; w: number }, mood: Mood, seed: number): void {
  const h = m.w / 2;
  switch (mood) {
    case 'scared':
      sketchShape(g, circlePoints(m.x, m.y, m.w * 0.28, 10), 0x5a1f22, THIN, seed + 80);
      break;
    case 'happy': {
      const pts = arcPoints(m.x, m.y - 1, h * 0.9, 0, Math.PI, 8);
      sketchShape(g, pts, 0x5a1f22, THIN, seed + 80);
      g.fillStyle(0xff7d8e, 1);
      g.fillCircle(m.x, m.y + h * 0.45, h * 0.35);
      break;
    }
    case 'dizzy': {
      const pts: Point[] = [];
      for (let i = 0; i <= 8; i++) pts.push({ x: m.x - h + (i / 8) * m.w, y: m.y + Math.sin(i * 1.6) * 1.4 });
      sketch(g, pts, THIN, seed + 80);
      break;
    }
    default:
      sketch(g, arcPoints(m.x, m.y - h * 0.6, h, Math.PI * 0.2, Math.PI * 0.8, 6), { ...THIN, width: 1.8 }, seed + 80);
  }
}

function drawFlame(g: Phaser.GameObjects.Graphics, at: Point, t: number): void {
  const flicker = 0.75 + Math.abs(Math.sin(t / 37)) * 0.25 + Math.sin(t / 13) * 0.08;
  const len = 18 * flicker;
  g.fillStyle(0xff8a2a, 0.9);
  g.fillTriangle(at.x, at.y - 5, at.x, at.y + 5, at.x - len, at.y + Math.sin(t / 21) * 1.5);
  g.fillStyle(0xffd84a, 1);
  g.fillTriangle(at.x, at.y - 3, at.x, at.y + 3, at.x - len * 0.6, at.y);
}

function headlight(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, seed: number): void {
  g.fillStyle(0xfff3a0, 0.35);
  g.fillCircle(x + r * 0.6, y, r * 2);
  sketchShape(g, circlePoints(x, y, r, 10), 0xffe766, THIN, seed);
}

function star(cx: number, cy: number, r: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

// ---------- the six vehicles ----------

const LOOKS: Record<VehicleId, Look> = {
  paperCar: {
    eyes: [
      { x: -1, y: -27, r: 6 },
      { x: 10, y: -27, r: 6 },
    ],
    exhaust: { x: -33, y: 7 },
    wheel: { hub: 0xf2ede0, hubScale: 0.5, spokes: 4, treads: 8, chunky: false },
    bodyOverWheels: true,
    drawBody({ g, seed, colour, shade, vel, t, wheels }) {
      // Antenna sways with speed.
      const sway = Phaser.Math.Clamp(-vel.x * 0.12, -0.5, 0.5) + Math.sin(t / 260) * 0.08;
      const tip = { x: -15 + Math.sin(sway) * 16 - 3, y: -24 - Math.cos(sway) * 16 };
      sketch(g, [{ x: -15, y: -22 }, tip], THIN, seed + 3);
      g.fillStyle(0xf2c230, 1);
      g.fillCircle(tip.x, tip.y, 2.6);
      // Cabin.
      const cabin: Point[] = [
        { x: -22, y: -5 },
        { x: -17, y: -21 },
        { x: -13, y: -24 },
        { x: 5, y: -24 },
        { x: 9, y: -21 },
        { x: 18, y: -5 },
      ];
      sketchShape(g, cabin, colour, LINE, seed + 4);
      sketchShape(g, [{ x: -18, y: -7 }, { x: -14, y: -20 }, { x: -5, y: -20 }, { x: -5, y: -7 }], GLASS, THIN, seed + 5);
      sketchShape(g, [{ x: -1, y: -7 }, { x: -1, y: -20 }, { x: 6, y: -20 }, { x: 13, y: -7 }], GLASS, THIN, seed + 6);
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.lineBetween(1, -17, 4, -11);
      g.lineBetween(-15, -17, -13, -12);
      // Lower body.
      const lower = roundedRectPoints(0, 2, 64, 17, 7);
      sketchShape(g, lower, colour, LINE, seed + 7);
      hatch(g, -28, 4, 56, 5, 3.5, shade, 0.45);
      // Wheel wells: the body is drawn over the wheels, so cut dark arches where they tuck in.
      wheels.forEach((w, i) => {
        const well = arcPoints(w.x, 11, 13, Math.PI, Math.PI * 2, 10);
        g.fillStyle(0x5a2c28, 1);
        g.fillPoints(well, true);
        sketch(g, well, THIN, seed + 30 + i);
      });
      sketch(g, [{ x: -3, y: -5 }, { x: -3, y: 9 }], THIN, seed + 8);
      sketch(g, [{ x: -10, y: -1 }, { x: -6, y: -1 }], THIN, seed + 9);
      sketchShape(g, star(-17, 2, 4.5), 0xfff4c2, { ...THIN, width: 1.2 }, seed + 10);
      // Lights and bumpers.
      headlight(g, 31, 0, 2.6, seed + 11);
      sketchShape(g, roundedRectPoints(-31, -1, 4, 6, 1.5), 0x8e1f1a, THIN, seed + 12);
      sketchShape(g, roundedRectPoints(30, 8, 9, 4, 2), CHROME, THIN, seed + 13);
      sketchShape(g, roundedRectPoints(-31, 8, 8, 4, 2), CHROME, THIN, seed + 14);
    },
  },

  skateboard: {
    eyes: [
      { x: 16, y: -19, r: 5, stalk: { x: 16, y: -3 } },
      { x: 25, y: -17, r: 5, stalk: { x: 23, y: -3 } },
    ],
    wheel: { hub: 0xfff6d8, hubScale: 0.55, spokes: 0, treads: 0, chunky: false },
    bodyOverWheels: false,
    drawBody({ g, seed, colour, shade, wheels }) {
      // Trucks connect the deck to the (moving) wheels.
      for (const w of wheels) {
        sketchShape(g, [{ x: w.x - 6, y: 1 }, { x: w.x + 6, y: 1 }, { x: w.x + 2, y: w.y }, { x: w.x - 2, y: w.y }], CHROME, THIN, seed + 1);
      }
      const deck: Point[] = [
        { x: -34, y: -9 },
        { x: -29, y: -3 },
        { x: 29, y: -3 },
        { x: 34, y: -9 },
        { x: 35, y: -6 },
        { x: 30, y: 2 },
        { x: -30, y: 2 },
        { x: -35, y: -6 },
      ];
      sketchShape(g, deck, colour, LINE, seed + 2);
      g.lineStyle(2, INK, 0.75);
      g.lineBetween(-28, -3, 28, -3);
      // Flame stripes on the side of the deck.
      g.lineStyle(2, shade, 0.9);
      for (const x of [-18, -10, -2]) g.lineBetween(x, 1, x + 5, -2);
      sketchShape(g, star(8, -0.5, 3), 0xfff4c2, { ...THIN, width: 1 }, seed + 3);
    },
  },

  schoolBus: {
    eyes: [
      { x: 41, y: -13, r: 5.5 },
      { x: 50, y: -13, r: 5.5 },
    ],
    exhaust: { x: -57, y: 12 },
    wheel: { hub: 0xe7e2d6, hubScale: 0.5, spokes: 5, treads: 9, chunky: false },
    drawBody({ g, seed, colour, shade, wheels }) {
      const body = roundedRectPoints(0, -4, 114, 38, 9);
      sketchShape(g, body, colour, LINE, seed + 1);
      // Wheel arches.
      for (const w of wheels) {
        g.fillStyle(0x3b3326, 1);
        g.fillPoints(arcPoints(w.x, 15, 16, Math.PI, Math.PI * 2, 10), true);
      }
      hatch(g, -54, 6, 108, 8, 4, shade, 0.4);
      g.lineStyle(2, INK, 0.85);
      g.lineBetween(-56, 1, 56, 1);
      g.lineBetween(-56, 5, 56, 5);
      // Passenger windows.
      for (let i = 0; i < 5; i++) {
        const x = -47 + i * 14;
        sketchShape(g, roundedRectPoints(x + 5, -14, 11, 12, 2), GLASS, THIN, seed + 10 + i);
      }
      // Door, stop sign, windscreen.
      sketchShape(g, roundedRectPoints(28, -6, 10, 28, 2), GLASS, THIN, seed + 20);
      sketch(g, [{ x: 28, y: -20 }, { x: 28, y: 8 }], THIN, seed + 21);
      const octagon = circlePoints(16, -3, 5, 8).map((p) => p);
      sketchShape(g, octagon, 0xd8433b, THIN, seed + 22);
      sketchShape(g, [{ x: 35, y: -20 }, { x: 55, y: -20 }, { x: 55, y: -5 }, { x: 35, y: -5 }], GLASS, THIN, seed + 23);
      headlight(g, 55, 4, 3.4, seed + 24);
      sketchShape(g, roundedRectPoints(-56, -2, 3, 7, 1), 0x8e1f1a, THIN, seed + 25);
      sketchShape(g, roundedRectPoints(56, 12, 8, 4, 2), 0x3a3a40, THIN, seed + 26);
      sketchShape(g, roundedRectPoints(-56, 12, 8, 4, 2), 0x3a3a40, THIN, seed + 27);
    },
  },

  monsterTruck: {
    eyes: [
      { x: 1, y: -16, r: 5.5 },
      { x: 10, y: -16, r: 5.5 },
    ],
    exhaust: { x: -24, y: -22 },
    exhaustColour: 0x6e6a66,
    wheel: { hub: 0xf2c230, hubScale: 0.48, spokes: 5, treads: 10, chunky: true },
    drawBody({ g, seed, colour, shade, wheels }) {
      // Coil springs down to the wheels show the suspension working.
      for (const w of wheels) {
        const pts: Point[] = [];
        const top = 6;
        const n = 6;
        for (let i = 0; i <= n; i++) pts.push({ x: w.x + (i % 2 ? 4 : -4) * (i > 0 && i < n ? 1 : 0), y: top + ((w.y - top) * i) / n });
        sketch(g, pts, { width: 2, colour: 0x6c6c74, jitter: 0.3 }, seed + 1);
      }
      // Exhaust stack.
      sketchShape(g, roundedRectPoints(-24, -13, 5, 18, 1.5), CHROME, THIN, seed + 2);
      // Roll bar with lights.
      sketch(g, [{ x: -9, y: -22 }, { x: -7, y: -31 }, { x: 11, y: -31 }, { x: 13, y: -22 }], { ...LINE, colour: 0x55555c, width: 3 }, seed + 3);
      for (const x of [-2, 3, 8]) sketchShape(g, circlePoints(x, -33, 2.4, 8), 0xffe766, { ...THIN, width: 1.2 }, seed + 4 + x);
      // Cabin.
      const cabin: Point[] = [{ x: -13, y: -6 }, { x: -11, y: -23 }, { x: 8, y: -23 }, { x: 18, y: -6 }];
      sketchShape(g, cabin, colour, LINE, seed + 10);
      sketchShape(g, [{ x: -8, y: -8 }, { x: -7, y: -20 }, { x: 7, y: -20 }, { x: 14, y: -8 }], GLASS, THIN, seed + 11);
      // Body.
      sketchShape(g, roundedRectPoints(0, 1, 70, 17, 5), colour, LINE, seed + 12);
      hatch(g, -33, 3, 66, 6, 3.5, shade, 0.45);
      // Flame decal.
      const flame: Point[] = [
        { x: -30, y: 6 }, { x: -22, y: -3 }, { x: -18, y: 2 }, { x: -12, y: -5 },
        { x: -8, y: 1 }, { x: -2, y: -4 }, { x: 2, y: 6 },
      ];
      sketchShape(g, flame, 0xff9b3d, { ...THIN, width: 1.2 }, seed + 13);
      // Grille as a toothy grin.
      sketchShape(g, roundedRectPoints(33, 1, 6, 11, 1.5), 0xf7f3e8, THIN, seed + 14);
      g.lineStyle(1.2, INK, 0.9);
      for (const y of [-2, 1, 4]) g.lineBetween(30, y, 36, y);
      headlight(g, 34, -6, 2.8, seed + 15);
    },
  },

  unicycle: {
    eyes: [
      { x: -2, y: -9, r: 5 },
      { x: 7, y: -9, r: 5 },
    ],
    mouth: { x: 3, y: 1, w: 7 },
    wheel: { hub: 0xc9c6c0, hubScale: 0.2, spokes: 10, treads: 0, chunky: false, rim: 0.8 },
    bodyOverWheels: true,
    drawBody({ g, seed, colour, shade, wheels, wheelAngles, t, mood }) {
      const w = wheels[0]!;
      const a = wheelAngles[0]!;
      // Seat post and crank.
      sketch(g, [{ x: 0, y: 14 }, w], { ...LINE, colour: 0x55555c, width: 3 }, seed + 1);
      const pedal = (k: number): Point => ({ x: w.x + Math.cos(a + k * Math.PI) * 8, y: w.y + Math.sin(a + k * Math.PI) * 8 });
      const p1 = pedal(0);
      const p2 = pedal(1);
      g.lineStyle(2.5, 0x55555c, 1);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
      // Legs pedal along.
      for (const [hip, p] of [[-4, p1], [4, p2]] as [number, Point][]) {
        sketch(g, [{ x: hip, y: 12 }, { x: (hip + p.x) / 2 + 4, y: (12 + p.y) / 2 }, p], { ...LINE, width: 2.2 }, seed + 2);
        sketchShape(g, roundedRectPoints(p.x + 1.5, p.y, 7, 3.5, 1.5), INK, THIN, seed + 3);
      }
      sketchShape(g, roundedRectPoints(0, 13, 18, 5, 2.5), 0x3a3a40, THIN, seed + 4);
      // Flailing arms: faster when scared.
      const speed = mood === 'scared' ? 60 : 160;
      for (const side of [-1, 1]) {
        const swing = Math.sin(t / speed + side) * 7;
        const hand = { x: side * 19, y: -10 + swing };
        sketch(g, [{ x: side * 9, y: -1 }, { x: side * 14, y: -6 + swing * 0.4 }, hand], { ...LINE, width: 2.2 }, seed + 5);
        sketchShape(g, circlePoints(hand.x, hand.y, 2.6, 8), 0xffffff, THIN, seed + 6);
      }
      // Bean body.
      const bean = roundedRectPoints(2, -3, 24, 30, 11, 5);
      sketchShape(g, bean, colour, LINE, seed + 7);
      hatch(g, -7, 4, 18, 6, 3.5, shade, 0.45);
      // Propeller cap.
      sketchShape(g, arcPoints(2, -17, 8, Math.PI, Math.PI * 2, 8), 0xf2c230, THIN, seed + 8);
      const spin = Math.abs(Math.cos(t / 40)) * 9 + 1;
      sketch(g, [{ x: 2, y: -26 }, { x: 2, y: -22 }], THIN, seed + 9);
      g.lineStyle(2.5, 0xd8433b, 1);
      g.lineBetween(2 - spin, -26, 2 + spin, -26);
    },
  },

  rocketCar: {
    eyes: [
      { x: 0, y: -15, r: 4.5 },
      { x: 8, y: -15, r: 4.5 },
    ],
    mouth: { x: 27, y: 2, w: 7 },
    flame: { x: -39, y: -1 },
    exhaust: { x: -40, y: -1 },
    exhaustColour: 0xc9c2b8,
    wheel: { hub: 0xd0d6dc, hubScale: 0.55, spokes: 3, treads: 7, chunky: false },
    drawBody({ g, seed, colour, shade }) {
      sketchShape(g, [{ x: -32, y: -8 }, { x: -24, y: -8 }, { x: -36, y: -25 }, { x: -39, y: -24 }], shade, LINE, seed + 1);
      sketchShape(g, [{ x: -39, y: -6 }, { x: -32, y: -8 }, { x: -32, y: 6 }, { x: -39, y: 4 }], CHROME, THIN, seed + 2);
      // Glass canopy.
      sketchShape(g, arcPoints(4, -8, 12, Math.PI, Math.PI * 2, 10), GLASS, THIN, seed + 3, 0.85);
      const body: Point[] = [
        { x: -32, y: -9 }, { x: -10, y: -10 }, { x: 18, y: -8 }, { x: 33, y: -1 },
        { x: 35, y: 3 }, { x: 30, y: 7 }, { x: -32, y: 7 },
      ];
      sketchShape(g, body, colour, LINE, seed + 4);
      hatch(g, -30, 2, 58, 4, 3.5, shade, 0.45);
      g.lineStyle(2.2, 0xffffff, 0.85);
      g.lineBetween(-30, -4, 26, -2);
      // Lightning roundel.
      sketchShape(g, circlePoints(-14, -1, 5.5, 12), 0xffffff, THIN, seed + 5);
      sketchShape(g, [{ x: -13, y: -6 }, { x: -17, y: 0 }, { x: -14, y: 0 }, { x: -16, y: 4 }, { x: -11, y: -2 }, { x: -14, y: -2 }], 0xf2c230, { ...THIN, width: 1 }, seed + 6);
      headlight(g, 32, 0, 2.5, seed + 7);
    },
  },
};
