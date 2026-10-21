import Matter from 'matter-js';
import { ANCHOR, type PenConfig } from '../config/pens';
import { dist, type Point } from './geometry';
import { CAT, strokeGroup } from './categories';
import type { BuiltStroke } from './StrokeBuilder';

const { Bodies, Composite, Constraint } = Matter;

/** A drawn stroke as a chain of thin rectangles joined by springy constraints. */
export class BridgeChain {
  readonly segments: Matter.Body[] = [];
  readonly joints: Matter.Constraint[] = [];
  readonly pins: Matter.Constraint[] = [];
  readonly lengths: number[] = [];
  readonly composite: Matter.Composite;

  constructor(
    readonly id: number,
    readonly stroke: BuiltStroke,
    readonly pen: PenConfig,
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
    }

    // Two constraints per joint, offset across the line, give it some resistance to bending.
    for (let i = 0; i < this.segments.length - 1; i++) {
      const A = this.segments[i]!;
      const B = this.segments[i + 1]!;
      const j = pts[i + 1]!;
      const n = normalAt(pts, i + 1);
      for (const s of [-1, 1]) {
        const w = { x: j.x + n.x * half * s, y: j.y + n.y * half * s };
        this.joints.push(
          Constraint.create({
            bodyA: A,
            bodyB: B,
            pointA: { x: w.x - A.position.x, y: w.y - A.position.y },
            pointB: { x: w.x - B.position.x, y: w.y - B.position.y },
            length: 0,
            stiffness: pen.stiffness,
            damping: pen.damping,
            label: 'joint',
          }),
        );
      }
    }

    if (stroke.startAnchor !== null) this.pin(this.segments[0]!, pts[0]!, pts[1]!);
    if (stroke.endAnchor !== null) {
      this.pin(this.segments[this.segments.length - 1]!, pts[pts.length - 1]!, pts[pts.length - 2]!);
    }

    Composite.add(this.composite, [...this.segments, ...this.joints, ...this.pins]);
  }

  /** Nail: a stiff hinge at the anchor plus a softer brace a little way along the stroke. */
  private pin(body: Matter.Body, at: Point, toward: Point): void {
    const d = Math.max(dist(at, toward), 1);
    const along = Math.min(ANCHOR.braceDistance, d * 0.8);
    const brace = { x: at.x + ((toward.x - at.x) / d) * along, y: at.y + ((toward.y - at.y) / d) * along };
    this.pins.push(
      Constraint.create({
        pointA: { ...at },
        bodyB: body,
        pointB: { x: at.x - body.position.x, y: at.y - body.position.y },
        length: 0,
        stiffness: ANCHOR.hingeStiffness,
        label: 'nail',
      }),
      Constraint.create({
        pointA: { ...brace },
        bodyB: body,
        pointB: { x: brace.x - body.position.x, y: brace.y - body.position.y },
        length: 0,
        stiffness: ANCHOR.braceStiffness,
        label: 'brace',
      }),
    );
  }

  /** Current polyline through the segment ends, for rendering. */
  polyline(): Point[] {
    const out: Point[] = [];
    this.segments.forEach((b, i) => {
      const half = this.lengths[i]! / 2;
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      const start = { x: b.position.x - c * half, y: b.position.y - s * half };
      const end = { x: b.position.x + c * half, y: b.position.y + s * half };
      if (i === 0) out.push(start);
      else {
        const prev = out[out.length - 1]!;
        out[out.length - 1] = { x: (prev.x + start.x) / 2, y: (prev.y + start.y) / 2 };
      }
      out.push(end);
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
