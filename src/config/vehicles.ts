export type VehicleId = 'paperCar' | 'skateboard' | 'schoolBus' | 'monsterTruck' | 'unicycle' | 'rocketCar';

export interface WheelConfig {
  /** Wheel centre relative to the chassis centre. */
  x: number;
  y: number;
  r: number;
}

export interface VehicleConfig {
  id: VehicleId;
  name: string;
  chassisWidth: number;
  chassisHeight: number;
  chassisDensity: number;
  wheels: WheelConfig[];
  wheelDensity: number;
  wheelFriction: number;
  /** Target wheel spin in radians per physics step. */
  motorSpeed: number;
  /** How quickly the wheels reach the target spin each step (0 to 1). */
  motorGrip: number;
  /** Axle springiness: lower is bouncier suspension. */
  axleStiffness: number;
  axleDamping: number;
  /** Optional self-righting strength (the unicycle rider balancing), per step. 0 = none. */
  balance: number;
  /** Main body colour and a darker shade for details. */
  colour: number;
  shade: number;
}

export const VEHICLES: Record<VehicleId, VehicleConfig> = {
  paperCar: {
    id: 'paperCar', name: 'Paper Car',
    chassisWidth: 58, chassisHeight: 20, chassisDensity: 0.002,
    wheels: [{ x: -20, y: 13, r: 12 }, { x: 20, y: 13, r: 12 }],
    wheelDensity: 0.002, wheelFriction: 0.95,
    motorSpeed: 0.22, motorGrip: 0.12,
    axleStiffness: 0.5, axleDamping: 0.2, balance: 0,
    colour: 0xe2574c, shade: 0xb23a32,
  },
  skateboard: {
    id: 'skateboard', name: 'Skateboard',
    chassisWidth: 62, chassisHeight: 8, chassisDensity: 0.0016,
    wheels: [{ x: -20, y: 8, r: 6.5 }, { x: 20, y: 8, r: 6.5 }],
    wheelDensity: 0.002, wheelFriction: 0.9,
    motorSpeed: 0.5, motorGrip: 0.15,
    axleStiffness: 0.35, axleDamping: 0.1, balance: 0,
    colour: 0x4bb3a7, shade: 0x2c7f76,
  },
  schoolBus: {
    id: 'schoolBus', name: 'School Bus',
    chassisWidth: 108, chassisHeight: 30, chassisDensity: 0.0013,
    wheels: [{ x: -34, y: 18, r: 13 }, { x: 34, y: 18, r: 13 }],
    wheelDensity: 0.0025, wheelFriction: 1,
    motorSpeed: 0.19, motorGrip: 0.25,
    axleStiffness: 0.6, axleDamping: 0.25, balance: 0,
    colour: 0xf4bf2a, shade: 0xc98f0a,
  },
  monsterTruck: {
    id: 'monsterTruck', name: 'Monster Truck',
    chassisWidth: 64, chassisHeight: 22, chassisDensity: 0.003,
    wheels: [{ x: -25, y: 21, r: 19 }, { x: 25, y: 21, r: 19 }],
    wheelDensity: 0.003, wheelFriction: 1,
    motorSpeed: 0.16, motorGrip: 0.12,
    axleStiffness: 0.35, axleDamping: 0.3, balance: 0,
    colour: 0x3f6fd8, shade: 0x274a9c,
  },
  unicycle: {
    id: 'unicycle', name: 'Unicycle',
    chassisWidth: 20, chassisHeight: 28, chassisDensity: 0.0012,
    wheels: [{ x: 0, y: 22, r: 17 }],
    wheelDensity: 0.002, wheelFriction: 0.95,
    motorSpeed: 0.19, motorGrip: 0.12,
    axleStiffness: 0.4, axleDamping: 0.2, balance: 0.03,
    colour: 0x9a6ad6, shade: 0x6c45a3,
  },
  rocketCar: {
    id: 'rocketCar', name: 'Rocket Car',
    chassisWidth: 64, chassisHeight: 16, chassisDensity: 0.002,
    wheels: [{ x: -22, y: 11, r: 11 }, { x: 21, y: 11, r: 10 }],
    wheelDensity: 0.002, wheelFriction: 0.95,
    motorSpeed: 0.3, motorGrip: 0.13,
    axleStiffness: 0.55, axleDamping: 0.2, balance: 0,
    colour: 0x46b35a, shade: 0x2d7d3c,
  },
};

export function getVehicle(id: VehicleId): VehicleConfig {
  return VEHICLES[id];
}

export const isVehicleId = (s: string | null): s is VehicleId => s !== null && s in VEHICLES;
