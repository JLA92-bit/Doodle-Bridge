import { readFileSync, readdirSync } from 'node:fs';
import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { CHUNK, DIFFICULTY, ENDLESS } from '../../src/config/endless';
import { generateChunk } from '../../src/endless/ChunkGenerator';
import { difficultyAt } from '../../src/endless/Difficulty';
import { EndlessRun, replayRun } from '../../src/endless/EndlessRun';
import { PX_PER_M, type Chunk, type EndlessEvent } from '../../src/endless/types';
import { isConvex, toPoint, type Point, type PointTuple } from '../../src/physics/geometry';
import { Simulation } from '../../src/physics/Simulation';
import { runBot } from './endlessBot';

/** Generates `n` chunks the way EndlessRun does: each continues from the previous one. */
function course(seed: number, n: number, startX = ENDLESS.startX - 120): Chunk[] {
  const out: Chunk[] = [];
  let x = startX;
  let y = ENDLESS.runwayY;
  for (let i = 0; i < n; i++) {
    const c = generateChunk(seed, i, x, y, difficultyAt(Math.max(0, x - ENDLESS.startX) / PX_PER_M));
    out.push(c);
    x = c.x1;
    y = c.exitY;
  }
  return out;
}

/** Height of the ground top edge at x within a chunk (null over a void). */
function groundAt(c: Chunk, x: number): number | null {
  for (const t of c.terrain) {
    const [a, b] = [t.points[0]!, t.points[1]!];
    if (x >= a[0] - 0.01 && x <= b[0] + 0.01) return b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return null;
}

const allocBodies = (run: EndlessRun) => Matter.Composite.allBodies(run.sim.engine.world).length;

describe('difficulty', () => {
  it('ramps every 250 m and stays fair', () => {
    expect(difficultyAt(0).tier).toBe(0);
    expect(difficultyAt(249.9).tier).toBe(0);
    expect(difficultyAt(250).tier).toBe(1);
    expect(difficultyAt(1250).tier).toBe(5);
    let prev = difficultyAt(0);
    for (let tier = 1; tier < 30; tier++) {
      const d = difficultyAt(tier * 250);
      expect(d.gapScale).toBeGreaterThanOrEqual(prev.gapScale);
      expect(d.anchorChance).toBeLessThanOrEqual(prev.anchorChance);
      expect(d.anchorChance).toBeGreaterThanOrEqual(0.5);
      expect(d.speed).toBeGreaterThanOrEqual(prev.speed);
      expect(d.speed).toBeLessThanOrEqual(1.8);
      expect(d.types.length).toBeGreaterThanOrEqual(prev.types.length);
      prev = d;
    }
    expect(difficultyAt(100000).speed).toBe(1.8);
  });

  it('adds chunk types tier by tier', () => {
    expect(difficultyAt(0).types).toEqual(['flat', 'gap']);
    expect(difficultyAt(250).types).toEqual(['flat', 'gap', 'doubleGap', 'rampGap']);
    expect(difficultyAt(500).types).toContain('pitIsland');
    expect(difficultyAt(750).types).toContain('platform');
    expect(difficultyAt(1000).types).toContain('wind');
    expect(difficultyAt(1250).types).toContain('eraser');
    expect(difficultyAt(0).types).not.toContain('doubleGap');
    expect(DIFFICULTY.typesByTier).toHaveLength(6);
  });
});

describe('chunk generator', () => {
  it('gives identical chunks for the same seed and different ones for another', () => {
    expect(JSON.stringify(course(42, 40))).toBe(JSON.stringify(course(42, 40)));
    expect(JSON.stringify(course(42, 40))).not.toBe(JSON.stringify(course(43, 40)));
    // A chunk depends only on (seed, index), not on how many came before it.
    const a = course(7, 12)[11]!;
    const b = generateChunk(7, 11, a.x0, course(7, 12)[10]!.exitY, difficultyAt((a.x0 - ENDLESS.startX) / PX_PER_M));
    expect(b).toEqual(a);
  });

  it('starts with a long flat runway', () => {
    const first = course(1, 1)[0]!;
    expect(first.type).toBe('flat');
    expect(first.x1 - first.x0).toBeGreaterThanOrEqual(1000);
    expect(first.gaps).toHaveLength(0);
    expect(first.terrain).toHaveLength(1);
  });

  it('builds a continuous, convex course inside the page, with every chunk type', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      // Start far out so every tier (and every chunk type) is in play.
      const chunks = course(seed, 60);
      let prev: Chunk | null = null;
      for (const c of chunks) {
        seen.add(c.type);
        if (prev) {
          expect(c.x0).toBe(prev.x1);
          expect(c.index).toBe(prev.index + 1);
        }
        expect(c.x1).toBeGreaterThan(c.x0);
        for (const t of c.terrain) {
          expect(isConvex(t.points.map(toPoint))).toBe(true);
          const [a, b, c2, d] = t.points as [PointTuple, PointTuple, PointTuple, PointTuple];
          expect(a[1]).toBeGreaterThanOrEqual(CHUNK.minY);
          expect(a[1]).toBeLessThanOrEqual(CHUNK.maxY);
          expect(b[1]).toBeGreaterThanOrEqual(CHUNK.minY);
          expect(b[1]).toBeLessThanOrEqual(CHUNK.maxY);
          expect(c2[1]).toBe(854);
          expect(d[1]).toBe(854);
        }
        expect(c.exitY).toBeGreaterThanOrEqual(CHUNK.minY);
        expect(c.exitY).toBeLessThanOrEqual(CHUNK.maxY);
        c.platforms.forEach((p) => expect(isConvex(p.points.map(toPoint))).toBe(true));
        prev = c;
      }
    }
    expect([...seen].sort()).toEqual(['doubleGap', 'eraser', 'flat', 'gap', 'pitIsland', 'platform', 'rampGap', 'wind']);
  });

  it('keeps every gap crossable: nails allow the width, exits barely uphill, big pits have inner nails', () => {
    const near = (c: Chunk, x: number) => c.anchors.filter((a) => Math.abs(a[0] - x) < 0.5).length > 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const c of course(seed, 60)) {
        for (const g of c.gaps) {
          const w = g.x1 - g.x0;
          const left = near(c, g.x0);
          const right = near(c, g.x1);
          const inner = c.anchors.filter((a) => a[0] > g.x0 + 0.5 && a[0] < g.x1 - 0.5).length;
          if (c.type === 'pitIsland' || c.type === 'platform' || c.type === 'eraser') {
            expect(inner).toBeGreaterThanOrEqual(c.type === 'eraser' ? 1 : 2);
            expect(g.expectedInk).toBeGreaterThan(0);
          } else {
            const cap = left && right ? CHUNK.maxSpan : left || right ? CHUNK.maxOneNailSpan : CHUNK.maxFreeSpan;
            expect(w).toBeLessThanOrEqual(cap + 0.1);
            expect(w).toBeGreaterThan(30);
            const yl = groundAt(c, g.x0);
            const yr = groundAt(c, g.x1);
            expect(yl).not.toBeNull();
            expect(yr).not.toBeNull();
            expect(yl! - yr!).toBeLessThanOrEqual(20);
          }
        }
      }
    }
  });

  it('puts nails at gap edges at roughly the difficulty chance, never below half', () => {
    let edges = 0;
    let nails = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const c of course(seed, 120)) {
        if (c.type !== 'gap' || c.x0 < 30000) continue; // tier 6 and beyond: chance is at its floor
        for (const g of c.gaps) {
          edges += 2;
          nails += c.anchors.filter((a) => Math.abs(a[0] - g.x0) < 0.5 || Math.abs(a[0] - g.x1) < 0.5).length;
        }
      }
    }
    expect(edges).toBeGreaterThan(40);
    expect(nails / edges).toBeGreaterThan(0.4);
    expect(nails / edges).toBeLessThan(0.7);
  });

  it('places ink pots over many gaps, within reach of the bridge line', () => {
    const chunks = course(5, 80);
    const gapChunks = chunks.filter((c) => c.gaps.length > 0);
    const withPots = gapChunks.filter((c) => c.inkPots.length > 0);
    expect(withPots.length / gapChunks.length).toBeGreaterThan(0.6);
    for (const c of withPots) {
      for (const [x, y] of c.inkPots) {
        expect(x).toBeGreaterThan(c.x0);
        expect(x).toBeLessThan(c.x1);
        expect(y).toBeLessThan(CHUNK.maxY);
        expect(y).toBeGreaterThan(CHUNK.minY - 120);
      }
    }
  });

  it('contains no em dashes in the endless sources', () => {
    const files = [
      ...readdirSync('src/endless').map((f) => `src/endless/${f}`),
      'src/config/endless.ts',
      'src/physics/Simulation.ts',
      'tests/unit/endless.test.ts',
      'tests/unit/endlessBot.ts',
    ];
    for (const f of files) expect(readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014)), f).toBe(false);
  });
});

