import Matter from 'matter-js';
import type { VehicleConfig } from '../config/vehicles';
import { CAT, VEHICLE_GROUP } from './categories';
import type { Point } from './geometry';

const { Bodies, Body, Composite, Constraint } = Matter;

/** A chassis on two motorised wheels. The wheels spin towards a target speed every step. */
export class Vehicle {
  readonly chassis: Matter.Body;
  readonly backWheel: Matter.Body;
  readonly frontWheel: Matter.Body;
  readonly composite: Matter.Composite;
  motorOn = false;

  constructor(readonly config: VehicleConfig, start: Point) {
    const c = config;
    const filter = { group: VEHICLE_GROUP, category: CAT.vehicle, mask: CAT.terrain | CAT.stroke };
    this.chassis = Bodies.rectangle(start.x, start.y, c.chassisWidth, c.chassisHeight, {
      density: c.chassisDensity,
      chamfer: { radius: Math.min(8, c.chassisHeight / 2 - 1) },
      friction: 0.5,
      label: 'chassis',
      collisionFilter: filter,
    });
    const wheel = (dx: number) =>
      Bodies.circle(start.x + dx, start.y + c.wheelOffsetY, c.wheelRadius, {
        density: c.wheelDensity,
        friction: c.wheelFriction,
        frictionStatic: 2,
        restitution: 0.1,
        label: 'wheel',
        collisionFilter: filter,
      });
    this.backWheel = wheel(-c.wheelOffsetX);
    this.frontWheel = wheel(c.wheelOffsetX);
    const axle = (w: Matter.Body, dx: number) =>
      Constraint.create({
        bodyA: this.chassis,
        pointA: { x: dx, y: c.wheelOffsetY },
        bodyB: w,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: c.axleStiffness,
        damping: c.axleDamping,
        label: 'axle',
      });
    this.composite = Composite.create({ label: 'vehicle' });
    Composite.add(this.composite, [
      this.chassis,
      this.backWheel,
      this.frontWheel,
      axle(this.backWheel, -c.wheelOffsetX),
      axle(this.frontWheel, c.wheelOffsetX),
    ]);
  }

  /** Called every physics step. */
  drive(speedMultiplier = 1): void {
    if (!this.motorOn) return;
    const target = this.config.motorSpeed * speedMultiplier;
    for (const w of [this.backWheel, this.frontWheel]) {
      const av = w.angularVelocity;
      Body.setAngularVelocity(w, av + (target - av) * this.config.motorGrip);
    }
  }

  get position(): Point {
    return this.chassis.position;
  }
}
