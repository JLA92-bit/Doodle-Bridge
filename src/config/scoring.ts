/** Campaign scoring. Level score = base + unused ink percent x inkPoints + time bonus. */
export const CAMPAIGN_SCORE = {
  base: 1000,
  /** Points per percent of ink left unused. */
  inkPoints: 20,
  /** Max time bonus, earned at 0 s and falling to 0 at twice the time target. */
  timeBonus: 500,
};
