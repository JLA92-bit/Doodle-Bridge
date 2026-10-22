import { CHUNK, DIFFICULTY, ENDLESS } from '../config/endless';
import type { PlatformDef, Rect, WindZone } from '../game/Level';
import type { PointTuple } from '../physics/geometry';
import { mulberry32 } from './SeededRandom';
import type { Chunk, ChunkType, Difficulty, GapSpan } from './types';

type Rand = () => number;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Random stream for one chunk, so a chunk depends only on (seed, index) and not on generation order. */
export function chunkRandom(seed: number, index: number): Rand {
  const rand = mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  rand();
  rand();
  return rand;
}

/**
 * Generates one chunk of course starting at `x0` with the ground at `entryY`.
 * Pass a seed number (the chunk gets its own stream from seed + index) or a ready random function.
 * Everything is deterministic: the same inputs always give the same chunk.
 */
export function generateChunk(
  source: number | Rand,
  index: number,
  x0: number,
  entryY: number,
  difficulty: Difficulty,
): Chunk {
  const rand = typeof source === 'number' ? chunkRandom(source, index) : source;
  const b = new ChunkBuilder(rand, index, x0, entryY, difficulty);
  const type = index === 0 ? 'flat' : index === 1 ? 'gap' : pickType(rand, difficulty.types);
  switch (type) {
    case 'flat':
      return index === 0 ? b.runway() : b.flat();
    case 'gap':
      return b.gap();
    case 'doubleGap':
      return b.doubleGap();
    case 'rampGap':
      return b.rampGap();
    case 'pitIsland':
      return b.pitIsland();
    case 'platform':
      return b.movingPlatform();
    case 'wind':
      return b.windGap();
    case 'eraser':
      return b.eraserGap();
  }
}

function pickType(rand: Rand, types: readonly ChunkType[]): ChunkType {
  const total = types.reduce((sum, t) => sum + DIFFICULTY.weights[t], 0);
  let r = rand() * total;
  for (const t of types) {
    r -= DIFFICULTY.weights[t];
    if (r < 0) return t;
  }
  return types[types.length - 1]!;
}

/** Nails chosen for a span and the width they allow. */
interface SpanPlan {
  a: boolean;
  b: boolean;
  w: number;
  /** True when both edges have nails (the far side may then be sloped). */
  pinned: boolean;
}

/** Builds a chunk left to right with a cursor (x, y) that always sits on the ground. */
class ChunkBuilder {
  private x: number;
  private y: number;
  private type: ChunkType = 'flat';
  private terrain: Chunk['terrain'] = [];
  private anchors: PointTuple[] = [];
  private platforms: PlatformDef[] = [];
  private wind: WindZone[] = [];
  private erasers: Rect[] = [];
  private inkPots: PointTuple[] = [];
  private gaps: GapSpan[] = [];

  constructor(
    private readonly rand: Rand,
    private readonly index: number,
    private readonly x0: number,
    entryY: number,
    private readonly d: Difficulty,
  ) {
    this.x = x0;
    this.y = this.clampY(entryY);
  }

  // Chunk types ------------------------------------------------------------

  /** The first chunk: a long flat runway so the player has time to start drawing. */
  runway(): Chunk {
    this.ground(ENDLESS.runwayLength, 0);
    return this.finish('flat');
  }

  flat(): Chunk {
    for (let i = 0; i < CHUNK.flatPieces + Math.floor(this.rand() * 2); i++) {
      const len = CHUNK.flatPieceMin + this.rand() * CHUNK.flatPieceRange;
      this.ground(len, this.hillDy());
    }
    this.ground(CHUNK.runOutMin, 0);
    return this.finish('flat');
  }

  gap(): Chunk {
    this.lead();
    this.span(1, this.landDy());
    this.runOut();
    return this.finish('gap');
  }

  doubleGap(): Chunk {
    this.lead();
    this.span(CHUNK.doubleGapShare, this.landDy());
    this.ground(CHUNK.islandMin + this.rand() * CHUNK.islandRange, this.rand() * 8 - 4);
    this.span(CHUNK.doubleGapShare, this.landDy());
    this.runOut();
    return this.finish('doubleGap');
  }

