import Matter from 'matter-js';
import { ENDLESS } from '../config/endless';
import { PENS, type PenId } from '../config/pens';
import type { VehicleId } from '../config/vehicles';
import { STEP_MS } from '../config/world';
import type { LevelData } from '../game/Level';
import type { BridgeChain } from '../physics/BridgeChain';
import { dist, toPoint, type Point, type PointTuple } from '../physics/geometry';
import { Simulation, type CrashReason, type PlatformState } from '../physics/Simulation';
import { clipToLength, buildStroke } from '../physics/StrokeBuilder';
import type { Vehicle } from '../physics/Vehicle';
import { generateChunk } from './ChunkGenerator';
import { difficultyAt } from './Difficulty';
import { PX_PER_M, type Chunk, type Difficulty, type EndlessEvent, type EndlessRunApi, type GapSpan, type Replay } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** What a chunk put into the physics world, so it can be taken out again. */
interface ChunkParts {
  terrain: Matter.Body[];
  platforms: PlatformState[];
  anchors: Point[];
}

/** Progress of the vehicle through one gap. */
interface GapState {
  gap: GapSpan;
  entered: boolean;
  snapsAtEntry: number;
  ink: number;
}

/**
 * An endless run: the campaign physics (Simulation) with the course streamed in chunk by chunk,
 * the vehicle driving from the first step, and the player drawing while it moves.
 * Same seed + same inputs at the same steps always give the same run.
 */
export class EndlessRun implements EndlessRunApi {
  readonly sim: Simulation;
  readonly inkTotal: number;
  readonly chunks: Chunk[] = [];
  readonly inkPots: { at: Point; taken: boolean }[] = [];
  readonly trail: PointTuple[] = [];
  events: EndlessEvent[] = [];
  /** Where the vehicle started (x), the zero of the distance. */
  readonly startX = ENDLESS.startX;

  private ink: number;
  private readonly level: LevelData;
  private readonly parts = new Map<Chunk, ChunkParts>();
  private readonly potChunk = new Map<{ at: Point; taken: boolean }, Chunk>();
  private readonly gapStates: GapState[] = [];
  private readonly strokeLog: Replay['strokes'] = [];
  private nextIndex = 0;
  private nextX = ENDLESS.startX - 120;
  private nextY = ENDLESS.runwayY;
  private tier = 0;
  private airSteps = 0;

  constructor(
    readonly seed: number,
    readonly vehicleId: VehicleId = 'paperCar',
    readonly penId: PenId = 'pencil',
  ) {
    this.inkTotal = Math.round(ENDLESS.ink * PENS[penId].inkMultiplier);
    this.ink = this.inkTotal;
    // The "level" is only a shell: terrain, nails, platforms, wind and erasers are added as chunks stream in.
    this.level = {
      id: 'endless', name: 'Endless', notebook: 0, index: 0,
      terrain: [], anchors: [], wind: [], erasers: [],
      start: [this.startX, ENDLESS.runwayY - 1],
      flag: { x: 1e9, y: -1e9, w: 1, h: 1 },
      ink: this.inkTotal, stars: { ink: 0, timeMs: 0 },
      solution: { strokes: [] },
    };
    this.sim = new Simulation(this.level, penId, vehicleId, { stallMs: ENDLESS.stallMs, liveAnchors: true });
    this.sim.start();
    this.sim.vehicle.speedScale = this.difficulty.speed;
    this.extend();
  }

  // Read-only state --------------------------------------------------------

  get vehicle(): Vehicle {
    return this.sim.vehicle;
  }

  get strokes(): readonly BridgeChain[] {
    return this.sim.strokes;
  }

  get status(): 'running' | 'crashed' {
    return this.sim.status === 'crashed' ? 'crashed' : 'running';
  }

  get crashReason(): CrashReason | null {
    return this.sim.crashReason;
  }

  get steps(): number {
    return this.sim.steps;
  }

  get inkLeft(): number {
    return this.ink;
  }

  get distanceM(): number {
    return (this.sim.vehicle.chassis.position.x - this.startX) / PX_PER_M;
  }

  get difficulty(): Difficulty {
    return difficultyAt(this.distanceM);
  }

  get snaps(): number {
    return this.sim.snaps;
  }

  get boosting(): boolean {
    return this.sim.boosting;
  }

  get boostCooldown(): number {
    return this.sim.boostCooldown;
  }

