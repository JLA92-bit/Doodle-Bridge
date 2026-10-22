import Matter from 'matter-js';
import { ANCHOR, type PenConfig } from '../config/pens';
import { dist, type Point } from './geometry';
import { CAT, strokeGroup } from './categories';
import type { BuiltStroke } from './StrokeBuilder';

const { Bodies, Composite, Constraint } = Matter;

/** The joint between segment `index` and `index + 1`: two springs that stretch, and can snap. */
export interface Link {
  index: number;
  springs: [Matter.Constraint, Matter.Constraint];
  /** Stretch as a fraction of the pen's break threshold (1 = about to snap). */
  stress: number;
  /** Consecutive steps spent over the threshold. */
  over: number;
  broken: boolean;
}

/** A body (a moving platform) that an anchor is fixed to; null/undefined means the fixed world. */
export type AnchorHost = Matter.Body | null | undefined;

/** A drawn stroke as a chain of thin rectangles joined by springy constraints. */
export class BridgeChain {
  readonly segments: Matter.Body[] = [];
  readonly links: Link[] = [];
  readonly pins: Matter.Constraint[] = [];
  readonly lengths: number[] = [];
  /** Segments rubbed out by an eraser zone (they have left the world). */
  readonly erased: boolean[] = [];
  readonly composite: Matter.Composite;

  constructor(
    readonly id: number,
    readonly stroke: BuiltStroke,
    readonly pen: PenConfig,
    /** Per anchor index: the body the nail sits on (moving platforms), or null for the world. */
    hosts: readonly AnchorHost[] = [],
  ) {
    this.composite = Composite.create({ label: `stroke-${id}` });
    const pts = stroke.points;
    const half = pen.thickness / 2;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.max(dist(a, b), 1);
      const body = Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len, pen.thickness, {
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        density: pen.density,
        friction: pen.friction,
        frictionStatic: 1,
        restitution: 0,
        slop: 0.02,
        label: 'segment',
        collisionFilter: { group: strokeGroup(id), category: CAT.stroke, mask: CAT.terrain | CAT.stroke | CAT.vehicle },
      });
      this.segments.push(body);
      this.lengths.push(len);
      this.erased.push(false);
    }

    // Two constraints per joint, offset across the line, give it some resistance to bending.
    for (let i = 0; i < this.segments.length - 1; i++) {
      const A = this.segments[i]!;
      const B = this.segments[i + 1]!;
      const j = pts[i + 1]!;
      const n = normalAt(pts, i + 1);
      const springs = [-1, 1].map((s) => {
        const w = { x: j.x + n.x * half * s, y: j.y + n.y * half * s };
        return Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: { x: w.x - A.position.x, y: w.y - A.position.y },
            pointB: { x: w.x - B.position.x, y: w.y - B.position.y },
            length: 0,
            stiffness: pen.stiffness,
            damping: pen.damping,
            label: 'joint',
          });
      }) as [Matter.Constraint, Matter.Constraint];
      this.links.push({ index: i, springs, stress: 0, over: 0, broken: false });
    }

    if (stroke.startAnchor !== null) this.pin(this.segments[0]!, pts[0]!, pts[1]!, hosts[stroke.startAnchor]);
    if (stroke.endAnchor !== null) {
      this.pin(this.segments[this.segments.length - 1]!, pts[pts.length - 1]!, pts[pts.length - 2]!, hosts[stroke.endAnchor]);
    }

    Composite.add(this.composite, [...this.segments, ...this.links.flatMap((l) => l.springs), ...this.pins]);
  }

  /** Nail: a stiff hinge at the anchor plus a softer brace a little way along the stroke. */
  private pin(body: Matter.Body, at: Point, toward: Point, host: AnchorHost): void {
    const fix = (p: Point) =>
      host ? { bodyA: host, pointA: { x: p.x - host.position.x, y: p.y - host.position.y } } : { pointA: { ...p } };
    const d = Math.max(dist(at, toward), 1);
    const along = Math.min(ANCHOR.braceDistance, d * 0.8);
    const brace = { x: at.x + ((toward.x - at.x) / d) * along, y: at.y + ((toward.y - at.y) / d) * along };
    this.pins.push(
      Constraint.create({
        ...fix(at),
        bodyB: body,
        pointB: { x: at.x - body.position.x, y: at.y - body.position.y },
        length: 0,
        stiffness: ANCHOR.hingeStiffness,
        label: 'nail',
      }),
      Constraint.create({
        ...fix(brace),
        bodyB: body,
        pointB: { x: brace.x - body.position.x, y: brace.y - body.position.y },
        length: 0,
        stiffness: ANCHOR.braceStiffness,
        label: 'brace',
      }),
    );
  }

  /** Snaps the link: its springs leave the world and the chain splits in two. */
  snap(link: Link): void {
    link.broken = true;
    link.stress = 0;
    for (const c of link.springs) Composite.remove(this.composite, c);
  }

  /**
   * Rubs out a segment: its body, the springs of both neighbouring joints and any nail
   * on it leave the world. Returns where it was, or null if it was already gone.
   */
  erase(i: number): Point | null {
    if (this.erased[i]) return null;
    this.erased[i] = true;
    const body = this.segments[i]!;
    const at = { x: body.position.x, y: body.position.y };
    for (const link of [this.links[i - 1], this.links[i]]) {
      if (!link) continue;
      link.broken = true;
      link.stress = 0;
      for (const c of link.springs) Composite.remove(this.composite, c);
    }
    for (const pin of this.pins) if (pin.bodyB === body) Composite.remove(this.composite, pin);
    Composite.remove(this.composite, body);
    return at;
  }

  /** World position of a link's joint. */
  linkPosition(link: Link): Point {
    const a = this.segmentEnds(link.index)[1];
    const b = this.segmentEnds(link.index + 1)[0];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** Start and end of a segment in world space. */
  segmentEnds(i: number): [Point, Point] {
    const b = this.segments[i]!;
    const half = this.lengths[i]! / 2;
    const c = Math.cos(b.angle);
    const s = Math.sin(b.angle);
    return [
      { x: b.position.x - c * half, y: b.position.y - s * half },
      { x: b.position.x + c * half, y: b.position.y + s * half },
    ];
  }

  /**
   * Current shape for rendering: one polyline per unbroken run of segments, with the
   * stress at each point (0 = relaxed, 1 = about to snap).
   */
  runs(): { points: Point[]; stress: number[] }[] {
    const out: { points: Point[]; stress: number[] }[] = [];
    let run: { points: Point[]; stress: number[] } | null = null;
    this.segments.forEach((_, i) => {
      if (this.erased[i]) {
        run = null;
        return;
      }
      const [start, end] = this.segmentEnds(i);
      const link = this.links[i - 1];
      if (!run || !link || link.broken) {
        run = { points: [start], stress: [0] };
        out.push(run);
      } else {
        const prev = run.points[run.points.length - 1]!;
        run.points[run.points.length - 1] = { x: (prev.x + start.x) / 2, y: (prev.y + start.y) / 2 };
        run.stress[run.stress.length - 1] = link.stress;
      }
      run.points.push(end);
      run.stress.push(0);
    });
    return out;
  }
}

function normalAt(pts: readonly Point[], i: number): Point {
  const a = pts[Math.max(0, i - 1)]!;
  const b = pts[Math.min(pts.length - 1, i + 1)]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}