  /** A pit too wide for one line, with a short pillar in the middle whose corners always have nails. */
  pitIsland(): Chunk {
    this.lead();
    const left = { x: this.x, y: this.y };
    const a = this.plan(CHUNK.pitShare, false, true);
    this.cross(a.w, this.rand() * 20, a.pinned);
    const pillarLeft = { x: this.x, y: this.y };
    this.ground(CHUNK.pillarMin + this.rand() * CHUNK.pillarRange, 0);
    const pillarRight = { x: this.x, y: this.y };
    const b = this.plan(CHUNK.pitShare, true, false);
    this.cross(b.w, this.landDy(), b.pinned);
    const right = { x: this.x, y: this.y };
    this.placeNails(a, left, pillarLeft);
    this.placeNails(b, pillarRight, right);
    this.gaps.push(this.gapSpan(left.x, right.x, (a.w + b.w) * CHUNK.inkSlack));
    this.pot((left.x + pillarLeft.x) / 2, Math.min(left.y, pillarLeft.y));
    this.pot((pillarRight.x + right.x) / 2, Math.min(pillarRight.y, right.y));
    this.runOut();
    return this.finish('pitIsland');
  }

  rampGap(): Chunk {
    const h = Math.min(CHUNK.rampHeightMin + this.rand() * CHUNK.rampHeightRange, this.y - CHUNK.minY);
    if (h < CHUNK.rampHeightMin * 0.7) return this.gap();
    this.lead();
    this.ground(CHUNK.rampLength, -h);
    this.span(1, this.rand() * CHUNK.rampLandMax, true, true);
    this.runOut();
    return this.finish('rampGap');
  }

  /** A pit with a moving platform in the middle; nails on the platform ride with it. */
  movingPlatform(): Chunk {
    this.lead();
    const left = { x: this.x, y: this.y };
    const a = this.plan(0, false, true, CHUNK.platformSpanMin + this.rand() * CHUNK.platformSpanRange);
    const b = this.plan(0, true, false, CHUNK.platformSpanMin + this.rand() * CHUNK.platformSpanRange);
    const top = left.y - 12;
    const px = left.x + a.w;
    const pw = CHUNK.platformWidth;
    this.platforms.push({
      points: [[px, top], [px + pw, top], [px + pw, top + CHUNK.platformThickness], [px, top + CHUNK.platformThickness]].map(
        (p) => [round1(p[0]!), round1(p[1]!)] as PointTuple,
      ),
      move: [0, CHUNK.platformTravel],
      periodMs: Math.round(CHUNK.platformPeriodMin + this.rand() * CHUNK.platformPeriodRange),
      phase: Math.round(this.rand() * 4) / 4,
      nails: [[round1(px), round1(top)], [round1(px + pw), round1(top)]],
    });
    this.cross(a.w + pw + b.w, 6);
    const right = { x: this.x, y: this.y };
    this.placeNails(a, left, { x: px, y: top });
    this.placeNails(b, { x: px + pw, y: top }, right);
    this.gaps.push(this.gapSpan(left.x, right.x, (a.w + b.w) * CHUNK.inkSlack));
    this.pot(px + pw / 2, top - 6);
    this.runOut();
    return this.finish('platform');
  }

  windGap(): Chunk {
    this.lead();
    const left = { x: this.x, y: this.y };
    this.span(CHUNK.windGapShare, this.landDy());
    const sign = this.rand() < 0.5 ? -1 : 1;
    const force = sign * (CHUNK.windMin + this.rand() * CHUNK.windRange);
    const top = Math.min(left.y, this.y) - CHUNK.windAbove;
    this.wind.push({
      x: round1(left.x - CHUNK.windMargin),
      y: round1(top),
      w: round1(this.x - left.x + CHUNK.windMargin * 2),
      h: round1(Math.max(left.y, this.y) + CHUNK.windBelow - top),
      force: [Math.round(force * 1000) / 1000, 0],
    });
    this.runOut();
    return this.finish('wind');
  }

  /** A gap with a floating nail in the middle and an eraser zone under it, so lines must not sag. */
  eraserGap(): Chunk {
    this.lead();
    const left = { x: this.x, y: this.y };
    const share = this.d.gapScale ** 0.5;
    const a = this.plan(0, false, true, (CHUNK.eraserSpanMin + this.rand() * CHUNK.eraserSpanRange) * share);
    const b = this.plan(0, true, false, (CHUNK.eraserSpanMin + this.rand() * CHUNK.eraserSpanRange) * share);
    this.cross(a.w + b.w, this.landDy(), b.pinned);
    const right = { x: this.x, y: this.y };
    const mid = { x: left.x + a.w, y: Math.min(left.y, right.y) - CHUNK.floatingNailHeight };
    this.placeNails(a, left, mid);
    this.placeNails(b, mid, right);
    this.gaps.push(this.gapSpan(left.x, right.x, (a.w + b.w) * CHUNK.inkSlack));
    this.erasers.push({
      x: round1(mid.x - CHUNK.eraserWidth / 2),
      y: round1(Math.max(left.y, right.y) + CHUNK.eraserTop),
      w: CHUNK.eraserWidth,
      h: CHUNK.eraserHeight,
    });
    this.pot(mid.x, mid.y + CHUNK.floatingNailHeight);
    this.runOut();
    return this.finish('eraser');
  }

