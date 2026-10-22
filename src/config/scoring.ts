/** Campaign scoring. Level score = base + unused ink percent x inkPoints + time bonus. */
export const CAMPAIGN_SCORE = {
  base: 1000,
  /** Points per percent of ink left unused. */
  inkPoints: 20,
  /** Max time bonus, earned at 0 s and falling to 0 at twice the time target. */
  timeBonus: 500,
};

/** Endless and daily scoring: Score = (distance x 10 + style bonuses) x combo multiplier. */
export const ENDLESS_SCORE = {
  pointsPerMetre: 10,
  cleanCrossing: 100,
  thriftyCrossing: 150,
  /** A crossing is thrifty when it used less than this share of the gap's expected ink. */
  thriftyInkShare: 0.5,
  bigAirPoints: 50,
  /** Big air pays per full unit of this many ms in the air. */
  bigAirUnitMs: 500,
  closeCall: 75,
  inkPot: 25,
  comboStep: 0.1,
  comboMax: 3.0,
  /** Popups kept at most (the screen drains them). */
  maxPopups: 24,
};

/** Daily challenge rules. */
export const DAILY = {
  /** Daily #1 falls on this UTC date. */
  firstDay: { year: 2026, month: 10, day: 21 },
  /** Attempts per day that count toward the board; the rest are practice. */
  countedAttempts: 3,
  /** Old daily records kept (days). */
  keepDays: 14,
  gameUrl: 'https://doodle-bridge.joshmakesgames.app',
};

/** Rewards and records for endless / daily progress. */
export const ENDLESS_REWARDS = {
  streak: [
    { days: 7, reward: 'paper-streak7' },
    { days: 30, reward: 'paper-streak30' },
    { days: 30, reward: 'vehicle-unicycle' },
  ],
  /** Endless distance milestones (metres). */
  milestones: [
    { meters: 500, reward: 'paper-endless500' },
    { meters: 1000, reward: 'vehicle-schoolBus' },
    { meters: 2000, reward: 'paper-endless2000' },
    { meters: 5000, reward: 'paper-endless5000' },
  ],
  /** Campaign level that unlocks endless mode. */
  unlockLevel: 'nb1-05',
  /** Max points kept in a stored ghost trail. */
  trailCap: 600,
  /** Max scores waiting for upload. */
  pendingCap: 20,
};
