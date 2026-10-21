import Matter from 'matter-js';
import { PHYSICS, STEP_MS } from '../config/world';
import { PENS, type PenConfig, type PenId } from '../config/pens';
import { getVehicle, type VehicleId } from '../config/vehicles';
import { anchorPoints, levelSize, terrainPolygons, type LevelData } from '../game/Level';
import { BridgeChain } from './BridgeChain';
import { CAT } from './categories';
import { toPoint, type Point } from './geometry';
import { buildStroke, type BuiltStroke } from './StrokeBuilder';
import { Vehicle } from './Vehicle';

const { Body, Composite, Engine, Vertices } = Matter;

export type SimStatus = 'drawing' | 'running' | 'won' | 'crashed';

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
  steps = 0;
  inkTotal: number;
  private nextStrokeId = 0;

  constructor(
    readonly level: LevelData,
    penId: PenId = level.pen ?? 'pencil',
    readonly vehicleId: VehicleId = level.vehicle ?? 'paperCar',
  ) {
    this.pen = PENS[penId];
    this.inkTotal = Math.round(level.ink * this.pen.inkMultiplier);
    this.anchors = anchorPoints(level);
    this.engine = Engine.create({
      gravity: { x: 0, y: PHYSICS.gravityY },
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      constraintIterations: PHYSICS.constraintIterations,
    });
    for (const poly of terrainPolygons(level)) {
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
    }
    Composite.add(this.engine.world, this.terrain);
    this.spawnVehicle();
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
    const chain = new BridgeChain(this.nextStrokeId++, built, this.pen);
    this.strokes.push(chain);
    Composite.add(this.engine.world, chain.composite);
    return chain;
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

  /** Advance one fixed physics step. Does nothing while drawing (the world is frozen). */
  step(): void {
    if (this.status !== 'running') return;
    this.vehicle.drive();
    Engine.update(this.engine, STEP_MS);
    this.steps++;
    this.checkEnd();
  }

  get elapsedMs(): number {
    return this.steps * STEP_MS;
  }

  private checkEnd(): void {
    const { flag } = this.level;
    const w = this.vehicle.frontWheel.position;
    if (w.x >= flag.x && w.x <= flag.x + flag.w && w.y >= flag.y && w.y <= flag.y + flag.h) {
      this.status = 'won';
      return;
    }
    if (this.vehicle.chassis.position.y > this.size.height + PHYSICS.fallMargin) this.status = 'crashed';
  }

  private spawnVehicle(): void {
    this.vehicle = new Vehicle(getVehicle(this.vehicleId), toPoint(this.level.start));
    Composite.add(this.engine.world, this.vehicle.composite);
  }
}

/** Rebuilds a fresh simulation with the same strokes, used by Retry. */
export function rebuild(sim: Simulation): Simulation {
  const next = new Simulation(sim.level, sim.pen.id, sim.vehicleId);
  for (const s of sim.strokes) next.addBuilt(s.stroke);
  return next;
}