describe('moving platform nails', () => {
  it('follow their platform when anchors are live, and platforms added later start their cycle then', () => {
    const level = {
      id: 'x', name: 'x', notebook: 0, index: 0, terrain: [], anchors: [], start: [100, 599] as [number, number],
      flag: { x: 1e9, y: 0, w: 1, h: 1 }, ink: 500, stars: { ink: 1, timeMs: 1 }, solution: { strokes: [] },
    };
    const sim = new Simulation(level, 'pencil', 'paperCar', { liveAnchors: true });
    sim.start();
    for (let i = 0; i < 30; i++) sim.step();
    const p = sim.addPlatform({ points: [[300, 300], [380, 300], [380, 316], [300, 316]], move: [0, 60], periodMs: 2000, nails: [[300, 300]] });
    const nail = sim.anchors[sim.anchors.length - 1]!;
    expect(nail).toEqual({ x: 300, y: 300 });
    const y0 = p.body.position.y;
    for (let i = 0; i < 60; i++) sim.step(); // half a period after it was added
    expect(p.body.position.y - y0).toBeCloseTo(60, 0);
    expect(nail.y).toBeCloseTo(360, 0);
    sim.removePlatform(p);
    expect(sim.anchors).not.toContain(nail);
    expect(sim.platforms).toHaveLength(0);
  });
});

