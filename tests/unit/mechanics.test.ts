import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { STEP_MS } from '../../src/config/world';
import type { LevelData } from '../../src/game/Level';
import { toPoint } from '../../src/physics/geometry';
import { Simulation, rebuild, type SimEvent } from '../../src/physics/Simulation';

function baseLevel(extra: Partial<LevelData> = {}): LevelData {
  return {
    id: 'mech', name: 'Mech', notebook: 0, index: 0,
    terrain: [{ points: [[0, 600], [480, 600], [480, 854], [0, 854]] }],
    anchors: [[100, 400], [300, 400]],
    start: [60, 599], flag: { x: 460, y: 500, w: 20, h: 100 }, ink: 1000, stars: { ink: 100, timeMs: 5000 },
    solution: { strokes: [[[0, 0], [10, 0]]] },
    ...extra,
  };
}

/** A level where the ground is only a moving platform under the start. */
function platformLevel(extra: Partial<LevelData> = {}): LevelData {
  return baseLevel({
    terrain: [{ points: [[0, 700], [10, 700], [10, 854], [0, 854]] }],
    start: [100, 599],
    platforms: [{ points: [[40, 600], [200, 600], [200, 620], [40, 620]], move: [100, 0], periodMs: 4000 }],
    ...extra,
  });
}

