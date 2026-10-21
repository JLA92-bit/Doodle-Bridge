import Phaser from 'phaser';
import { COLOURS, FONT_TITLE, FONT_UI, HUD } from '../config/ui';
import { GAME_HEIGHT, GAME_WIDTH, MAX_STEPS_PER_FRAME, PHYSICS, STEP_MS } from '../config/world';
import type { LevelData } from '../game/Level';
import testLevel from '../levels/test-01.json';
import { addSample, clipToLength } from '../physics/StrokeBuilder';
import { polylineLength, toPoint, type Point } from '../physics/geometry';
import { rebuild, Simulation } from '../physics/Simulation';
import { Button } from '../render/Button';
import { addPaper } from '../render/PaperBackground';
import { RENDER_SCALE, setupCamera } from '../render/scale';

/** Campaign play: draw with the world frozen, press Go, watch it work (or not). */
export class GameScene extends Phaser.Scene {
  sim!: Simulation;
  private level!: LevelData;
  private accumulator = 0;
  private runTime = 0;
  private fails = 0;

  private raw: Point[] | null = null;
  private drawPointerId: number | null = null;

  private worldG!: Phaser.GameObjects.Graphics;
  private strokeG!: Phaser.GameObjects.Graphics;
  private carG!: Phaser.GameObjects.Graphics;
  private hudG!: Phaser.GameObjects.Graphics;
  private inkText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private subMessage!: Phaser.GameObjects.Text;
  private undoBtn!: Button;
  private clearBtn!: Button;
  private goBtn!: Button;

  constructor() {
    super('Game');
  }

