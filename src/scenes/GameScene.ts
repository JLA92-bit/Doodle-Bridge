import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { BREAKING } from '../config/pens';
import { NOTEBOOKS } from '../config/notebooks';
import { DARKNESS, PAN, PAPER_THEMES, TIMER_WARN_MS, type PaperTheme } from '../config/theme';
import { COLOURS, FONT_TITLE, FONT_UI, HUD } from '../config/ui';
import { isVehicleId } from '../config/vehicles';
import { GAME_HEIGHT, GAME_WIDTH, MAX_STEPS_PER_FRAME, PHYSICS, STEP_MS } from '../config/world';
import { levelSize, type LevelData } from '../game/Level';
import { buzz, settings } from '../game/Settings';
import { getLevel, LEVELS, nextLevel } from '../game/Levels';
import { levelUnlocked } from '../game/Progress';
import { save } from '../game/Save';
import { levelScore, rateRun } from '../game/StarRules';
import { maxStress } from '../physics/BreakSystem';
import { polylineLength, toPoint, type Point } from '../physics/geometry';
import { rebuild, Simulation, type CrashReason, type SimEvent } from '../physics/Simulation';
import { addSample, clipToLength } from '../physics/StrokeBuilder';
import { Button } from '../render/Button';
import { Darkness, type Light } from '../render/Darkness';
import { Effects } from '../render/Effects';
import { addLevelArt, addNails, addScribbleUnderline } from '../render/LevelArt';
import { addErasers, CheckpointArt, PlatformArt, WindArt } from '../render/Mechanics';
import { addPaper } from '../render/PaperBackground';
import { addUiCamera, RENDER_SCALE } from '../render/scale';
import { addPanel, addStar, goTo, setupScreen } from '../render/ui';
import { boilFrame, boilImage, css, PENCIL, roughTextures, roundedRectPath } from '../render/RoughRenderer';
import { mulberry32 } from '../endless/SeededRandom';
import { VehicleRenderer } from '../render/VehicleRenderer';

const CRASH_TEXT: Record<CrashReason, string> = {
  fell: 'Down the gap!',
  flipped: 'Flipped over!',
  stalled: 'Stuck!',
  timeout: 'Out of time!',
};

/** Hit-stop: the world freezes for a moment when the vehicle crashes. */
const HIT_STOP_MS = 80;