  get replay(): Replay {
    return {
      seed: this.seed,
      vehicle: this.vehicleId,
      pen: this.penId,
      strokes: this.strokeLog.map((s) => ({ step: s.step, points: s.points.map((p) => [...p] as PointTuple) })),
      boosts: [...this.sim.boosts],
      gameVersion: ENDLESS.gameVersion,
    };
  }

  // Input ------------------------------------------------------------------

  /** Adds a stroke from raw finger samples (rounded to 0.1 px so replays stay exact), clipped to the ink left. */
  addStroke(raw: readonly Point[]): BridgeChain | null {
    if (this.sim.status !== 'running' || this.ink <= 0) return null;
    const pts = raw.map((p) => ({ x: round1(p.x), y: round1(p.y) }));
    const built = buildStroke(clipToLength(pts, this.ink), this.sim.anchors);
    if (!built) return null;
    const chain = this.sim.addBuilt(built);
    this.ink = Math.max(0, this.ink - built.length);
    this.strokeLog.push({ step: this.sim.steps, points: pts.map((p) => [p.x, p.y] as PointTuple) });
    const xs = built.points.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    for (const g of this.gapStates) {
      if (hi >= g.gap.x0 - 30 && lo <= g.gap.x1 + 30) g.ink += built.length;
    }
    return chain;
  }

  boost(): boolean {
    return this.sim.boost();
  }

  // Simulation -------------------------------------------------------------

  step(): void {
    const sim = this.sim;
    if (sim.status !== 'running') {
      sim.step();
      this.drain();
      return;
    }
    sim.step();
    this.drain();
    if (sim.status !== 'running') return;

    this.ink = Math.min(this.inkTotal, this.ink + ENDLESS.inkRefillPerSec * (STEP_MS / 1000));
    this.checkPots();
    this.checkAir();
    this.checkCloseCalls();
    this.checkGaps();
    this.checkTier();
    if (sim.steps % ENDLESS.trailEvery === 0) {
      const c = sim.vehicle.chassis.position;
      this.trail.push([round1(c.x), round1(c.y)]);
    }
    this.extend();
    if (sim.steps % ENDLESS.cullEvery === 0) this.cull();
  }

  /** Moves the simulation's events over to ours (minus campaign-only ones). */
  private drain(): void {
    for (const e of this.sim.events) {
      if (e.type !== 'won' && e.type !== 'checkpoint') this.events.push(e);
    }
    this.sim.events.length = 0;
  }

  private checkPots(): void {
    const c = this.sim.vehicle.chassis.position;
    for (const pot of this.inkPots) {
      if (pot.taken || Math.abs(pot.at.x - c.x) > ENDLESS.inkPotRadius || dist(pot.at, c) > ENDLESS.inkPotRadius) continue;
      pot.taken = true;
      this.ink = Math.min(this.inkTotal, this.ink + ENDLESS.inkPotRefill);
      this.events.push({ type: 'inkPot', at: { ...pot.at }, airborne: !this.sim.vehicle.grounded });
    }
  }

  private checkAir(): void {
    if (!this.sim.vehicle.grounded) {
      this.airSteps++;
      return;
    }
    const ms = this.airSteps * STEP_MS;
    this.airSteps = 0;
    if (ms >= ENDLESS.airMs) this.events.push({ type: 'air', ms: Math.round(ms) });
  }

  /** A snap while a wheel touches that line counts as a close call. */
  private checkCloseCalls(): void {
    for (const snap of this.sim.lastSnaps) {
      const touching = snap.chain.segments.some(
        (seg, i) =>
          !snap.chain.erased[i] &&
          this.sim.vehicle.wheels.some((w) => Matter.Collision.collides(w, seg) !== null),
      );
      if (touching) this.events.push({ type: 'closeCall', at: { ...snap.at } });
    }
  }

  /** Tracks entering and leaving each gap, for the crossing events. */
  private checkGaps(): void {
    const v = this.sim.vehicle;
    for (let i = this.gapStates.length - 1; i >= 0; i--) {
      const g = this.gapStates[i]!;
      if (!g.entered && v.frontWheel.position.x >= g.gap.x0) {
        g.entered = true;
        g.snapsAtEntry = this.sim.snaps;
      }
      if (g.entered && v.backWheel.position.x > g.gap.x1) {
        this.events.push({
          type: 'crossing',
          gap: g.gap,
          clean: this.sim.snaps === g.snapsAtEntry,
          inkUsed: Math.round(g.ink),
        });
        this.gapStates.splice(i, 1);
      }
    }
  }

