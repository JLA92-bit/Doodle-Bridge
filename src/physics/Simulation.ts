import Matter from 'matter-js';
import { BOOST, CRASH, PHYSICS, STEP_MS } from '../config/world';
import { CHECKPOINT, PLATFORM, WIND } from '../config/mechanics';
import { PENS, type PenConfig, type PenId } from '../config/pens';
import { getVehicle, type VehicleId } from '../config/vehicles';
import { anchorPoints, levelSize, terrainPolygons, type LevelData, type PlatformDef } from '../game/Level';
import { BridgeChain, type AnchorHost } from './BridgeChain';
import { updateBreaks, type Snap } from './BreakSystem';
import { CAT } from './categories';
import { toPoint, type Point } from './geometry';
import { buildStroke, type BuiltStroke } from './StrokeBuilder';
import { Vehicle } from './Vehicle';

const { Body, Composite, Engine, Events, Vertices } = Matter;

export type SimStatus = 'drawing' | 'running' | 'won' | 'crashed';
export type CrashReason = 'fell' | 'flipped' | 'stalled' | 'timeout';

export type SimEvent =
  | { type: 'snap'; at: Point }
  | { type: 'land'; impact: number }
  | { type: 'boost' }
  /** Part of a line was rubbed out by an eraser zone. */
  | { type: 'erase'; at: Point }
  /** The vehicle passed the level's checkpoint. */
  | { type: 'checkpoint' }
  | { type: 'won' }
  | { type: 'crashed'; reason: CrashReason; at: Point };

const stepsFor = (ms: number) => Math.round(ms / STEP_MS);

/**
 * The whole game world without any rendering. The Phaser scene and the
 * headless solver test both drive this, so they behave identically.
 */
export class Simulation {
  readonly engine: Matter.Engine;
  readonly pen: PenConfig;
  readonly anchors: Point[];
  readonly terrain: Matter.Body[] = [];
  readonly strokes: BridgeChain[] = [];
  vehicle!: Vehicle;
  status: SimStatus = 'drawing';
  crashReason: CrashReason | null = null;
  steps = 0;
  inkTotal: number;
  /** Things that happened since the scene last drained them (sounds, effects). */
  events: SimEvent[] = [];
  /** Steps on which boosts started, for replays. */
  readonly boosts: number[] = [];
  snaps = 0;
  /** Joints that snapped during the last step (with their line), for close-call detection. */
  lastSnaps: Snap[] = [];
  /** Moving platforms, one per `level.platforms` entry. */
  readonly platforms: PlatformState[] = [];
  /** True once the vehicle has passed the level's checkpoint during this run. */
  checkpointReached = false;
  /** Per anchor index: the platform body the nail rides on (null for world nails). */
  private readonly anchorHosts: AnchorHost[];
  private nextStrokeId = 0;
  private finishStep: number | null = null;
  private boostUntil = -1;
  private boostReadyAt = 0;
  private scheduledBoosts = new Set<number>();
  private flippedSteps = 0;
  private stalledSteps = 0;
  private progressX = -Infinity;
  private wasGrounded = true;
  private prevVy = 0;