/** Text colour on the cream results panel (independent of the paper style). */
const PANEL_TEXT = '#3d3d44';

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

  // Wide levels, cameras and mechanics art.
  private theme!: PaperTheme;
  private levelW = GAME_WIDTH;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  /** While true, new game objects are HUD (shown by the static UI camera only). */
  private hudMode = false;
  private camX = GAME_WIDTH / 2;
  private panTarget: number | null = null;
  private arrowDir: -1 | 0 | 1 = 0;
  private arrows: Phaser.GameObjects.Image[] = [];
  private downIds = new Set<number>();
  private panning = false;
  private panLastX = 0;
  private platformArt: PlatformArt | null = null;
  private windArt: WindArt | null = null;
  private checkpointArt: CheckpointArt | null = null;
  private darkness: Darkness | null = null;
  private nailSpots: Point[] = [];
  /** True once the checkpoint was passed: Retry then restarts from it. */
  private cpActive = false;
  private noteText!: Phaser.GameObjects.Text;
  private lastCrumbAt = 0;
  private timerWarn = false;

  constructor() {
    super('Game');
  }

  create(data: { levelId?: string; level?: LevelData; fromEditor?: boolean } = {}): void {
    this.level = data.level ?? getLevel(data.levelId ?? '') ?? LEVELS[0]!;
    this.fromEditor = !!data.fromEditor;
    this.paused = false;
    this.pendingCrash = null;
    this.hitStopUntil = 0;
    this.raw = null;
    this.drawPointerId = null;
    this.results = [];
    this.downIds.clear();
    this.panning = false;
    this.arrowDir = 0;
    this.panTarget = null;
    this.cpActive = false;
    this.lastCrumbAt = 0;
    this.timerWarn = false;
    this.platformArt = this.windArt = this.checkpointArt = this.darkness = null;
    this.levelW = levelSize(this.level).width;
    const paperStyle = this.level.paper ?? NOTEBOOKS.find((n) => n.id === this.level.notebook)?.paper ?? 'lined';
    this.theme = PAPER_THEMES[paperStyle];
    // Dev preview until the garage exists: ?vehicle=monsterTruck
    const vehicleParam = new URLSearchParams(window.location.search).get('vehicle');
    this.sim = new Simulation(this.level, undefined, isVehicleId(vehicleParam) ? vehicleParam : undefined);
    this.accumulator = 0;
    this.fails = this.fromEditor ? 0 : save().record(this.level.id).fails;

    // Two cameras: the main one scrolls over wide levels; a static UI camera shows only the HUD.
    this.camX = this.level.start[0];
    setupScreen(this, false, () => this.camX);
    // The camera size is known now, so the start position can be clamped to the level.
    this.camX = this.clampCamX(this.level.start[0]);
    this.cameras.main.centerOn(this.camX, GAME_HEIGHT / 2);
    this.uiCam = addUiCamera(this);
    this.uiCam.fadeIn(140, 139, 107, 82);
    const sortCamera = (obj: Phaser.GameObjects.GameObject) => {
      if (this.hudMode) this.cameras.main.ignore(obj);
      else this.uiCam.ignore(obj);
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, sortCamera);
    this.events.once('shutdown', () => this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, sortCamera));

    // World layer.
    const theme = this.theme;
    addPaper(this, this.levelW, GAME_HEIGHT, paperStyle);
    addLevelArt(this, this.level, theme);
    if (this.level.erasers?.length) addErasers(this, this.level.erasers, theme);
    if (this.level.platforms?.length) this.platformArt = new PlatformArt(this, this.level, theme);
    if (this.level.wind?.length) this.windArt = new WindArt(this, this.level.wind, theme);
    if (this.level.checkpoint) this.checkpointArt = new CheckpointArt(this, this.level.checkpoint, theme);
    // World nails only: nails on platforms are drawn (and moved) by the platform art.
    addNails(this, this.level.anchors.map(([x, y]) => ({ x, y })), theme);
    this.nailSpots = this.level.anchors.map(([x, y]) => ({ x, y }));
    this.strokeG = this.add.graphics().setDepth(2);
    this.car = new VehicleRenderer(this, 5);
    this.fx = new Effects(this, 15);

    // HUD layer (everything below is shown by the UI camera only).
    this.hudMode = true;
    this.buildHud();
    this.hudMode = false;

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.events.once('shutdown', () => Sfx.quiet());

    this.refreshUi();
    this.updateCamera(0);
  }

  /** Builds every fixed-on-screen object. Runs in HUD mode. */
  private buildHud(): void {
    const theme = this.theme;
    this.hudG = this.add.graphics().setDepth(25);
    if (this.level.darkness && this.level.darkness > 0) {
      this.darkness = new Darkness(this, Math.min(1, this.level.darkness), this.cameras.main, this.uiCam, 5);
    }

    const title = this.add
      .text(GAME_WIDTH / 2, 34, this.level.name, { fontFamily: FONT_TITLE, fontSize: '30px', color: theme.text })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(10);
    addScribbleUnderline(this, GAME_WIDTH / 2, 58, Math.round(title.width + 16), theme.ink);
    this.timerText = this.text(GAME_WIDTH / 2, 82, '', 22).setDepth(10);
    this.addInkBarFrame();
    this.inkText = this.text(HUD.inkBar.x + HUD.inkBar.w / 2, HUD.inkBar.y - 22, 'ink', 20).setDepth(10);
    this.message = this.add
      .text(GAME_WIDTH / 2, 230, '', { fontFamily: FONT_TITLE, fontSize: '56px', color: theme.text })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setDepth(20);
    this.subMessage = this.text(GAME_WIDTH / 2, 296, '', 24).setDepth(20);
    this.noteText = this.text(GAME_WIDTH / 2, GAME_HEIGHT - HUD.margin - HUD.buttonH - 16, '', 18, '#2f8f4e').setDepth(20);

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
    if (this.levelW > GAME_WIDTH) this.buildPanArrows();
  }

  /** Hold-to-scroll arrows at the screen edges of wide levels. */
  private buildPanArrows(): void {
    const w = 38;
    const h = 92;
    const y = 640;
    ([-1, 1] as const).forEach((dir) => {
      const keys = roughTextures(this, `pan-arrow-${dir}-${this.theme.ink}`, { x: 0, y: 0, w, h }, (rc, ctx, seed) => {
        const outline = roundedRectPath(0, 0, w, h, 14);
        ctx.fillStyle = css(0xfffdf6, 0.85);
        ctx.fill(new Path2D(outline));
        rc.path(outline, { ...PENCIL, strokeWidth: 2.2, seed });
        const cx = w / 2 + dir * 3;
        rc.linearPath(
          [
            [cx - dir * 7, h / 2 - 16],
            [cx + dir * 7, h / 2],
            [cx - dir * 7, h / 2 + 16],
          ],
          { ...PENCIL, strokeWidth: 3.4, seed: seed + 1 },
        );
      });
      const x = dir < 0 ? 4 : GAME_WIDTH - 4 - w;
      const img = boilImage(this, keys, { x, y: y - h / 2, w, h }).setDepth(28);
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => {
        this.arrowDir = dir;
        this.panTarget = null;
      });
      const stop = () => {
        if (this.arrowDir === dir) this.arrowDir = 0;
      };
      img.on('pointerup', stop);
      img.on('pointerout', stop);
      this.arrows.push(img);
    });
  }

  // ---------- camera ----------

  /** Keeps a camera centre inside the level (centred when the level is narrower than the view). */
  private clampCamX(x: number): number {
    const cam = this.cameras?.main;
    const viewW = cam ? cam.width / cam.zoom : GAME_WIDTH;
    if (viewW >= this.levelW) return this.levelW / 2;
    return Phaser.Math.Clamp(x, viewW / 2, this.levelW - viewW / 2);
  }

  /** Arrow scrolling, glide-back after a retry, and following the vehicle during a run. */
  private updateCamera(deltaMs: number): void {
    if (this.levelW <= GAME_WIDTH && this.cameras.main.width / this.cameras.main.zoom <= this.levelW) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    if (this.sim.status === 'drawing') {
      if (this.arrowDir !== 0 && !this.paused) {
        this.camX += this.arrowDir * PAN.arrowSpeed * dt;
      } else if (this.panTarget !== null) {
        this.camX += (this.panTarget - this.camX) * (1 - Math.exp(-PAN.glideRate * dt));
        if (Math.abs(this.panTarget - this.camX) < 0.5) this.panTarget = null;
      }
    } else {
      const target = this.sim.vehicle.chassis.position.x + PAN.lookAhead;
      this.camX += (this.clampCamX(target) - this.camX) * (1 - Math.exp(-PAN.followRate * dt));
    }
    this.camX = this.clampCamX(this.camX);
    this.cameras.main.centerOn(this.camX, GAME_HEIGHT / 2);
  }

  private addInkBarFrame(): void {
    const b = HUD.inkBar;
    const keys = roughTextures(this, `inkbar-${this.theme.ink}`, { x: b.x, y: b.y, w: b.w, h: b.h }, (rc, _ctx, seed) => {
      rc.path(roundedRectPath(b.x, b.y, b.w, b.h, 7), { ...PENCIL, stroke: this.theme.ink, strokeWidth: 2.4, seed });
      for (let i = 1; i < 4; i++) {
        const y = b.y + (b.h * i) / 4;
        rc.line(b.x + b.w - 5, y, b.x + b.w, y, { ...PENCIL, stroke: this.theme.ink, strokeWidth: 1.4, seed: seed + i });
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
      this.retry(true);
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

  private text(x: number, y: number, s: string, size: number, colour = this.theme.text): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, s, { fontFamily: FONT_UI, fontSize: `${size}px`, color: colour })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
  }

  // ---------- input ----------

  /** Pointer position in page coordinates, whatever the main camera has scrolled to. */
  private worldPoint(pointer: Phaser.Input.Pointer): Point {
    const v = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return { x: v.x, y: v.y };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    Sfx.unlock();
    this.downIds.add(pointer.id);
    if (over.length > 0 || this.paused) return;
    if (this.sim.status === 'running') {
      // While running, a tap anywhere boosts.
      this.boost();
      return;
    }
    if (this.sim.status !== 'drawing') return;
    // A second finger on a wide level pans (one finger always draws).
    if (this.levelW > GAME_WIDTH && this.downIds.size >= 2 && (!this.raw || polylineLength(this.raw) < 24)) {
      this.raw = null;
      this.drawPointerId = null;
      this.lastSample = null;
      Sfx.setScratch(0);
      this.panning = true;
      this.panTarget = null;
      this.panLastX = this.touchCentreX();
      return;
    }
    if (this.raw || this.panning) return;
    if (this.sim.inkLeft <= 0) {
      this.flashInk();
      return;
    }
    this.drawPointerId = pointer.id;
    const p = this.worldPoint(pointer);
    this.raw = [p];
    this.lastSample = { x: p.x, y: p.y, t: this.time.now };
  }

  /** Average screen x of the fingers that are down (canvas pixels). */
  private touchCentreX(): number {
    const down = this.input.manager.pointers.filter((p) => p.isDown);
    return down.length ? down.reduce((sum, p) => sum + p.x, 0) / down.length : 0;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.panning) {
      const x = this.touchCentreX();
      this.camX = this.clampCamX(this.camX - (x - this.panLastX) / this.cameras.main.zoom);
      this.panLastX = x;
      return;
    }
    if (!this.raw || pointer.id !== this.drawPointerId) return;
    const p = this.worldPoint(pointer);
    this.extendStroke(p);
  }

  /** Adds a sample to the stroke being drawn, stopping when the ink runs out. */
  private extendStroke(p: Point): void {
    if (!this.raw) return;
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
    this.downIds.delete(pointer.id);
    if (this.downIds.size < 2) this.panning = false;
    if (pointer.id !== this.drawPointerId) this.arrowDir = 0;
    if (!this.raw || pointer.id !== this.drawPointerId) return;
    this.raw.push(this.worldPoint(pointer));
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
    return p ? this.worldPoint(p) : null;
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

  /**
   * Back to drawing with the same lines, instantly. Clear wipes them. After the checkpoint
   * was passed, Retry restarts from it (the pause menu's Restart passes `fromStart`).
   */
  private retry(fromStart = false): void {
    const fromCheckpoint = !fromStart && this.cpActive && this.sim.status !== 'won' && !!this.level.checkpoint;
    this.sim = rebuild(this.sim, fromCheckpoint ? { fromCheckpoint: true } : {});
    this.cpActive = fromCheckpoint;
    this.checkpointArt?.setReached(this.cpActive);
    this.panTarget = this.clampCamX(this.sim.vehicle.chassis.position.x);
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
      this.subMessage.setText(
        this.cpActive ? 'Starting at the checkpoint' : this.sim.strokes.length === 0 ? (this.level.tip ?? '') : '',
      );
    } else if (running) {
      this.subMessage.setText('');
    }
    this.noteText.setText(this.cpActive && !drawing ? 'Retry restarts at the checkpoint' : '');
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
    this.updateCamera(delta);
    this.platformArt?.update(this.sim);
    this.windArt?.update(frozen || this.sim.status === 'drawing' ? 0 : delta);
    this.keepDrawingWhileScrolling();
    this.drawStrokes(time);
    this.drawHud();
    this.updateTimer(time);
    this.updateDarkness();
  }

  /** While an edge arrow scrolls the page under a drawing finger, the line keeps following it. */
  private keepDrawingWhileScrolling(): void {
    if (this.arrowDir === 0 || !this.raw) return;
    const live = this.livePointer();
    const last = this.raw[this.raw.length - 1];
    if (live && last && Math.hypot(live.x - last.x, live.y - last.y) > 6) this.extendStroke(live);
  }

  /** Run clock, or the countdown on timed levels (red and pulsing in the last seconds). */
  private updateTimer(time: number): void {
    const left = this.sim.timeLeftMs;
    const t = this.timerText;
    if (left === null) {
      t.setText(this.sim.status === 'drawing' ? '' : `${(this.sim.elapsedMs / 1000).toFixed(1)} s`);
      if (this.timerWarn) this.setTimerWarn(false);
      return;
    }
    t.setText(`${(left / 1000).toFixed(1)} s left`);
    const warn = left < TIMER_WARN_MS && this.sim.status !== 'won';
    if (warn !== this.timerWarn) this.setTimerWarn(warn);
    t.setScale(warn && !settings().reducedMotion ? 1 + 0.14 * Math.abs(Math.sin(time / 170)) : 1);
  }

  private setTimerWarn(on: boolean): void {
    this.timerWarn = on;
    this.timerText.setColor(on ? '#d8433b' : this.theme.text).setScale(1);
  }

  /** Light pools for dark levels: the vehicle, the drawing finger, nails, the flag and the checkpoint. */
  private updateDarkness(): void {
    if (!this.darkness) return;
    const lights: Light[] = [];
    const v = this.sim.vehicle.chassis.position;
    lights.push({ x: v.x, y: v.y, radius: DARKNESS.vehicleRadius });
    if (this.sim.status === 'drawing') {
      const finger = this.livePointer() ?? this.hoverPoint();
      if (finger) lights.push({ x: finger.x, y: finger.y, radius: DARKNESS.fingerRadius });
    }
    for (const n of this.nailSpots) lights.push({ ...n, radius: DARKNESS.nailRadius });
    for (const n of this.platformArt?.nailPositions() ?? []) lights.push({ ...n, radius: DARKNESS.nailRadius });
    const f = this.level.flag;
    lights.push({ x: f.x + f.w / 2, y: f.y + f.h - 30, radius: DARKNESS.flagRadius });
    const cp = this.level.checkpoint;
    if (cp) lights.push({ x: cp[0], y: cp[1] - 24, radius: DARKNESS.flagRadius * 0.8 });
    this.darkness.update(lights);
  }

  /** The finger (or mouse) position while drawing, even before a stroke starts. */
  private hoverPoint(): Point | null {
    const p = this.input.activePointer;
    if (!p.isDown && (p.wasTouch || (p.x === 0 && p.y === 0))) return null;
    return this.worldPoint(p);
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
        case 'erase':
          if (this.time.now - this.lastCrumbAt > 90) {
            this.lastCrumbAt = this.time.now;
            this.fx.eraseCrumbs(e.at);
            Sfx.tap();
          }
          break;
        case 'checkpoint':
          this.cpActive = true;
          this.checkpointArt?.setReached(true);
          this.checkpointPopup();
          this.refreshUi();
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

  /** A quick "Checkpoint!" banner near the top of the screen. */
  private checkpointPopup(): void {
    this.hudMode = true;
    const t = this.add
      .text(GAME_WIDTH / 2, 160, 'Checkpoint!', { fontFamily: FONT_TITLE, fontSize: '40px', color: '#2f8f4e' })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE)
      .setStroke('#fffdf6', 6)
      .setDepth(21);
    this.hudMode = false;
    this.popText(t, -4);
    Sfx.ding(1);
    this.tweens.add({ targets: t, alpha: 0, y: 140, delay: 1100, duration: 420, onComplete: () => t.destroy() });
  }

  private showWin(): void {
    this.hudMode = true;
    try {
      this.buildWin();
    } finally {
      this.hudMode = false;
    }
  }

  private buildWin(): void {
    const f = this.level.flag;
    this.fx.confetti({ x: f.x + f.w / 2, y: f.y + f.h - 60 });
    this.fx.confetti({ x: this.camX, y: 120 }, 40);
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
    const lines = add(this.text(GAME_WIDTH / 2, top + 238, '', 21, PANEL_TEXT).setDepth(21).setAlign('center').setLineSpacing(4));
    lines.setText(
      `Ink ${Math.round(run.inkUsed)}  (star at ${this.level.stars.ink})\n` + `Time ${time} s  (star at ${target} s)`,
    );
    const best = store.record(this.level.id).bestScore;
    add(this.text(GAME_WIDTH / 2, top + 300, `Score ${fmt(score)}`, 30, PANEL_TEXT).setDepth(21));
    add(
      this.text(GAME_WIDTH / 2, top + 336, outcome.newBest ? 'New best!' : `Best ${fmt(best)}`, 22, PANEL_TEXT)
        .setColor(outcome.newBest ? '#d8433b' : '#6b6b72')
        .setDepth(21),
    );

    const by = top + 410;
    const next = nextLevel(this.level);
    const canNext = !this.fromEditor && !!next && levelUnlocked(store, next.notebook, next.index);
    add(new Button(this, GAME_WIDTH / 2 - 120, by, 'Retry', () => this.retry(true), { width: 100 }).setDepth(22));
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
    const colour = this.penColour();
    const frame = boilFrame(time);

    if (this.sim.status === 'drawing' && this.fails >= HUD.hintAfterFails && this.level.hint) {
      for (const hint of this.level.hint) dashed(g, hint.map(toPoint), COLOURS.hint, 4);
    }

    for (const chain of this.sim.strokes) {
      chain.runs().forEach((run, r) =>
        stressedLine(g, run.points, run.stress, pen.thickness, colour, chain.id * 97 + r * 13 + frame),
      );
    }

    if (this.raw) {
      const live = this.livePointer();
      const pts = live ? [...this.raw, live] : this.raw;
      const clipped = clipToLength(pts, this.sim.inkLeft);
      stressedLine(g, clipped, clipped.map(() => 0), pen.thickness, colour, 999 + frame);
    }
  }

  /** Pen colour, swapped for chalk white when a dark pen would vanish on dark paper. */
  private penColour(): number {
    const c = this.sim.pen.colour;
    const luma = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
    return this.theme.pencil !== null && luma < 0.4 ? this.theme.pencil : c;
  }

  /** Thin overview of a wide level: where the screen is, and where the start, checkpoint and flag lie. */
  private drawOverview(g: Phaser.GameObjects.Graphics): void {
    const x0 = 140;
    const w = 200;
    const y = 112;
    const k = w / this.levelW;
    const track = this.theme.dark ? 0xb7c0e0 : 0x6b6b72;
    g.lineStyle(3, track, 0.5);
    g.lineBetween(x0, y, x0 + w, y);
    const cam = this.cameras.main;
    const viewW = Math.min(this.levelW, cam.width / cam.zoom);
    g.fillStyle(COLOURS.accent, 0.55);
    g.fillRoundedRect(x0 + (this.camX - viewW / 2) * k, y - 6, viewW * k, 12, 4);
    g.fillStyle(0x3d3d44, 1);
    g.fillCircle(x0 + this.level.start[0] * k, y, 3.5);
    if (this.level.checkpoint) {
      g.fillStyle(0x46b35a, 1);
      g.fillCircle(x0 + this.level.checkpoint[0] * k, y, 3.5);
    }
    g.fillStyle(COLOURS.danger, 1);
    g.fillCircle(x0 + (this.level.flag.x + this.level.flag.w / 2) * k, y, 4);
  }

  private drawHud(): void {
    const g = this.hudG;
    const b = HUD.inkBar;
    g.clear();
    if (this.levelW > GAME_WIDTH) {
      this.drawOverview(g);
      const drawing = this.sim.status === 'drawing' && !this.paused;
      const cam = this.cameras.main;
      const half = cam.width / cam.zoom / 2;
      this.arrows[0]?.setVisible(drawing && this.camX - half > 1);
      this.arrows[1]?.setVisible(drawing && this.camX + half < this.levelW - 1);
    }
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