  private checkTier(): void {
    const d = this.difficulty;
    if (d.tier <= this.tier) return;
    this.tier = d.tier;
    this.sim.vehicle.speedScale = d.speed;
    this.events.push({ type: 'tier', tier: d.tier });
  }

  // Streaming --------------------------------------------------------------

  /** Generates chunks until the world reaches `aheadPx` past the vehicle. */
  private extend(): void {
    const limit = this.sim.vehicle.chassis.position.x + ENDLESS.aheadPx;
    while (this.nextX < limit) this.addChunk();
  }

  private addChunk(): void {
    const d = difficultyAt(Math.max(0, this.nextX - this.startX) / PX_PER_M);
    const chunk = generateChunk(this.seed, this.nextIndex++, this.nextX, this.nextY, d);
    this.nextX = chunk.x1;
    this.nextY = chunk.exitY;
    const sim = this.sim;
    const parts: ChunkParts = { terrain: [], platforms: [], anchors: [] };
    for (const t of chunk.terrain) parts.terrain.push(sim.addTerrain(t.points.map(toPoint)));
    for (const a of chunk.anchors) {
      const nail = toPoint(a);
      parts.anchors.push(nail);
      sim.addAnchor(nail);
    }
    for (const p of chunk.platforms) parts.platforms.push(sim.addPlatform(p));
    this.level.wind!.push(...chunk.wind);
    this.level.erasers!.push(...chunk.erasers);
    for (const [x, y] of chunk.inkPots) {
      const pot = { at: { x, y }, taken: false };
      this.inkPots.push(pot);
      this.potChunk.set(pot, chunk);
    }
    for (const gap of chunk.gaps) this.gapStates.push({ gap, entered: false, snapsAtEntry: 0, ink: 0 });
    this.chunks.push(chunk);
    this.parts.set(chunk, parts);
  }

  /** Drops chunks and lines far behind the vehicle (and line debris that fell off the page). */
  private cull(): void {
    const sim = this.sim;
    const edge = sim.vehicle.chassis.position.x - ENDLESS.behindPx;
    while (this.chunks.length > 1 && this.chunks[0]!.x1 < edge) this.removeChunk(this.chunks.shift()!);
    for (const chain of [...sim.strokes]) {
      let maxX = -Infinity;
      let minY = Infinity;
      chain.segments.forEach((b, i) => {
        if (chain.erased[i]) return;
        maxX = Math.max(maxX, b.position.x);
        minY = Math.min(minY, b.position.y);
      });
      if (maxX < edge || minY > ENDLESS.debrisY) sim.removeStroke(chain);
    }
  }

  private removeChunk(chunk: Chunk): void {
    const parts = this.parts.get(chunk)!;
    this.parts.delete(chunk);
    for (const b of parts.terrain) this.sim.removeTerrain(b);
    for (const p of parts.platforms) this.sim.removePlatform(p);
    this.sim.removeAnchors(parts.anchors);
    const drop = <T>(list: T[], items: readonly T[]) => {
      for (const it of items) {
        const i = list.indexOf(it);
        if (i !== -1) list.splice(i, 1);
      }
    };
    drop(this.level.wind!, chunk.wind);
    drop(this.level.erasers!, chunk.erasers);
    for (let i = this.inkPots.length - 1; i >= 0; i--) {
      if (this.potChunk.get(this.inkPots[i]!) === chunk) {
        this.potChunk.delete(this.inkPots[i]!);
        this.inkPots.splice(i, 1);
      }
    }
    for (let i = this.gapStates.length - 1; i >= 0; i--) {
      if (chunk.gaps.includes(this.gapStates[i]!.gap)) this.gapStates.splice(i, 1);
    }
  }
}

/** Re-simulates a recorded run: strokes and boosts are applied on their recorded steps. */
export function replayRun(replay: Replay, maxSteps: number): EndlessRun {
  const run = new EndlessRun(replay.seed, replay.vehicle, replay.pen);
  const boosts = new Set(replay.boosts);
  let next = 0;
  while (run.status === 'running' && run.steps < maxSteps) {
    while (next < replay.strokes.length && replay.strokes[next]!.step <= run.steps) {
      run.addStroke(replay.strokes[next]!.points.map(toPoint));
      next++;
    }
    if (boosts.has(run.steps)) run.boost();
    run.step();
  }
  return run;
}
