import { ENDLESS_SCORE as S } from '../config/scoring';
import type { EndlessEvent } from './types';

export type PopupKind = 'clean' | 'thrifty' | 'air' | 'closeCall' | 'ink' | 'combo';

export interface Popup {
  text: string;
  points: number;
  kind: PopupKind;
}

const fmtMult = (m: number) => `x${m.toFixed(1)}`;

/**
 * Turns endless events plus distance into the score.
 *
 * Multiplier policy: points are multiplied by the multiplier at the moment they are
 * earned, so Score = sum(points x multiplier then) and the formula holds incrementally.
 * Distance points accrue at the current multiplier too. A clean crossing's own bonus is
 * paid at the multiplier before that crossing raises it (so the first one is exactly +100).
 * A snap resets the multiplier to 1.0 and a crossing that was not clean does not raise it.
 */
export class ScoreKeeper {
  multiplier = 1;
  /** Bonus points earned so far, after the multiplier (distance excluded). */
  bonusTotal = 0;
  crossings = 0;
  cleanCrossings = 0;
  snaps = 0;
  /** Pop-ups for the screen; drain with takePopups(). */
  popups: Popup[] = [];
  private distancePoints = 0;
  private lastDistance = 0;

  /** Integer score (floored). */
  get score(): number {
    return Math.floor(this.distancePoints + this.bonusTotal + 1e-9);
  }

  /** Feed the current distance (metres, never decreases) and any new events. */
  update(distanceM: number, events: readonly EndlessEvent[] = []): void {
    // Events first: they happened at or before this distance reading.
    for (const e of events) this.handle(e);
    if (distanceM > this.lastDistance) {
      this.distancePoints += (distanceM - this.lastDistance) * S.pointsPerMetre * this.multiplier;
      this.lastDistance = distanceM;
    }
  }

  /** Returns and clears the pending pop-ups. */
  takePopups(): Popup[] {
    const p = this.popups;
    this.popups = [];
    return p;
  }

  private award(base: number, label: string, kind: PopupKind): void {
    const points = Math.round(base * this.multiplier * 100) / 100;
    this.bonusTotal += points;
    this.pop(`${label} +${Math.round(points)}`, points, kind);
  }

  private pop(text: string, points: number, kind: PopupKind): void {
    this.popups.push({ text, points, kind });
    if (this.popups.length > S.maxPopups) this.popups.shift();
  }

  private handle(e: EndlessEvent): void {
    switch (e.type) {
      case 'snap':
        this.snaps++;
        this.multiplier = 1;
        break;
      case 'crossing': {
        this.crossings++;
        if (e.clean) {
          this.award(S.cleanCrossing, 'Clean!', 'clean');
          if (e.gap.expectedInk > 0 && e.inkUsed < e.gap.expectedInk * S.thriftyInkShare) {
            this.award(S.thriftyCrossing, 'Thrifty!', 'thrifty');
          }
          this.cleanCrossings++;
          const next = Math.min(S.comboMax, Math.round((this.multiplier + S.comboStep) * 1000) / 1000);
          if (next > this.multiplier) this.pop(fmtMult(next), 0, 'combo');
          this.multiplier = next;
        }
        break;
      }
      case 'air': {
        const units = Math.floor(e.ms / S.bigAirUnitMs);
        if (units > 0) this.award(units * S.bigAirPoints, 'Big air!', 'air');
        break;
      }
      case 'closeCall':
        this.award(S.closeCall, 'Close call!', 'closeCall');
        break;
      case 'inkPot':
        this.award(S.inkPot, 'Ink!', 'ink');
        break;
      default:
        break;
    }
  }
}