  create(): void {
    setupCamera(this);
    this.level = testLevel as LevelData;
    this.sim = new Simulation(this.level);
    this.accumulator = 0;
    this.fails = 0;

    addPaper(this, GAME_WIDTH, GAME_HEIGHT);
    this.worldG = this.add.graphics();
    this.strokeG = this.add.graphics();
    this.carG = this.add.graphics();
    this.hudG = this.add.graphics().setDepth(10);

    this.add
      .text(GAME_WIDTH / 2, 34, this.level.name, { fontFamily: FONT_TITLE, fontSize: '30px', color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    this.inkText = this.text(HUD.inkBar.x + HUD.inkBar.w / 2, HUD.inkBar.y - 22, 'ink', 20).setDepth(10);
    this.message = this.add
      .text(GAME_WIDTH / 2, 250, '', { fontFamily: FONT_TITLE, fontSize: '54px', color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(20);
    this.subMessage = this.text(GAME_WIDTH / 2, 316, '', 24).setDepth(20);

    const by = GAME_HEIGHT - HUD.margin - HUD.buttonH / 2;
    this.undoBtn = new Button(this, HUD.margin + 50, by, 'Undo', () => this.undo()).setDepth(30);
    this.clearBtn = new Button(this, HUD.margin + 156, by, 'Clear', () => this.clearStrokes()).setDepth(30);
    this.goBtn = new Button(this, GAME_WIDTH - HUD.margin - 60, by, 'Go!', () => this.goOrRetry(), {
      width: 120,
      fill: 0xfff1a8,
      fontSize: 30,
    }).setDepth(30);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    this.drawWorld();
    this.refreshUi();
  }

  private text(x: number, y: number, s: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: FONT_UI, fontSize: `${size}px`, color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
  }

  // ---------- input ----------

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0 || this.sim.status !== 'drawing' || this.raw) return;
    if (this.sim.inkLeft <= 0) {
      this.flashInk();
      return;
    }
    this.drawPointerId = pointer.id;
    this.raw = [{ x: pointer.worldX, y: pointer.worldY }];
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.raw || pointer.id !== this.drawPointerId) return;
    addSample(this.raw, { x: pointer.worldX, y: pointer.worldY });
    if (polylineLength(this.raw) >= this.sim.inkLeft) {
      this.raw = clipToLength(this.raw, this.sim.inkLeft);
      this.commitStroke();
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.raw || pointer.id !== this.drawPointerId) return;
    this.raw.push({ x: pointer.worldX, y: pointer.worldY });
    this.raw = clipToLength(this.raw, this.sim.inkLeft);
    this.commitStroke();
  }

  private commitStroke(): void {
    if (this.raw) this.sim.addStroke(this.raw);
    this.raw = null;
    this.drawPointerId = null;
    this.refreshUi();
  }

  private livePointer(): Point | null {
    if (!this.raw || this.drawPointerId === null) return null;
    const p = this.input.manager.pointers.find((ptr) => ptr.id === this.drawPointerId);
    return p ? { x: p.worldX, y: p.worldY } : null;
  }

  // ---------- buttons ----------

  private undo(): void {
    if (this.sim.status !== 'drawing') return;
    this.sim.undo();
    this.refreshUi();
  }

  private clearStrokes(): void {
    if (this.sim.status !== 'drawing') return;
    this.sim.clear();
    this.refreshUi();
  }

  private goOrRetry(): void {
    if (this.sim.status === 'drawing') {
      this.sim.start();
      this.runTime = 0;
      this.accumulator = 0;
    } else {
      // Retry keeps the drawing so players can tweak it. Clear wipes it.
      this.sim = rebuild(this.sim);
    }
    this.refreshUi();
  }

  private refreshUi(): void {
    const drawing = this.sim.status === 'drawing';
    this.undoBtn.setEnabled(drawing && this.sim.strokes.length > 0);
    this.clearBtn.setEnabled(drawing && this.sim.strokes.length > 0);
    this.goBtn.setLabel(drawing ? 'Go!' : 'Retry');
    if (drawing) {
      this.message.setText('');
      this.subMessage.setText(this.sim.strokes.length === 0 ? 'Draw a bridge from nail to nail' : '');
    }
  }

  private flashInk(): void {
    this.tweens.add({ targets: this.inkText, scale: 1.4, duration: 90, yoyo: true });
  }

  // ---------- loop ----------

  update(_time: number, delta: number): void {
    if (this.sim.status === 'running') {
      const dt = Math.min(delta, 100);
      const scale = this.runTime < PHYSICS.slowMoMs ? PHYSICS.slowMoFactor : 1;
      this.runTime += dt;
      this.accumulator += dt * scale;
      let steps = 0;
      while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME && this.sim.status === 'running') {
        this.sim.step();
        this.accumulator -= STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
      if (this.sim.status !== 'running') this.onRunEnded();
    }
    this.drawStrokes();
    this.drawCar();
    this.drawHud();
  }

  private onRunEnded(): void {
    if (this.sim.status === 'won') {
      this.message.setText('Nice!').setColor('#2f8f4e');
      this.subMessage.setText(
        `${(this.sim.elapsedMs / 1000).toFixed(1)} s  -  ${Math.round(this.sim.inkUsed)} ink used`,
      );
    } else {
      this.fails++;
      this.message.setText('Oops!').setColor('#d8433b');
      this.subMessage.setText('Tap Retry to try again');
    }
    this.refreshUi();
  }

  // ---------- rendering ----------

  private drawWorld(): void {
    const g = this.worldG;
    g.clear();
    for (const t of this.level.terrain) {
      const pts = t.points.map(toPoint);
      g.fillStyle(COLOURS.terrainFill, 1);
      g.fillPoints(pts, true);
      g.lineStyle(3, COLOURS.graphite, 1);
      g.strokePoints(pts, true);
    }
    const f = this.level.flag;
    const poleX = f.x + f.w / 2;
    const groundY = f.y + f.h;
    g.lineStyle(3, COLOURS.graphite, 1);
    g.lineBetween(poleX, groundY, poleX, groundY - 70);
    g.fillStyle(COLOURS.danger, 1);
    g.fillTriangle(poleX, groundY - 70, poleX + 34, groundY - 60, poleX, groundY - 50);
    g.strokeTriangle(poleX, groundY - 70, poleX + 34, groundY - 60, poleX, groundY - 50);
  }

  private drawStrokes(): void {
    const g = this.strokeG;
    g.clear();
    const pen = this.sim.pen;

    if (this.sim.status === 'drawing' && this.fails >= HUD.hintAfterFails && this.level.hint) {
      for (const hint of this.level.hint) dashed(g, hint.map(toPoint), COLOURS.hint, 4);
    }

    for (const chain of this.sim.strokes) pencilLine(g, chain.polyline(), pen.thickness, pen.colour);

    if (this.raw) {
      const live = this.livePointer();
      const pts = live ? [...this.raw, live] : this.raw;
      pencilLine(g, clipToLength(pts, this.sim.inkLeft), pen.thickness, pen.colour);
    }

    // Nails on top of the lines.
    for (const a of this.sim.anchors) {
      g.fillStyle(0xb7b3ab, 1);
      g.fillCircle(a.x, a.y, 7);
      g.lineStyle(2.5, COLOURS.graphite, 1);
      g.strokeCircle(a.x, a.y, 7);
      g.lineBetween(a.x - 3, a.y - 3, a.x + 3, a.y + 3);
    }
  }

  private drawCar(): void {
    const g = this.carG;
    const v = this.sim.vehicle;
    g.clear();
    for (const w of [v.backWheel, v.frontWheel]) {
      const r = v.config.wheelRadius;
      g.fillStyle(0x4a4a50, 1);
      g.fillCircle(w.position.x, w.position.y, r);
      g.fillStyle(0xf5f0e2, 1);
      g.fillCircle(w.position.x, w.position.y, r * 0.45);
      g.lineStyle(2.5, COLOURS.graphite, 1);
      g.strokeCircle(w.position.x, w.position.y, r);
      const c = Math.cos(w.angle) * r * 0.45;
      const s = Math.sin(w.angle) * r * 0.45;
      g.lineBetween(w.position.x - c, w.position.y - s, w.position.x + c, w.position.y + s);
    }
    const body = v.chassis;
    g.fillStyle(v.config.colour, 1);
    g.fillPoints(body.vertices, true);
    g.lineStyle(3, COLOURS.graphite, 1);
    g.strokePoints(body.vertices, true);

    // Googly eyes: pupils lag behind the motion.
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);
    const local = (x: number, y: number) => ({
      x: body.position.x + x * cos - y * sin,
      y: body.position.y + x * sin + y * cos,
    });
    const lagX = Phaser.Math.Clamp(-body.velocity.x * 0.6, -2.5, 2.5);
    const lagY = Phaser.Math.Clamp(-body.velocity.y * 0.6 + 1.5, -2.5, 2.5);
    for (const ex of [10, 21]) {
      const e = local(ex, -v.config.chassisHeight / 2 - 2);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(e.x, e.y, 6);
      g.lineStyle(2, COLOURS.graphite, 1);
      g.strokeCircle(e.x, e.y, 6);
      g.fillStyle(0x222226, 1);
      g.fillCircle(e.x + lagX, e.y + lagY, 2.6);
    }
  }