describe('EndlessRun', () => {
  it('drives from the first step with the world ahead already built', () => {
    const run = new EndlessRun(3);
    expect(run.status).toBe('running');
    expect(run.inkLeft).toBe(run.inkTotal);
    expect(run.inkTotal).toBe(ENDLESS.ink);
    expect(run.chunks.at(-1)!.x1).toBeGreaterThanOrEqual(run.vehicle.chassis.position.x + ENDLESS.aheadPx);
    const x0 = run.vehicle.chassis.position.x;
    for (let i = 0; i < 120; i++) run.step();
    expect(run.vehicle.chassis.position.x).toBeGreaterThan(x0 + 100);
    expect(run.distanceM).toBeCloseTo((run.vehicle.chassis.position.x - ENDLESS.startX) / PX_PER_M, 6);
    expect(run.distanceM).toBeGreaterThan(5);
    expect(run.steps).toBe(120);
    expect(run.difficulty.tier).toBe(0);
  });

  it('applies the pen multiplier to the ink and the difficulty speed to the vehicle', () => {
    expect(new EndlessRun(1, 'paperCar', 'marker').inkTotal).toBe(Math.round(ENDLESS.ink * 0.7));
    expect(new EndlessRun(1, 'paperCar', 'crayon').inkTotal).toBe(Math.round(ENDLESS.ink * 1.3));
    const { run } = runBot(2, { maxM: 260 });
    expect(run.events.some((e) => e.type === 'tier' && e.tier === 1)).toBe(true);
    expect(run.vehicle.speedScale).toBeCloseTo(difficultyAt(250).speed, 6);
    expect(run.vehicle.speedScale).toBeGreaterThan(1);
  });

  it('spends ink on strokes, clips to what is left, refills over time and from pots', () => {
    const run = new EndlessRun(3);
    // A tap draws nothing.
    expect(run.addStroke([{ x: 500, y: 300 }, { x: 503, y: 300 }])).toBeNull();
    const chain = run.addStroke([{ x: 400, y: 300 }, { x: 500, y: 300 }])!;
    expect(chain).not.toBeNull();
    expect(chain.stroke.length).toBeGreaterThan(90);
    expect(run.inkLeft).toBeCloseTo(run.inkTotal - chain.stroke.length, 3);
    const after = run.inkLeft;
    for (let i = 0; i < 60; i++) run.step();
    expect(run.inkLeft - after).toBeCloseTo(ENDLESS.inkRefillPerSec, 1);
    // Far more than the ink left: clipped, ink hits zero, no more strokes.
    const long = Array.from({ length: 200 }, (_, i) => ({ x: 400 + i * 12, y: 200 }));
    const big = run.addStroke(long)!;
    expect(big.stroke.length).toBeLessThanOrEqual(after + ENDLESS.inkRefillPerSec + 1);
    expect(run.inkLeft).toBeLessThan(1);
    expect(run.addStroke([{ x: 400, y: 100 }, { x: 500, y: 100 }])).toBeNull();
    // An ink pot on the chassis refills it, once.
    const c = run.vehicle.chassis.position;
    run.inkPots.push({ at: { x: c.x + 20, y: c.y }, taken: false });
    const before = run.inkLeft;
    run.events.length = 0;
    for (let i = 0; i < 30; i++) run.step();
    const pots = run.events.filter((e) => e.type === 'inkPot');
    expect(pots).toHaveLength(1);
    expect(run.inkLeft - before).toBeGreaterThan(ENDLESS.inkPotRefill);
    expect(run.inkLeft).toBeLessThanOrEqual(run.inkTotal);
  });

  it('crashes by falling into the first gap when nothing is drawn, then keeps the course frozen', () => {
    const run = new EndlessRun(9);
    while (run.status === 'running' && run.steps < 60 * 40) run.step();
    expect(run.status).toBe('crashed');
    expect(run.crashReason).toBe('fell');
    expect(run.events.some((e) => e.type === 'crashed')).toBe(true);
    expect(run.addStroke([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBeNull();
    const n = run.steps;
    run.step();
    expect(run.steps).toBe(n + 1);
    expect(run.status).toBe('crashed');
  });

  it('reports air time on landing', () => {
    const run = new EndlessRun(3);
    for (let i = 0; i < 30; i++) run.step();
    // Lift the whole vehicle well off the runway and let it drop.
    for (const b of Matter.Composite.allBodies(run.vehicle.composite)) Matter.Body.setPosition(b, { x: b.position.x, y: b.position.y - 250 });
    run.events.length = 0;
    for (let i = 0; i < 120; i++) run.step();
    const air = run.events.find((e): e is Extract<EndlessEvent, { type: 'air' }> => e.type === 'air');
    expect(air).toBeDefined();
    expect(air!.ms).toBeGreaterThanOrEqual(ENDLESS.airMs);
  });

  it('reports a close call when a line snaps under a wheel', () => {
    const run = new EndlessRun(3);
    for (let i = 0; i < 30; i++) run.step();
    const w = run.vehicle.frontWheel.position;
    const chain = run.addStroke([{ x: w.x - 30, y: w.y }, { x: w.x + 30, y: w.y }])!;
    run.events.length = 0;
    const link = chain.links[0]!;
    // Pretend the joint just snapped; the wheel overlaps the line.
    (run.sim as unknown as { lastSnaps: unknown[] }).lastSnaps = [{ chain, link, at: { x: w.x, y: w.y } }];
    (run as unknown as { checkCloseCalls(): void }).checkCloseCalls();
    expect(run.events.filter((e) => e.type === 'closeCall')).toHaveLength(1);
    // And not when the line is far from the wheels.
    const far = run.addStroke([{ x: w.x + 300, y: w.y - 200 }, { x: w.x + 360, y: w.y - 200 }])!;
    run.events.length = 0;
    (run.sim as unknown as { lastSnaps: unknown[] }).lastSnaps = [{ chain: far, link: far.links[0] ?? link, at: { x: w.x + 300, y: w.y - 200 } }];
    (run as unknown as { checkCloseCalls(): void }).checkCloseCalls();
    expect(run.events.filter((e) => e.type === 'closeCall')).toHaveLength(0);
  });
});

describe('bot (headless sanity check)', () => {
  it('bridges ordinary gaps with straight lines and survives 300 m on fixed seeds, with crossing and ink pot events', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { run, gaps } = runBot(seed, { maxM: 320 });
      expect(run.status, `seed ${seed} ${run.crashReason} at ${run.distanceM.toFixed(0)} m`).toBe('running');
      expect(run.distanceM).toBeGreaterThanOrEqual(320);
      expect(gaps).toBeGreaterThan(5);
      const crossings = run.events.filter((e): e is Extract<EndlessEvent, { type: 'crossing' }> => e.type === 'crossing');
      expect(crossings.length).toBeGreaterThanOrEqual(gaps - 3);
      expect(crossings.every((c) => c.clean)).toBe(true);
      expect(crossings.some((c) => c.inkUsed > 0)).toBe(true);
      expect(run.events.some((e) => e.type === 'inkPot')).toBe(true);
      expect(run.events.filter((e) => e.type === 'tier')).toHaveLength(1);
    }
  }, 120000);
});

describe('streaming and memory', () => {
  it('keeps body, chunk and stroke counts bounded over a long scripted run (20+ chunks, 5000+ steps)', () => {
    const seed = 15;
    let maxBodies = 0;
    let maxChunks = 0;
    let maxStrokes = 0;
    // The bot strategy, with the world inspected as it goes.
    const longRun = runBotWatching(seed, 8000, (r) => {
      maxBodies = Math.max(maxBodies, allocBodies(r));
      maxChunks = Math.max(maxChunks, r.chunks.length);
      maxStrokes = Math.max(maxStrokes, r.strokes.length);
    });
    expect(longRun.steps).toBeGreaterThanOrEqual(5000);
    expect(longRun.distanceM).toBeGreaterThan(500);
    expect(longRun.status).toBe('running');
    expect(longRun.chunks.at(-1)!.index).toBeGreaterThanOrEqual(20);
    expect(longRun.chunks[0]!.index).toBeGreaterThan(10);
    expect(maxChunks).toBeLessThanOrEqual(8);
    expect(maxStrokes).toBeLessThanOrEqual(12);
    expect(maxBodies).toBeLessThan(300);
    expect(longRun.inkPots.length).toBeLessThan(30);
    expect(longRun.sim.anchors.length).toBeLessThan(40);
    // Everything left in the world is near the vehicle.
    const x = longRun.vehicle.chassis.position.x;
    for (const c of longRun.chunks) {
      expect(c.x1).toBeGreaterThan(x - ENDLESS.behindPx - 20);
      expect(c.x0).toBeLessThan(x + ENDLESS.aheadPx + 1500);
    }
  }, 120000);
});

/** Runs the bot strategy for `steps` steps, calling `watch` after every 25 steps. */
function runBotWatching(seed: number, steps: number, watch: (r: EndlessRun) => void): EndlessRun {
  let n = 0;
  return runBot(seed, { maxM: 1e9, maxSteps: steps, onStep: (r) => (++n % 25 === 0 ? watch(r) : undefined) }).run;
}

describe('replays', () => {
  it('re-simulates a scripted run to the identical end state', () => {
    const { run } = runBot(11, { maxM: 260, boostRamps: true });
    expect(run.replay.strokes.length).toBeGreaterThan(3);
    const replay = JSON.parse(JSON.stringify(run.replay)) as typeof run.replay;
    expect(replay.gameVersion).toBe(ENDLESS.gameVersion);
    expect(replay.seed).toBe(11);
    const again = replayRun(replay, run.steps);
    expect(again.steps).toBe(run.steps);
    expect(again.distanceM).toBe(run.distanceM);
    expect(again.vehicle.chassis.position.x).toBe(run.vehicle.chassis.position.x);
    expect(again.vehicle.chassis.position.y).toBe(run.vehicle.chassis.position.y);
    expect(again.snaps).toBe(run.snaps);
    expect(again.inkLeft).toBe(run.inkLeft);
    expect(again.status).toBe(run.status);
  }, 120000);

  it('replays a run that boosts and crashes identically, and reports the same replay back', () => {
    const run = new EndlessRun(21, 'rocketCar', 'crayon');
    const pts = (x0: number, y0: number, x1: number, y1: number): Point[] => {
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 12);
      return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
    };
    while (run.status === 'running' && run.steps < 60 * 30) {
      if (run.steps === 40) run.addStroke(pts(300, 590, 500, 560));
      if (run.steps === 200) run.addStroke(pts(700, 400, 760, 420));
      if (run.steps % 150 === 20) run.boost();
      run.step();
    }
    expect(run.status).toBe('crashed');
    expect(run.replay.boosts.length).toBeGreaterThan(2);
    const again = replayRun(run.replay, run.steps + 100);
    expect(again.status).toBe('crashed');
    expect(again.crashReason).toBe(run.crashReason);
    expect(again.steps).toBe(run.steps);
    expect(again.distanceM).toBe(run.distanceM);
    expect(again.vehicle.chassis.position).toEqual(run.vehicle.chassis.position);
    expect(again.replay).toEqual(run.replay);
    expect(run.replay.vehicle).toBe('rocketCar');
    expect(run.replay.pen).toBe('crayon');
  });

  it('keeps the trail sampled every few steps', () => {
    const run = new EndlessRun(4);
    for (let i = 0; i < 60; i++) run.step();
    expect(run.trail).toHaveLength(60 / ENDLESS.trailEvery);
    expect(run.trail[0]![0]).toBeLessThan(run.trail.at(-1)![0]);
  });
});
