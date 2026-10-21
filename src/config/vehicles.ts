export type VehicleId = 'paperCar' | 'skateboard' | 'schoolBus' | 'monsterTruck' | 'unicycle' | 'rocketCar';

export interface VehicleConfig {
  id: VehicleId;
  name: string;
  chassisWidth: number;
  chassisHeight: number;
  chassisDensity: number;
  wheelRadius: number;
  /** Wheel centres relative to the chassis centre. */
  wheelOffsetX: number;
  wheelOffsetY: number;
  wheelDensity: number;
  wheelFriction: number;
  /** Target wheel spin in radians per physics step. */
  motorSpeed: number;
  /** How quickly the wheels reach the target spin each step (0 to 1). */
  motorGrip: number;
  /** Axle springiness: lower is bouncier suspension. */
  axleStiffness: number;
  axleDamping: number;
  colour: number;
}

export const VEHICLES: Partial<Record<VehicleId, VehicleConfig>> = {
  paperCar: {
    id: 'paperCar', name: 'Paper Car',
    chassisWidth: 58, chassisHeight: 20, chassisDensity: 0.002,
    wheelRadius: 12, wheelOffsetX: 20, wheelOffsetY: 13,
    wheelDensity: 0.002, wheelFriction: 0.95,
    motorSpeed: 0.22, motorGrip: 0.12,
    axleStiffness: 0.5, axleDamping: 0.2,
    colour: 0xe2574c,
  },
};

export function getVehicle(id: VehicleId): VehicleConfig {
  const v = VEHICLES[id];
  if (!v) throw new Error(`Vehicle ${id} is not available yet`);
  return v;
}