  private drawHud(): void {
    const g = this.hudG;
    const b = HUD.inkBar;
    g.clear();
    const drawingLen = this.raw ? polylineLength(this.raw) : 0;
    const left = Math.max(0, this.sim.inkLeft - drawingLen);
    const frac = this.sim.inkTotal > 0 ? left / this.sim.inkTotal : 0;
    g.fillStyle(0xffffff, 0.8);
    g.fillRoundedRect(b.x, b.y, b.w, b.h, 8);
    if (frac > 0) {
      const h = Math.max(6, b.h * frac);
      g.fillStyle(frac < 0.2 ? COLOURS.danger : COLOURS.ink, 1);
      g.fillRoundedRect(b.x, b.y + b.h - h, b.w, h, 8);
    }
    g.lineStyle(2.5, COLOURS.graphite, 1);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8);
  }
}

/** A pencil-ish line: a solid core plus a lighter offset pass, with round joints. */
function pencilLine(g: Phaser.GameObjects.Graphics, pts: readonly Point[], width: number, colour: number): void {
  if (pts.length < 2) return;
  g.lineStyle(width, colour, 0.9);
  g.strokePoints(pts as Point[], false);
  g.fillStyle(colour, 0.9);
  for (const p of pts) g.fillCircle(p.x, p.y, width / 2);
  g.lineStyle(Math.max(1, width * 0.35), 0xffffff, 0.18);
  g.strokePoints(
    pts.map((p) => ({ x: p.x, y: p.y - width * 0.18 })),
    false,
  );
}

function dashed(g: Phaser.GameObjects.Graphics, pts: readonly Point[], colour: number, width: number): void {
  g.lineStyle(width, colour, 0.6);
  const dash = 10;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d < len; d += dash * 2) {
      const t0 = d / len;
      const t1 = Math.min(1, (d + dash) / len);
      g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
    }
  }
}
