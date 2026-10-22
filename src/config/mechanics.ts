/** Tuning for moving platforms, wind, erasers and checkpoints. */

export const PLATFORM = {
  /** Surface grip of a platform; high so the vehicle is carried instead of sliding off. */
  friction: 1,
  frictionStatic: 1.5,
};

export const WIND = {
  /**
   * Multiplier on a zone's `force` (px per step squared). 1 means a body in the zone gains
   * `force` px/step of velocity every step (before drag and other forces).
   */
  scale: 1,
};

export const CHECKPOINT = {
  /** Extra clearance (px) above the checkpoint ground point, same idea as the start point. */
  spawnGap: 1,
};
