import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { BREAKING } from '../config/pens';
import { COLOURS, FONT_TITLE, FONT_UI, HUD } from '../config/ui';
import { isVehicleId } from '../config/vehicles';
import { GAME_HEIGHT, GAME_WIDTH, MAX_STEPS_PER_FRAME, PHYSICS, STEP_MS } from '../config/world';
import type { LevelData } from '../game/Level';
import { buzz } from '../game/Settings';
import { getLevel, LEVELS, nextLevel } from '../game/Levels';
import { levelUnlocked } from '../game/Progress';
import { save } from '../game/Save';
import { levelScore, rateRun } from '../game/StarRules';
import { maxStress } from '../physics/BreakSystem';
import { polylineLength, toPoint, type Point } from '../physics/geometry';
import { rebuild, Simulation, type CrashReason, type SimEvent } from '../physics/Simulation';
import { addSample, clipToLength } from '../physics/StrokeBuilder';
import { Button } from '../render/Button';
import { Effects } from '../render/Effects';
import { addLevelArt, addNails, addScribbleUnderline } from '../render/LevelArt';
import { addPaper } from '../render/PaperBackground';
import { RENDER_SCALE } from '../render/scale';
import { addPanel, addStar, goTo, setupScreen } from '../render/ui';
import { boilFrame, boilImage, css, PENCIL, roughTextures, roundedRectPath } from '../render/RoughRenderer';
import { mulberry32 } from '../endless/SeededRandom';
import { VehicleRenderer } from '../render/VehicleRenderer';

const CRASH_TEXT: Record<CrashReason, string> = {
  fell: 'Down the gap!',
  flipped: 'Flipped over!',
  stalled: 'Stuck!',
};

/** Hit-stop: the world freezes for a moment when the vehicle crashes. */
const HIT_STOP_MS = 80;

/** Campaign play: draw with the world frozen, press Go, watch it work (or not). */
export class GameScene extends Phaser.Scene {
  sim!: Simulation;
  private level!: LevelData;
  private accumulator = 0;
  private runTime = 0;
  private fails = 0;
  private hitStopUntil = 0;
  private pendingCrash: Extract<SimEvent, { type: 'crashed' }> | null = null;

  private raw: Point[] | null = null;
  private drawPointerId: number | null = null;
  private lastSample: { x: number; y: number; t: number } | null = null;

  private strokeG!: Phaser.GameObjects.Graphics;
  private car!: VehicleRenderer;
  private fx!: Effects;
  private hudG!: Phaser.GameObjects.Graphics;
  private inkText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private subMessage!: Phaser.GameObjects.Text;
  /** Everything in the results panel, removed on retry. */
  private results: Phaser.GameObjects.GameObject[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private pauseBtn!: Button;
  private pauseLayer!: Phaser.GameObjects.Container;
  private paused = false;
  /** Test run from the level editor: nothing is saved and Levels returns to the editor. */
  private fromEditor = false;
  private undoBtn!: Button;
  private clearBtn!: Button;
  private goBtn!: Button;
  private retryBtn!: Button;
  private boostBtn!: Button;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('Game');
  }

