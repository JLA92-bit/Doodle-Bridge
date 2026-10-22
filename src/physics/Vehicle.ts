import Matter from 'matter-js';
import type { VehicleConfig } from '../config/vehicles';
import { CAT, VEHICLE_GROUP } from './categories';
import type { Point } from './geometry';

const { Bodies, Body, Composite, Constraint } = Matter;

/** A chassis on motorised wheels. The wheels spin towards a target speed every step. */
export class Vehicle {
  readonly chassis: Matter.Body;
  /** Wheels in config order (back to front). */
  readonly wheels: Matter.Body[];
  readonly composite: Matter.Composite;
  /** Which wheels touched something during the last step (updated by the Simulation). */
  readonly wheelContacts: boolean[];
  motorOn = false;
  /** Multiplier on the motor speed (endless mode speeds the vehicle up as the course gets harder). */
  speedScale = 1;

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
    this.wheels = c.wheels.map((w) =>
      Bodies.circle(start.x + w.x, start.y + w.y, w.r, {
        density: c.wheelDensity,
        friction: c.wheelFriction,
        frictionStatic: 2,
        restitution: 0.1,
        label: 'wheel',
        collisionFilter: filter,
      }),
    );
    this.wheelContacts = this.wheels.map(() => false);
    const axles = this.wheels.map((wheel, i) =>
      Constraint.create({
        bodyA: this.chassis,
        pointA: { x: c.wheels[i]!.x, y: c.wheels[i]!.y },
        bodyB: wheel,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: c.axleStiffness,
        damping: c.axleDamping,
        label: 'axle',
      }),
    );
    this.composite = Composite.create({ label: 'vehicle' });
    Composite.add(this.composite, [this.chassis, ...this.wheels, ...axles]);
  }

  get frontWheel(): Matter.Body {
    return this.wheels[this.wheels.length - 1]!;
  }

  get backWheel(): Matter.Body {
    return this.wheels[0]!;
  }

  get grounded(): boolean {
    return this.wheelContacts.some(Boolean);
  }

  /** Called every physics step before the engine update. */
  drive(boosting = false): void {
    if (!this.motorOn) {
      // Engine off (after the run): gently brake the wheels.
      for (const w of this.wheels) Body.setAngularVelocity(w, w.angularVelocity * 0.9);
      return;
    }
    const c = this.config;
    const target = c.motorSpeed * this.speedScale * (boosting ? c.boostSpeed : 1);
    const grip = boosting ? Math.min(1, c.motorGrip * 2) : c.motorGrip;
    for (const w of this.wheels) {
      const av = w.angularVelocity;
      Body.setAngularVelocity(w, av + (target - av) * grip);
    }
    if (boosting) {
      const f = c.boostForce * this.chassis.mass;
      Body.applyForce(this.chassis, this.chassis.position, {
        x: Math.cos(this.chassis.angle) * f,
        y: Math.sin(this.chassis.angle) * f,
      });
    }
    if (this.config.balance > 0) {
      // A rider leaning to stay upright: nudges the spin back towards level, weakly enough that it still tips.
      const angle = Math.atan2(Math.sin(this.chassis.angle), Math.cos(this.chassis.angle));
      const av = this.chassis.angularVelocity;
      Body.setAngularVelocity(this.chassis, av * 0.92 - angle * this.config.balance);
    }
  }

  get position(): Point {
    return this.chassis.position;
  }
}
