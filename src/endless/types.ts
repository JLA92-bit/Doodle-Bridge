/**
 * Endless and daily mode contract (phase 7). The world generator / runner, the scoring
 * rules and the screen are built separately against these types, so keep them stable.
 */
import type { PenId } from '../config/pens';
import type { VehicleId } from '../config/vehicles';
import type { PlatformDef, Rect, WindZone } from '../game/Level';
import type { Point, PointTuple } from '../physics/geometry';
import type { BridgeChain } from '../physics/BridgeChain';
import type { CrashReason, SimEvent } from '../physics/Simulation';
import type { Vehicle } from '../physics/Vehicle';

/** World pixels per displayed metre. */
export const PX_PER_M = 20;

export type ChunkType = 'flat' | 'gap' | 'doubleGap' | 'rampGap' | 'pitIsland' | 'platform' | 'wind' | 'eraser';

/** A gap the vehicle must cross; used for crossing bonuses. */
export interface GapSpan {
  /** Left and right edge x of the gap (world px). */
  x0: number;
  x1: number;
  /** Ink a straightforward bridge would need (for the "thrifty" bonus). */
  expectedInk: number;
}

/** One generated piece of course, laid left to right. */
export interface Chunk {
  index: number;
  type: ChunkType;
  /** World x range this chunk covers. */
  x0: number;
  x1: number;
  /** Ground height (y) at x1, where the next chunk continues. */
  exitY: number;
  /** Convex terrain pieces. */
  terrain: { points: PointTuple[] }[];
  anchors: PointTuple[];
  platforms: PlatformDef[];
  wind: WindZone[];
  erasers: Rect[];
  /** Ink pots floating above gaps: collecting one refills ink. */
  inkPots: PointTuple[];
  gaps: GapSpan[];
}

/** How hard the course is at a given distance (ramps every 250 m). */
export interface Difficulty {
  tier: number;
  /** Multiplier on gap widths (1 at the start). */
  gapScale: number;
  /** Chance (0 to 1) that a gap edge gets a nail. */
  anchorChance: number;
  /** Vehicle speed multiplier, capped at 1.8. */
  speed: number;
  /** Chunk types that may appear at this tier. */
  types: ChunkType[];
}

/** Everything that can happen in a run; the scorer and the screen both consume these. */
export type EndlessEvent =
  | SimEvent
  /** The vehicle's rear wheel passed a gap's right edge. clean = no line snapped while crossing it. */
  | { type: 'crossing'; gap: GapSpan; clean: boolean; inkUsed: number }
  | { type: 'inkPot'; at: Point; airborne: boolean }
  /** The vehicle landed after being airborne for `ms`. */
  | { type: 'air'; ms: number }
  /** A wheel was touching a line segment as that line snapped. */
  | { type: 'closeCall'; at: Point }
  /** The course got harder (every 250 m). */
  | { type: 'tier'; tier: number };

/** Inputs needed to re-simulate a run exactly (anti-cheat replays, ghosts). */
export interface Replay {
  seed: number;
  vehicle: VehicleId;
  pen: PenId;
  /** Strokes as drawn: raw points plus the physics step on which they were added. */
  strokes: { step: number; points: PointTuple[] }[];
  /** Steps on which boosts started. */
  boosts: number[];
  gameVersion: string;
}

/**
 * A live endless run: physics never freezes, the player draws ahead of the moving vehicle,
 * the course streams in from a seeded generator, ink refills slowly and from ink pots.
 * Deterministic for a given seed + replay inputs.
 */
export interface EndlessRunApi {
  readonly seed: number;
  readonly vehicle: Vehicle;
  readonly strokes: readonly BridgeChain[];
  /** Chunks currently in the world (old ones behind the vehicle are dropped). */
  readonly chunks: readonly Chunk[];
  /** Ink pots in the world with whether they were collected. */
  readonly inkPots: readonly { at: Point; taken: boolean }[];
  status: 'running' | 'crashed';
  crashReason: CrashReason | null;
  steps: number;
  readonly inkTotal: number;
  readonly inkLeft: number;
  readonly distanceM: number;
  readonly difficulty: Difficulty;
  readonly snaps: number;
  readonly boosting: boolean;
  readonly boostCooldown: number;
  /** Things that happened since last drained. */
  events: EndlessEvent[];
  /** Adds a stroke from raw finger samples, clipped to the ink left. Returns null for taps / no ink. */
  addStroke(raw: readonly Point[]): BridgeChain | null;
  boost(): boolean;
  step(): void;
  /** Vehicle chassis positions sampled every few steps, for the ghost of a best run. */
  readonly trail: readonly PointTuple[];
  readonly replay: Replay;
}