  create(data: { levelId?: string; level?: LevelData; fromEditor?: boolean } = {}): void {
    setupScreen(this, false);
    this.level = data.level ?? getLevel(data.levelId ?? '') ?? LEVELS[0]!;
    this.fromEditor = !!data.fromEditor;
    this.paused = false;
    this.pendingCrash = null;
    this.hitStopUntil = 0;
    this.raw = null;
    this.drawPointerId = null;
    this.results = [];
    // Dev preview until the garage exists: ?vehicle=monsterTruck
    const vehicleParam = new URLSearchParams(window.location.search).get('vehicle');
    this.sim = new Simulation(this.level, undefined, isVehicleId(vehicleParam) ? vehicleParam : undefined);
    this.accumulator = 0;
    this.fails = this.fromEditor ? 0 : save().record(this.level.id).fails;

    addPaper(this, GAME_WIDTH, GAME_HEIGHT);
    addLevelArt(this, this.level);
    addNails(this, this.sim.anchors);
    this.strokeG = this.add.graphics().setDepth(2);
    this.car = new VehicleRenderer(this, 5);
    this.fx = new Effects(this, 15);
    this.hudG = this.add.graphics().setDepth(25);

    const title = this.add
      .text(GAME_WIDTH / 2, 34, this.level.name, { fontFamily: FONT_TITLE, fontSize: '30px', color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(10);
    addScribbleUnderline(this, GAME_WIDTH / 2, 58, Math.round(title.width + 16));
    this.timerText = this.text(GAME_WIDTH / 2, 82, '', 22).setDepth(10);
    this.addInkBarFrame();
    this.inkText = this.text(HUD.inkBar.x + HUD.inkBar.w / 2, HUD.inkBar.y - 22, 'ink', 20).setDepth(10);
    this.message = this.add
      .text(GAME_WIDTH / 2, 230, '', { fontFamily: FONT_TITLE, fontSize: '56px', color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(20);
    this.subMessage = this.text(GAME_WIDTH / 2, 296, '', 24).setDepth(20);

    const by = GAME_HEIGHT - HUD.margin - HUD.buttonH / 2;
    this.undoBtn = new Button(this, HUD.margin + 50, by, 'Undo', () => this.undo()).setDepth(30);
    this.clearBtn = new Button(this, HUD.margin + 156, by, 'Clear', () => this.clearStrokes()).setDepth(30);
    this.retryBtn = new Button(this, HUD.margin + 50, by, 'Retry', () => this.retry()).setDepth(30);
    this.goBtn = new Button(this, GAME_WIDTH - HUD.margin - 60, by, 'Go!', () => this.goOrRetry(), {
      width: 120,
      fill: 0xfff1a8,
      fontSize: 30,
    }).setDepth(30);
    this.pauseBtn = new Button(this, GAME_WIDTH - HUD.margin - 24, 36, 'II', () => this.setPaused(true), {
      width: 48,
      height: 48,
      radius: 24,
      fontSize: 22,
    }).setDepth(30);
    this.pauseLayer = this.buildPauseLayer();
    this.boostBtn = new Button(this, GAME_WIDTH - HUD.margin - 44, by - 14, 'Boost', () => this.boost(), {
      width: 84,
      height: 84,
      radius: 42,
      fill: 0xffd9a8,
      fontSize: 24,
    }).setDepth(30);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.events.once('shutdown', () => Sfx.quiet());

    this.refreshUi();
  }

  private addInkBarFrame(): void {
    const b = HUD.inkBar;
    const keys = roughTextures(this, 'inkbar', { x: b.x, y: b.y, w: b.w, h: b.h }, (rc, _ctx, seed) => {
      rc.path(roundedRectPath(b.x, b.y, b.w, b.h, 7), { ...PENCIL, strokeWidth: 2.4, seed });
      for (let i = 1; i < 4; i++) {
        const y = b.y + (b.h * i) / 4;
        rc.line(b.x + b.w - 5, y, b.x + b.w, y, { ...PENCIL, strokeWidth: 1.4, seed: seed + i });
      }
    });
    boilImage(this, keys, { x: b.x, y: b.y, w: b.w, h: b.h }).setDepth(26);
  }

  private buildPauseLayer(): Phaser.GameObjects.Container {
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH + 4000, GAME_HEIGHT + 4000, 0x2a2420, 0.35);
    dim.setInteractive();
    const panel = { x: GAME_WIDTH / 2 - 150, y: 250, w: 300, h: 320 };
    const keys = roughTextures(this, 'pause-panel', panel, (rc, ctx, seed) => {
      const outline = roundedRectPath(panel.x, panel.y, panel.w, panel.h, 18);
      ctx.fillStyle = css(0xfbf7ea);
      ctx.fill(new Path2D(outline));
      rc.path(outline, { ...PENCIL, strokeWidth: 2.8, seed });
    });
    const img = boilImage(this, keys, panel);
    const title = this.add
      .text(GAME_WIDTH / 2, 300, 'Paused', { fontFamily: FONT_TITLE, fontSize: '40px', color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    const resume = new Button(this, GAME_WIDTH / 2, 380, 'Resume', () => this.setPaused(false), {
      width: 180,
      fill: 0xfff1a8,
    });
    const restart = new Button(this, GAME_WIDTH / 2, 448, 'Restart', () => {
      this.setPaused(false);
      this.retry();
    }, { width: 180 });
    const levels = new Button(this, GAME_WIDTH / 2, 516, 'Levels', () => this.toLevels(), { width: 180 });
    return this.add.container(0, 0, [dim, img, title, resume, restart, levels]).setDepth(50).setVisible(false);
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    this.pauseLayer.setVisible(on);
    this.pauseBtn.setVisible(!on);
    if (on) {
      Sfx.quiet();
      if (this.raw) this.commitStroke();
    }
    Sfx.tap();
  }

  private text(x: number, y: number, s: string, size: number): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: FONT_UI, fontSize: `${size}px`, color: '#3d3d44' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
  }

  // ---------- input ----------

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    Sfx.unlock();
    if (over.length > 0 || this.paused) return;
    if (this.sim.status === 'running') {
      // While running, a tap anywhere boosts.
      this.boost();
      return;
    }
    if (this.sim.status !== 'drawing' || this.raw) return;
    if (this.sim.inkLeft <= 0) {
      this.flashInk();
      return;
    }
    this.drawPointerId = pointer.id;
    this.raw = [{ x: pointer.worldX, y: pointer.worldY }];
    this.lastSample = { x: pointer.worldX, y: pointer.worldY, t: this.time.now };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.raw || pointer.id !== this.drawPointerId) return;
    const p = { x: pointer.worldX, y: pointer.worldY };
    if (this.lastSample) {
      const dt = Math.max(1, this.time.now - this.lastSample.t);
      Sfx.setScratch((Math.hypot(p.x - this.lastSample.x, p.y - this.lastSample.y) / dt) * 16);
    }
    this.lastSample = { ...p, t: this.time.now };
    addSample(this.raw, p);
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
    this.lastSample = null;
    Sfx.setScratch(0);
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
    Sfx.tap();
    this.refreshUi();
  }

  private clearStrokes(): void {
    if (this.sim.status !== 'drawing') return;
    this.sim.clear();
    Sfx.tap();
    this.refreshUi();
  }

  private goOrRetry(): void {
    if (this.sim.status === 'drawing') {
      this.sim.start();
      this.runTime = 0;
      this.accumulator = 0;
      Sfx.tap();
      this.refreshUi();
    } else this.retry();
  }

  private boost(): void {
    this.sim.boost();
  }

  /** Back to drawing with the same lines, instantly. Clear wipes them. */
  private retry(): void {
    this.sim = rebuild(this.sim);
    this.pendingCrash = null;
    this.hitStopUntil = 0;
    this.car.reset();
    this.fx.clear();
    this.clearResults();
    Sfx.quiet();
    this.refreshUi();
  }

  private refreshUi(): void {
    const status = this.sim.status;
    const drawing = status === 'drawing';
    const running = status === 'running';
    this.undoBtn.setVisible(drawing).setEnabled(this.sim.strokes.length > 0);
    this.clearBtn.setVisible(drawing).setEnabled(this.sim.strokes.length > 0);
    this.retryBtn.setVisible(running);
    this.boostBtn.setVisible(running);
    this.goBtn.setVisible(!running).setLabel(drawing ? 'Go!' : 'Retry');
    if (drawing) {
      this.message.setText('');
      this.subMessage.setText(this.sim.strokes.length === 0 ? (this.level.tip ?? '') : '');
    } else if (running) {
      this.subMessage.setText('');
    }
  }

  private flashInk(): void {
    this.tweens.add({ targets: this.inkText, scale: 1.4, duration: 90, yoyo: true });
  }

  // ---------- loop ----------

  update(time: number, delta: number): void {
    if (this.paused) return;
    const frozen = time < this.hitStopUntil;
    if (!frozen && this.pendingCrash) {
      this.showCrash(this.pendingCrash);
      this.pendingCrash = null;
    }
    if (!frozen && this.sim.status !== 'drawing') this.stepSim(delta);

    if (!frozen) this.car.update(this.sim.vehicle, this.sim.status, time, delta, this.sim.boosting);
    this.fx.update(frozen ? 0 : delta);
    Sfx.setCreak(this.sim.status === 'running' ? maxStress(this.sim.strokes) : 0);
    this.drawStrokes(time);
    this.drawHud();
    this.timerText.setText(this.sim.status === 'drawing' ? '' : `${(this.sim.elapsedMs / 1000).toFixed(1)} s`);
  }

  private stepSim(delta: number): void {
    const dt = Math.min(delta, 100);
    const scale = this.runTime < PHYSICS.slowMoMs ? PHYSICS.slowMoFactor : 1;
    this.runTime += dt;
    this.accumulator += dt * scale;
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.sim.step();
      this.accumulator -= STEP_MS;
      steps++;
      if (this.handleEvents()) break;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  /** Reacts to what happened in the simulation. Returns true to stop stepping this frame (hit-stop). */
  private handleEvents(): boolean {
    let stop = false;
    for (const e of this.sim.events) {
      switch (e.type) {
        case 'snap':
          this.fx.snapPuff(e.at);
          this.fx.shake('small');
          Sfx.snap();
          buzz(15);
          break;
        case 'land':
          this.car.onLand(e.impact);
          Sfx.land(e.impact);
          break;
        case 'boost':
          this.car.onBoost(this.sim.vehicle);
          Sfx.boost();
          break;
        case 'won':
          this.showWin();
          break;
        case 'crashed':
          this.pendingCrash = e;
          this.hitStopUntil = this.time.now + HIT_STOP_MS;
          Sfx.setCreak(0);
          stop = true;
          break;
      }
    }
    this.sim.events = [];
    return stop;
  }

  // ---------- results ----------

  private toLevels(): void {
    Sfx.quiet();
    if (this.fromEditor) goTo(this, 'Editor', { level: this.level });
    else goTo(this, 'LevelSelect', { notebook: this.level.notebook });
  }

  private showCrash(e: Extract<SimEvent, { type: 'crashed' }>): void {
    this.fails = this.fromEditor ? this.fails + 1 : save().recordFail(this.level.id);
    const at = { x: e.at.x, y: Math.min(e.at.y, GAME_HEIGHT - 20) };
    this.car.explode(this.sim.vehicle);
    this.fx.crashBurst(at);
    this.fx.shake('medium');
    Sfx.crash();
    buzz(60);
    this.refreshUi();
    this.popText(this.message.setText('Oops!').setColor('#d8433b'), -6);
    this.subMessage.setText(CRASH_TEXT[e.reason]);
    this.pulseRetry(500);
  }

  private showWin(): void {
    const f = this.level.flag;
    this.fx.confetti({ x: f.x + f.w / 2, y: f.y + f.h - 60 });
    this.fx.confetti({ x: GAME_WIDTH / 2, y: 120 }, 40);
    Sfx.win();

    const run = { won: true, inkUsed: this.sim.inkUsed, inkTotal: this.sim.inkTotal, timeMs: this.sim.elapsedMs };
    const rating = rateRun(run, this.level.stars);
    const score = levelScore(run, this.level.stars);
    const store = save();
    const result = {
      stars: [rating.complete, rating.ink, rating.time] as [boolean, boolean, boolean],
      score,
      timeMs: Math.round(run.timeMs),
      ink: Math.round(run.inkUsed),
    };
    const outcome = this.fromEditor
      ? { newBest: false, newStars: 0, firstClear: false }
      : store.recordWin(this.level.id, result);
    this.refreshUi();
    this.goBtn.setVisible(false);

    // Results panel slides up after a beat so the win moment can land.
    const top = 150;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.results.push(o);
      return o;
    };
    add(addPanel(this, { x: 45, y: top, w: 390, h: 470 }, 0xfffdf6).setDepth(19));
    const title = add(this.add
      .text(GAME_WIDTH / 2, top + 60, 'Nice!', { fontFamily: FONT_TITLE, fontSize: '56px', color: '#2f8f4e' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(21));
    this.popText(title, 4);

    const stars: Phaser.GameObjects.GameObject[] = [];
    [rating.complete, rating.ink, rating.time].forEach((on, i) => {
      const img = add(addStar(this, GAME_WIDTH / 2 + (i - 1) * 74, top + 150, on, 30).setDepth(21));
      img.setScale(0);
      stars.push(img);
      this.time.delayedCall(450 + i * 300, () => {
        this.tweens.add({ targets: img, scale: 1 / RENDER_SCALE, angle: on ? 360 : 0, duration: 380, ease: 'Back.easeOut' });
        if (on) Sfx.ding(i);
        else Sfx.tap();
      });
    });

    const time = (run.timeMs / 1000).toFixed(1);
    const target = (this.level.stars.timeMs / 1000).toFixed(1);
    const lines = add(this.text(GAME_WIDTH / 2, top + 238, '', 21).setDepth(21).setAlign('center').setLineSpacing(4));
    lines.setText(
      `Ink ${Math.round(run.inkUsed)}  (star at ${this.level.stars.ink})\n` + `Time ${time} s  (star at ${target} s)`,
    );
    const best = store.record(this.level.id).bestScore;
    add(this.text(GAME_WIDTH / 2, top + 300, `Score ${fmt(score)}`, 30).setDepth(21));
    add(
      this.text(GAME_WIDTH / 2, top + 336, outcome.newBest ? 'New best!' : `Best ${fmt(best)}`, 22)
        .setColor(outcome.newBest ? '#d8433b' : '#6b6b72')
        .setDepth(21),
    );

    const by = top + 410;
    const next = nextLevel(this.level);
    const canNext = !this.fromEditor && !!next && levelUnlocked(store, next.notebook, next.index);
    add(new Button(this, GAME_WIDTH / 2 - 120, by, 'Retry', () => this.retry(), { width: 100 }).setDepth(22));
    add(new Button(this, GAME_WIDTH / 2, by, this.fromEditor ? 'Editor' : 'Levels', () => this.toLevels(), { width: 100 }).setDepth(22));
    const nextBtn = add(
      new Button(this, GAME_WIDTH / 2 + 120, by, 'Next', () => goTo(this, 'Game', { levelId: next!.id }), {
        width: 100,
        fill: 0xfff1a8,
      }).setDepth(22),
    );
    nextBtn.setEnabled(canNext);

    // Fade the panel in; the title and stars pop in on their own.
    const fading = this.results.filter((o) => o !== title && !stars.includes(o)) as unknown as Phaser.GameObjects.Components.Alpha[];
    fading.forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: fading, alpha: 1, duration: 250, delay: 150 });
    if (canNext) this.tweens.add({ targets: nextBtn, scale: 1.08, duration: 420, yoyo: true, repeat: -1, delay: 1600 });
  }

  private popText(t: Phaser.GameObjects.Text, angle: number): void {
    t.setScale(0).setAngle(0);
    this.tweens.add({ targets: t, scale: 1, angle, duration: 320, ease: 'Back.easeOut' });
  }

  private pulseRetry(delay: number): void {
    this.pulse?.stop();
    this.goBtn.setScale(1);
    this.pulse = this.tweens.add({ targets: this.goBtn, scale: 1.08, duration: 420, yoyo: true, repeat: -1, delay });
  }

  private clearResults(): void {
    this.pulse?.stop();
    this.pulse = null;
    this.goBtn.setScale(1);
    this.results.forEach((o) => o.destroy());
    this.results = [];
    this.message.setText('');
  }

  // ---------- rendering ----------

  private drawStrokes(time: number): void {
    const g = this.strokeG;
    g.clear();
    const pen = this.sim.pen;
    const frame = boilFrame(time);

    if (this.sim.status === 'drawing' && this.fails >= HUD.hintAfterFails && this.level.hint) {
      for (const hint of this.level.hint) dashed(g, hint.map(toPoint), COLOURS.hint, 4);
    }

    for (const chain of this.sim.strokes) {
      chain.runs().forEach((run, r) =>
        stressedLine(g, run.points, run.stress, pen.thickness, pen.colour, chain.id * 97 + r * 13 + frame),
      );
    }

    if (this.raw) {
      const live = this.livePointer();
      const pts = live ? [...this.raw, live] : this.raw;
      const clipped = clipToLength(pts, this.sim.inkLeft);
      stressedLine(g, clipped, clipped.map(() => 0), pen.thickness, pen.colour, 999 + frame);
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

    // Boost cooldown ring: fills back up clockwise until the next boost is ready.
    if (this.boostBtn.visible) {
      const cool = this.sim.boostCooldown;
      const { x, y } = this.boostBtn;
      this.boostBtn.setAlpha(cool > 0 ? 0.6 : 1);
      g.lineStyle(6, 0xffffff, 0.9);
      g.strokeCircle(x, y, 49);
      g.lineStyle(6, this.sim.boosting ? 0xff7a1a : COLOURS.accent, 1);
      g.beginPath();
      g.arc(x, y, 49, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cool), false);
      g.strokePath();
    }
  }
}

/**
 * A pencil line drawn segment by segment: stressed parts tint towards red and get
 * thicker (so the warning does not rely on colour alone).
 */
function stressedLine(
  g: Phaser.GameObjects.Graphics,
  pts: readonly Point[],
  stress: readonly number[],
  width: number,
  colour: number,
  seed: number,
): void {
  if (pts.length < 2) return;
  const tint = (s: number) => Math.max(0, Math.min(1, (s - BREAKING.tintFrom) / (1 - BREAKING.tintFrom)));
  for (let i = 1; i < pts.length; i++) {
    const s = tint(Math.max(stress[i - 1] ?? 0, stress[i] ?? 0));
    const w = width * (1 + s * 0.6);
    const c = mix(colour, COLOURS.danger, s);
    const a = pts[i - 1]!;
    const b = pts[i]!;
    g.lineStyle(w, c, 0.92);
    g.lineBetween(a.x, a.y, b.x, b.y);
    g.fillStyle(c, 0.92);
    g.fillCircle(b.x, b.y, w / 2);
    if (i === 1) g.fillCircle(a.x, a.y, w / 2);
  }
  // Pencil texture: a second, wobbly sketch pass along the edges, and a faint sheen.
  const rand = mulberry32(seed);
  const jitter = () => (rand() - 0.5) * width * 0.5;
  for (const side of [-1, 1]) {
    g.lineStyle(1.2, 0x1f1f24, 0.35);
    g.strokePoints(
      pts.map((p) => ({ x: p.x + jitter(), y: p.y + side * width * 0.42 + jitter() })),
      false,
    );
  }
  g.lineStyle(Math.max(1, width * 0.25), 0xffffff, 0.18);
  g.strokePoints(
    pts.map((p) => ({ x: p.x, y: p.y - width * 0.15 })),
    false,
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
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