  constructor(
    readonly level: LevelData,
    penId: PenId = level.pen ?? 'pencil',
    readonly vehicleId: VehicleId = level.vehicle ?? 'paperCar',
    readonly options: SimOptions = {},
  ) {
    this.pen = PENS[penId];
    this.inkTotal = Math.round(level.ink * this.pen.inkMultiplier);
    this.anchors = anchorPoints(level);
    this.anchorHosts = this.anchors.map(() => null);
    this.engine = Engine.create({
      gravity: { x: 0, y: PHYSICS.gravityY },
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      constraintIterations: PHYSICS.constraintIterations,
    });
    for (const poly of terrainPolygons(level)) this.addTerrain(poly);
    for (const def of level.platforms ?? []) this.addPlatform(def);
    this.checkpointReached = options.fromCheckpoint === true && level.checkpoint !== undefined;
    this.spawnVehicle();
    const markContacts = (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of e.pairs) {
        this.markWheel(pair.bodyA);
        this.markWheel(pair.bodyB);
      }
    };
    Events.on(this.engine, 'collisionStart', markContacts);
    Events.on(this.engine, 'collisionActive', markContacts);
  }

  private markWheel(body: Matter.Body): void {
    const i = this.vehicle.wheels.indexOf(body);
    if (i !== -1) this.vehicle.wheelContacts[i] = true;
  }

  get size() {
    return levelSize(this.level);
  }

  get inkUsed(): number {
    return this.strokes.reduce((sum, s) => sum + s.stroke.length, 0);
  }

  get inkLeft(): number {
    return Math.max(0, this.inkTotal - this.inkUsed);
  }

  /** Builds a stroke from raw finger samples. Returns null for taps or when out of ink. */
  addStroke(raw: readonly Point[]): BridgeChain | null {
    if (this.status !== 'drawing' || this.inkLeft <= 0) return null;
    const built = buildStroke(raw, this.anchors);
    return built ? this.addBuilt(built) : null;
  }

  /** Adds an already built stroke (used when retrying with the same drawing). */
  addBuilt(built: BuiltStroke): BridgeChain {
    const chain = new BridgeChain(this.nextStrokeId++, built, this.pen, this.anchorHosts);
    this.strokes.push(chain);
    Composite.add(this.engine.world, chain.composite);
    return chain;
  }

  /** Adds a convex static terrain piece (also used to stream in endless chunks). */
  addTerrain(poly: readonly Point[]): Matter.Body {
    const verts = Vertices.clockwiseSort(poly.map((p) => ({ ...p })));
    const body = Body.create({
      position: Vertices.centre(verts),
      vertices: verts,
      isStatic: true,
      friction: 0.9,
      label: 'terrain',
      collisionFilter: { category: CAT.terrain, mask: CAT.stroke | CAT.vehicle },
    });
    this.terrain.push(body);
    Composite.add(this.engine.world, body);
    return body;
  }

  removeTerrain(body: Matter.Body): void {
    const i = this.terrain.indexOf(body);
    if (i !== -1) this.terrain.splice(i, 1);
    Composite.remove(this.engine.world, body);
  }

  /** Adds a nail; `host` is the platform body it rides on (null for the fixed world). */
  addAnchor(at: Point, host: AnchorHost = null): void {
    this.anchors.push(at);
    this.anchorHosts.push(host);
  }

  /** Removes nails by identity. */
  removeAnchors(points: readonly Point[]): void {
    for (const p of points) {
      const i = this.anchors.indexOf(p);
      if (i === -1) continue;
      this.anchors.splice(i, 1);
      this.anchorHosts.splice(i, 1);
    }
  }

  /** Removes a stroke from the world without touching the others. */
  removeStroke(chain: BridgeChain): void {
    const i = this.strokes.indexOf(chain);
    if (i !== -1) this.strokes.splice(i, 1);
    Composite.remove(this.engine.world, chain.composite, true);
  }

  undo(): void {
    const last = this.strokes.pop();
    if (last) Composite.remove(this.engine.world, last.composite, true);
  }

  clear(): void {
    while (this.strokes.length) this.undo();
  }

  /** Press Go: the world unfreezes and the vehicle starts driving. */
  start(): void {
    if (this.status !== 'drawing') return;
    this.status = 'running';
    this.vehicle.motorOn = true;
  }

  /** Tap to boost. Returns false while cooling down. */
  boost(): boolean {
    if (this.status !== 'running' || this.steps < this.boostReadyAt) return false;
    this.boostUntil = this.steps + stepsFor(BOOST.durationMs * this.vehicle.config.boostLength);
    this.boostReadyAt = this.steps + stepsFor(BOOST.cooldownMs);
    this.boosts.push(this.steps);
    this.events.push({ type: 'boost' });
    return true;
  }

  /** Replays recorded boosts (solver test, replays). */
  scheduleBoosts(steps: readonly number[]): void {
    this.scheduledBoosts = new Set(steps);
  }

  get boosting(): boolean {
    return this.status === 'running' && this.steps < this.boostUntil;
  }

  /** 1 right after a boost, falling to 0 when the next boost is ready. */
  get boostCooldown(): number {
    if (this.status !== 'running') return 0;
    return Math.max(0, (this.boostReadyAt - this.steps) / stepsFor(BOOST.cooldownMs));
  }

  /**
   * Advance one fixed physics step. Does nothing while drawing (the world is frozen).
   * After a win or crash the world keeps moving (debris settles) but the clock stops.
   */
  step(): void {
    if (this.status === 'drawing') return;
    if (this.status === 'running' && this.scheduledBoosts.has(this.steps)) this.boost();
    this.vehicle.drive(this.boosting);
    this.vehicle.wheelContacts.fill(false);
    this.movePlatforms(this.steps + 1);
    this.applyWind();
    Engine.update(this.engine, STEP_MS);
    this.steps++;
    this.applyErasers();
    this.lastSnaps = updateBreaks(this.strokes);
    for (const snap of this.lastSnaps) {
      this.snaps++;
      this.events.push({ type: 'snap', at: snap.at });
    }
    if (this.status === 'running') {
      this.checkLanding();
      this.checkCheckpoint();
      this.checkEnd();
    }
  }

  /** Time left on a timed level (null when the level has no time limit). */
  get timeLeftMs(): number | null {
    return this.level.timeLimitMs === undefined ? null : Math.max(0, this.level.timeLimitMs - this.elapsedMs);
  }

  get elapsedMs(): number {
    return (this.finishStep ?? this.steps) * STEP_MS;
  }

  private checkLanding(): void {
    const grounded = this.vehicle.grounded;
    if (grounded && !this.wasGrounded && this.prevVy > 1.5) this.events.push({ type: 'land', impact: this.prevVy });
    this.wasGrounded = grounded;
    this.prevVy = this.vehicle.chassis.velocity.y;
  }

  private checkEnd(): void {
    const v = this.vehicle;
    const { flag } = this.level;
    const w = v.frontWheel.position;
    if (w.x >= flag.x && w.x <= flag.x + flag.w && w.y >= flag.y && w.y <= flag.y + flag.h) {
      this.finish('won');
      return;
    }
    const lowest = Math.max(v.chassis.bounds.max.y, ...v.wheels.map((b) => b.bounds.max.y));
    if (lowest >= this.size.height - PHYSICS.fallMargin) return this.crash('fell');

    const tilt = Math.abs(Math.atan2(Math.sin(v.chassis.angle), Math.cos(v.chassis.angle)));
    this.flippedSteps = tilt > v.config.maxTilt ? this.flippedSteps + 1 : 0;
    if (this.flippedSteps >= stepsFor(CRASH.flippedMs)) return this.crash('flipped');

    // Stalled = no forward progress (rocking back and forth in a dip counts as stuck).
    if (v.chassis.position.x > this.progressX + CRASH.progressPx) {
      this.progressX = v.chassis.position.x;
      this.stalledSteps = 0;
    } else this.stalledSteps++;
    if (this.stalledSteps >= stepsFor(this.options.stallMs ?? CRASH.stallMs)) return this.crash('stalled');

    if (this.level.timeLimitMs !== undefined && this.steps * STEP_MS > this.level.timeLimitMs) this.crash('timeout');
  }

  private checkCheckpoint(): void {
    const cp = this.level.checkpoint;
    if (!cp || this.checkpointReached || this.vehicle.chassis.position.x <= cp[0]) return;
    this.checkpointReached = true;
    this.events.push({ type: 'checkpoint' });
  }

  /** Adds a moving platform; its cycle starts now (`born`), so platforms added mid-run do not jump. */
  addPlatform(def: PlatformDef): PlatformState {
    const verts = Vertices.clockwiseSort(def.points.map((p) => ({ ...toPoint(p) })));
    const centre = Vertices.centre(verts);
    const body = Body.create({
      position: centre,
      vertices: verts,
      isStatic: true,
      friction: PLATFORM.friction,
      frictionStatic: PLATFORM.frictionStatic,
      label: 'platform',
      collisionFilter: { category: CAT.terrain, mask: CAT.stroke | CAT.vehicle },
    });
    const state: PlatformState = { body, def, born: this.steps, nails: [] };
    const base = { x: body.position.x, y: body.position.y };
    platformBase.set(body, base);
    this.platforms.push(state);
    Body.setPosition(body, offsetPosition(base, def, 0));
    Composite.add(this.engine.world, body);
    // Nails on the platform snap strokes like world nails, but pin to the platform body.
    const o = platformOffset(def, 0);
    for (const n of def.nails ?? []) {
      const at = { x: n[0] + o.x, y: n[1] + o.y };
      state.nails.push({ at, rel: { x: at.x - body.position.x, y: at.y - body.position.y } });
      this.addAnchor(at, body);
    }
    return state;
  }

  removePlatform(state: PlatformState): void {
    const i = this.platforms.indexOf(state);
    if (i !== -1) this.platforms.splice(i, 1);
    this.removeAnchors(state.nails.map((n) => n.at));
    Composite.remove(this.engine.world, state.body);
  }

  /** Puts every platform where it belongs after `step` steps, giving it the velocity to carry riders. */
  private movePlatforms(step: number): void {
    // Matter supports a third argument (updateVelocity); the bundled types only list two.
    const setPosition = Body.setPosition as (b: Matter.Body, pos: Matter.Vector, updateVelocity?: boolean) => void;
    for (const p of this.platforms) {
      setPosition(p.body, offsetPosition(platformBase.get(p.body)!, p.def, (step - p.born) * STEP_MS), true);
      // Endless: nails follow their platform so strokes drawn mid-run snap to where the nail is now.
      if (!this.options.liveAnchors) continue;
      for (const n of p.nails) {
        n.at.x = p.body.position.x + n.rel.x;
        n.at.y = p.body.position.y + n.rel.y;
      }
    }
  }

  /** Wind: a force on vehicle parts and live line segments inside a zone, giving `force` px/step^2. */
  private applyWind(): void {
    const zones = this.level.wind;
    if (!zones?.length) return;
    const k = WIND.scale / (STEP_MS * STEP_MS);
    const push = (b: Matter.Body) => {
      for (const z of zones) {
        if (b.position.x < z.x || b.position.x > z.x + z.w || b.position.y < z.y || b.position.y > z.y + z.h) continue;
        Body.applyForce(b, b.position, { x: z.force[0] * k * b.mass, y: z.force[1] * k * b.mass });
      }
    };
    if (this.status === 'running') {
      push(this.vehicle.chassis);
      this.vehicle.wheels.forEach(push);
    }
    for (const s of this.strokes) s.segments.forEach((b, i) => !s.erased[i] && push(b));
  }

  /** Eraser zones rub out any line segment whose centre is inside. */
  private applyErasers(): void {
    const zones = this.level.erasers;
    if (!zones?.length) return;
    for (const s of this.strokes) {
      s.segments.forEach((b, i) => {
        if (s.erased[i]) return;
        const { x, y } = b.position;
        if (!zones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)) return;
        const at = s.erase(i);
        if (at) this.events.push({ type: 'erase', at });
      });
    }
  }

  private finish(status: 'won' | 'crashed'): void {
    this.status = status;
    this.finishStep = this.steps;
    this.vehicle.motorOn = false;
    if (status === 'won') this.events.push({ type: 'won' });
  }

  private crash(reason: CrashReason): void {
    this.crashReason = reason;
    const at = { ...this.vehicle.chassis.position };
    this.finish('crashed');
    // The vehicle bursts into pieces (drawn by the scene), so it leaves the physics world.
    Composite.remove(this.engine.world, this.vehicle.composite, true);
    this.events.push({ type: 'crashed', reason, at });
  }

  private spawnVehicle(): void {
    // level.start is the ground point under the vehicle, so any vehicle spawns resting on its wheels.
    const config = getVehicle(this.vehicleId);
    const useCheckpoint = this.options.fromCheckpoint === true && this.level.checkpoint !== undefined;
    const ground = toPoint(useCheckpoint ? this.level.checkpoint! : this.level.start);
    const reach = Math.max(...config.wheels.map((w) => w.y + w.r));
    this.vehicle = new Vehicle(config, { x: ground.x, y: ground.y - reach - (useCheckpoint ? CHECKPOINT.spawnGap : 1) });
    Composite.add(this.engine.world, this.vehicle.composite);
  }
}

