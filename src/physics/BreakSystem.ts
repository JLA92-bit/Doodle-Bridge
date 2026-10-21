import Matter from 'matter-js';
import { BREAKING } from '../config/pens';
import type { BridgeChain, Link } from './BridgeChain';
import { dist, type Point } from './geometry';

const { Constraint } = Matter;

export interface Snap {
  chain: BridgeChain;
  link: Link;
  at: Point;
}

/**
 * Measures how far every joint has been pulled apart. A joint stretched past the
 * pen's limit for several steps in a row snaps.
 */
export function updateBreaks(chains: readonly BridgeChain[]): Snap[] {
  const snaps: Snap[] = [];
  for (const chain of chains) {
    const limit = chain.pen.breakStretch;
    for (const link of chain.links) {
      if (link.broken) continue;
      const rest = (chain.lengths[link.index]! + chain.lengths[link.index + 1]!) / 2;
      const gap =
        (dist(Constraint.pointAWorld(link.springs[0]), Constraint.pointBWorld(link.springs[0])) +
          dist(Constraint.pointAWorld(link.springs[1]), Constraint.pointBWorld(link.springs[1]))) /
        2;
      const stretch = gap / rest;
      // Smooth the displayed stress so the tint does not flicker.
      link.stress += (stretch / limit - link.stress) * 0.3;
      link.over = stretch > limit ? link.over + 1 : 0;
      if (link.over >= BREAKING.framesOverLimit) {
        const at = chain.linkPosition(link);
        chain.snap(link);
        snaps.push({ chain, link, at });
      }
    }
  }
  return snaps;
}

/** Highest stress of any intact joint, used for the creak sound. */
export function maxStress(chains: readonly BridgeChain[]): number {
  let max = 0;
  for (const c of chains) for (const l of c.links) if (!l.broken && l.stress > max) max = l.stress;
  return max;
}
