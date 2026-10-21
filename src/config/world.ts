/** Logical game resolution (portrait). Phaser scales this to fit the phone. */
export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 854;

/** Fixed physics step. The simulation always advances in these steps so runs are deterministic. */
export const STEP_MS = 1000 / 60;
/** Never simulate more than this many steps in one rendered frame (avoids spiral of death). */
export const MAX_STEPS_PER_FRAME = 5;

export const PHYSICS = {
  gravityY: 1,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 4,
  /** Slow motion right after Go so players can see what happens. */
  slowMoFactor: 0.5,
  slowMoMs: 500,
  /** The vehicle crashes when its body gets this close to the bottom of the screen. */
  fallMargin: 6,
};

export const CRASH = {
  /** Upside down (or tipped past the vehicle's maxTilt) for this long = crash. */
  flippedMs: 1500,
  /** No forward progress for this long = stalled. */
  stallMs: 4000,
  /** Moving forward by at least this much (px) counts as progress. */
  progressPx: 4,
};

export const BOOST = {
  durationMs: 600,
  cooldownMs: 1500,
};

export const PAPER = {
  colour: 0xfbf7ea,
  lineColour: 0x9cc3e6,
  marginColour: 0xe58a8a,
  lineSpacing: 34,
  firstLineY: 96,
  marginX: 44,
};