  // Building blocks --------------------------------------------------------

  private clampY(y: number): number {
    return round1(Math.min(CHUNK.maxY, Math.max(CHUNK.minY, y)));
  }

  /** Slope for plain ground: random, nudged back towards the middle of the allowed range. */
  private hillDy(): number {
    const pull = ((CHUNK.minY + CHUNK.maxY) / 2 - this.y) * 0.1;
    return (this.rand() * 2 - 1) * CHUNK.flatSlope + pull;
  }

  /** Where the far side of a gap sits relative to the near side: a bit uphill at most, often downhill. */
  private landDy(): number {
    const pull = ((CHUNK.minY + CHUNK.maxY) / 2 - this.y) * 0.1;
    return -CHUNK.uphillMax + this.rand() * (CHUNK.uphillMax + CHUNK.downhillMax) + pull;
  }

  /**
   * Plans one span: whether each edge gets a nail (by chance, or forced), then a width those nails
   * allow. A line is only reliable when pinned at both ends, so missing nails mean a narrower gap.
   * `fixedWidth` overrides the random width (it is still capped).
   */
  private plan(share: number, forceA: boolean, forceB: boolean, fixedWidth?: number): SpanPlan {
    const c = this.d.anchorChance;
    const a = this.rand() < c || forceA;
    const b = this.rand() < c || forceB;
    const wide = fixedWidth ?? (CHUNK.gapMin + this.rand() * CHUNK.gapRange) * this.d.gapScale * share;
    const cap = a && b ? CHUNK.maxSpan : a || b ? CHUNK.maxOneNailSpan : CHUNK.maxFreeSpan;
    return { a, b, w: round1(Math.min(wide, cap)), pinned: a && b };
  }

  /** Flat approach, longer at higher speeds so the player keeps about the same time to react. */
  private lead(): void {
    this.ground((CHUNK.leadMin + this.rand() * CHUNK.leadRange) * this.d.speed, 0);
  }

  private runOut(): void {
    this.ground(CHUNK.runOutMin + this.rand() * CHUNK.runOutRange, 0);
  }

  /** Ground from the cursor to `len` further on, `dy` higher (negative) or lower. */
  private ground(len: number, dy: number): void {
    const nx = round1(this.x + len);
    const ny = this.clampY(this.y + dy);
    this.terrain.push({
      points: [[this.x, this.y], [nx, ny], [nx, CHUNK.bottomY], [this.x, CHUNK.bottomY]],
    });
    this.x = nx;
    this.y = ny;
  }

  /** Moves the cursor across empty space. */
  private cross(w: number, dy: number, pinned = true): void {
    this.x = round1(this.x + w);
    const limit = CHUNK.looseSlope;
    this.y = this.clampY(this.y + (pinned ? dy : Math.max(-limit, Math.min(limit, dy))));
  }

  /** A whole plain gap: nails by chance, an ink pot, and its GapSpan. The cursor ends on the far edge. */
  private span(share: number, dy: number, high = false, forceLeft = false): void {
    const left = { x: this.x, y: this.y };
    const p = this.plan(share, forceLeft, false);
    this.cross(p.w, dy, p.pinned);
    const right = { x: this.x, y: this.y };
    this.placeNails(p, left, right);
    this.gaps.push(this.gapSpan(left.x, right.x, Math.hypot(p.w, right.y - left.y) * CHUNK.inkSlack));
    this.pot((left.x + right.x) / 2, Math.min(left.y, right.y), high);
  }

  private gapSpan(x0: number, x1: number, ink: number): GapSpan {
    return { x0, x1, expectedInk: Math.round(ink) };
  }

  private placeNails(p: SpanPlan, a: { x: number; y: number }, b: { x: number; y: number }): void {
    if (p.a) this.anchors.push([round1(a.x), round1(a.y)]);
    if (p.b) this.anchors.push([round1(b.x), round1(b.y)]);
  }

  /** An ink pot above a bridge line (higher up for ramp jumps), with some chance. */
  private pot(x: number, lineY: number, high = false): void {
    if (this.rand() >= CHUNK.potChance) return;
    this.inkPots.push([round1(x), round1(lineY - CHUNK.potHeight - (high ? 40 : 0))]);
  }

  private finish(type: ChunkType): Chunk {
    this.type = type;
    return {
      index: this.index,
      type: this.type,
      x0: this.x0,
      x1: this.x,
      exitY: this.y,
      terrain: this.terrain,
      anchors: this.anchors,
      platforms: this.platforms,
      wind: this.wind,
      erasers: this.erasers,
      inkPots: this.inkPots,
      gaps: this.gaps,
    };
  }
}
