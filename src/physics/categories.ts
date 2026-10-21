/** Matter collision categories. */
export const CAT = {
  terrain: 0x0001,
  stroke: 0x0002,
  vehicle: 0x0004,
} as const;

/** Every part of the vehicle shares this negative group so its parts never collide with each other. */
export const VEHICLE_GROUP = -1;
/** Each stroke gets its own negative group so its own segments do not collide. */
export const strokeGroup = (strokeId: number): number => -(100 + strokeId);