/** Rebuilds a fresh simulation with the same strokes, used by Retry. */
export interface SimOptions {
  /** Start at the level's checkpoint instead of the start (long levels, after passing it). */
  fromCheckpoint?: boolean;
  /** Stall time (ms) before a no-progress crash; defaults to CRASH.stallMs. */
  stallMs?: number;
  /** Nails on moving platforms keep following them (endless, where strokes are drawn mid-run). */
  liveAnchors?: boolean;
}

/** A moving platform at runtime. */
export interface PlatformState {
  body: Matter.Body;
  def: PlatformDef;
  /** Step on which its cycle began (0 for campaign platforms). */
  born: number;
  /** Its nails: current world position and offset from the platform body. */
  nails: { at: Point; rel: Point }[];
}

/** Where each platform body sits at the start of its cycle's path (its centre before any offset). */
const platformBase = new WeakMap<Matter.Body, Point>();

/** Offset of a platform from its path start after `t` ms of running: sine-eased there and back. */
function platformOffset(def: PlatformDef, t: number): Point {
  const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / def.periodMs + (def.phase ?? 0)));
  return { x: def.move[0] * k, y: def.move[1] * k };
}

function offsetPosition(base: Point, def: PlatformDef, t: number): Point {
  const o = platformOffset(def, t);
  return { x: base.x + o.x, y: base.y + o.y };
}

export function rebuild(sim: Simulation, options: SimOptions = {}): Simulation {
  const next = new Simulation(sim.level, sim.pen.id, sim.vehicleId, options);
  for (const s of sim.strokes) next.addBuilt(s.stroke);
  return next;
}