const stepN = (sim: Simulation, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
const eventsOf = (sim: Simulation, type: SimEvent['type']) => sim.events.filter((e) => e.type === type);

describe('moving platforms', () => {
  it('moves along its path and back, frozen while drawing', () => {
    const sim = new Simulation(baseLevel({
      platforms: [{ points: [[40, 300], [100, 300], [100, 320], [40, 320]], move: [0, 120], periodMs: 2000 }],
    }));
    const body = sim.platforms[0]!.body;
    const y0 = body.position.y;
    stepN(sim, 30);
    expect(body.position.y).toBe(y0);
    sim.start();
    stepN(sim, 60); // half period
    expect(body.position.y - y0).toBeCloseTo(120, 0);
    stepN(sim, 60);
    expect(body.position.y - y0).toBeCloseTo(0, 0);
  });

  it('honours phase', () => {
    const sim = new Simulation(baseLevel({
      platforms: [{ points: [[40, 300], [100, 300], [100, 320], [40, 320]], move: [100, 0], periodMs: 2000, phase: 0.5 }],
    }));
    const body = sim.platforms[0]!.body;
    expect(body.position.x - 70).toBeCloseTo(100, 5);
  });

  it('carries a vehicle parked on it', () => {
    const sim = new Simulation(platformLevel());
    sim.start();
    sim.vehicle.motorOn = false;
    const x0 = sim.vehicle.chassis.position.x;
    stepN(sim, 60);
    // Platform moved about 50px by now (sine eased half way through its half trip).
    const moved = sim.platforms[0]!.body.position.x - 120;
    expect(moved).toBeGreaterThan(20);
    const carried = sim.vehicle.chassis.position.x - x0;
    expect(carried).toBeGreaterThan(moved * 0.7);
    expect(sim.status).toBe('running');
  });

  it('pins a stroke end to a platform nail so the line moves with it', () => {
    const level = baseLevel({
      platforms: [{ points: [[40, 500], [100, 500], [100, 520], [40, 520]], move: [100, 0], periodMs: 2000, nails: [[70, 500]] }],
      anchors: [[300, 500]],
    });
    const sim = new Simulation(level);
    expect(sim.anchors).toHaveLength(2);
    const chain = sim.addStroke([toPoint([300, 500]), toPoint([200, 500]), toPoint([72, 502])])!;
    expect(chain.stroke.endAnchor).toBe(1);
    const platform = sim.platforms[0]!.body;
    expect(chain.pins.some((c) => c.bodyA === platform)).toBe(true);
    const end0 = chain.segmentEnds(chain.segments.length - 1)[1];
    sim.start();
    sim.vehicle.motorOn = false;
    stepN(sim, 60);
    const end1 = chain.segmentEnds(chain.segments.length - 1)[1];
    const dx = platform.position.x - 70;
    expect(dx).toBeGreaterThan(30);
    expect(end1.x - end0.x).toBeGreaterThan(dx * 0.8);
  });
});

describe('wind', () => {
  it('changes a free segment velocity by about the configured force each step', () => {
    const sim = new Simulation(baseLevel({
      wind: [{ x: 0, y: 0, w: 480, h: 500, force: [0.05, 0] }],
    }));
    sim.engine.gravity.y = 0;
    const chain = sim.addStroke([toPoint([200, 300]), toPoint([260, 300])])!;
    sim.start();
    sim.vehicle.motorOn = false;
    const seg = chain.segments[0]!;
    const vx0 = seg.velocity.x;
    sim.step();
    expect(seg.velocity.x - vx0).toBeCloseTo(0.05, 3);
    sim.step();
    expect(seg.velocity.x - vx0).toBeCloseTo(0.1, 2);
    expect(seg.velocity.y).toBeCloseTo(0, 5);
  });

  it('pushes the vehicle but not bodies outside the zone', () => {
    const inside = new Simulation(baseLevel({ wind: [{ x: 0, y: 400, w: 480, h: 300, force: [-0.05, 0] }] }));
    const outside = new Simulation(baseLevel());
    for (const s of [inside, outside]) {
      s.start();
      s.vehicle.motorOn = false;
      stepN(s, 40);
    }
    expect(inside.vehicle.chassis.position.x).toBeLessThan(outside.vehicle.chassis.position.x - 1);
  });
});

describe('eraser zones', () => {
  const level = () => baseLevel({ erasers: [{ x: 180, y: 380, w: 40, h: 40 }] });

  it('rubs out segments in the zone, emits erase events and splits the runs', () => {
    const sim = new Simulation(level());
    const chain = sim.addStroke([toPoint([100, 400]), toPoint([300, 400])])!;
    expect(chain.runs()).toHaveLength(1);
    const count = chain.segments.length;
    const inInk = sim.inkUsed;
    sim.start();
    sim.vehicle.motorOn = false;
    sim.step();
    const erased = chain.erased.filter(Boolean).length;
    expect(erased).toBeGreaterThan(0);
    expect(erased).toBeLessThan(count);
    expect(eventsOf(sim, 'erase')).toHaveLength(erased);
    expect(chain.runs()).toHaveLength(2);
    expect(sim.inkUsed).toBe(inInk);
    // Erased bodies left the world; the rest stays. Events are once per segment.
    const bodies = Matter.Composite.allBodies(sim.engine.world);
    chain.segments.forEach((b, i) => expect(bodies.includes(b)).toBe(!chain.erased[i]));
    sim.events = [];
    stepN(sim, 20);
    expect(eventsOf(sim, 'erase')).toHaveLength(0);
  });

  it('erases lines that drift into the zone while running, never while drawing', () => {
    const sim = new Simulation(level());
    const chain = sim.addStroke([toPoint([100, 400]), toPoint([300, 400])])!;
    stepN(sim, 10);
    expect(chain.erased.some(Boolean)).toBe(false);
    sim.start();
    stepN(sim, 5);
    expect(chain.erased.some(Boolean)).toBe(true);
  });

  it('removes nails on an erased end segment', () => {
    const sim = new Simulation(baseLevel({ erasers: [{ x: 90, y: 380, w: 30, h: 40 }] }));
    const chain = sim.addStroke([toPoint([100, 400]), toPoint([300, 400])])!;
    sim.start();
    sim.step();
    expect(chain.erased[0]).toBe(true);
    const world = Matter.Composite.allConstraints(sim.engine.world);
    expect(world.some((c) => chain.pins.includes(c) && c.bodyB === chain.segments[0])).toBe(false);
  });
});

describe('checkpoint', () => {
  const level = () => baseLevel({ checkpoint: [200, 599] });

  it('fires once when the chassis passes it', () => {
    const sim = new Simulation(level());
    sim.start();
    let fired = 0;
    while (sim.status === 'running' && sim.steps < 900) {
      sim.step();
      fired += eventsOf(sim, 'checkpoint').length;
      sim.events = [];
    }
    expect(sim.checkpointReached).toBe(true);
    expect(fired).toBe(1);
  });

  it('fromCheckpoint spawns there without an event, and rebuild passes it on', () => {
    const first = new Simulation(level());
    first.addStroke([toPoint([100, 400]), toPoint([300, 400])]);
    const sim = rebuild(first, { fromCheckpoint: true });
    expect(sim.strokes).toHaveLength(1);
    expect(sim.checkpointReached).toBe(true);
    expect(sim.vehicle.chassis.position.x).toBeGreaterThan(190);
    expect(sim.vehicle.chassis.position.x).toBeLessThan(210);
    sim.start();
    stepN(sim, 120);
    expect(eventsOf(sim, 'checkpoint')).toHaveLength(0);
    expect(sim.vehicle.chassis.position.y).toBeLessThan(600);
  });
});

describe('time limit', () => {
  it('crashes with timeout when time runs out', () => {
    const sim = new Simulation(baseLevel({ timeLimitMs: 500, flag: { x: 400, y: 100, w: 20, h: 20 } }));
    sim.start();
    while (sim.status === 'running' && sim.steps < 300) sim.step();
    expect(sim.crashReason).toBe('timeout');
    expect(sim.steps * STEP_MS).toBeGreaterThan(500);
    expect(sim.timeLeftMs).toBe(0);
  });

  it('lets a win on the last step stand', () => {
    const sim = new Simulation(baseLevel({ timeLimitMs: 60000 }));
    sim.start();
    while (sim.status === 'running' && sim.steps < 900) sim.step();
    expect(sim.status).toBe('won');
  });
});

describe('determinism', () => {
  it('two identical runs with platforms and wind match exactly', () => {
    const make = () => {
      const sim = new Simulation(platformLevel({
        wind: [{ x: 0, y: 300, w: 480, h: 300, force: [0.03, -0.01] }],
      }));
      sim.addStroke([toPoint([100, 400]), toPoint([300, 400])]);
      sim.start();
      stepN(sim, 200);
      return [sim.vehicle.chassis.position, sim.platforms[0]!.body.position, ...sim.strokes[0]!.segments.map((s) => s.position)];
    };
    expect(make()).toEqual(make());
  });
});
