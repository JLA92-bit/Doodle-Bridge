import { DIFFICULTY } from '../config/endless';
import type { ChunkType, Difficulty } from './types';

const cache = new Map<number, Difficulty>();

/** How hard the course is at a distance in metres. Ramps every `tierMetres`; the same object is returned per tier. */
export function difficultyAt(distanceM: number): Difficulty {
  const tier = Math.max(0, Math.floor(distanceM / DIFFICULTY.tierMetres));
  let d = cache.get(tier);
  if (!d) {
    const types: ChunkType[] = [];
    DIFFICULTY.typesByTier.forEach((add, i) => {
      if (i <= tier) types.push(...add);
    });
    d = {
      tier,
      gapScale: Math.min(DIFFICULTY.gapScaleMax, 1 + DIFFICULTY.gapScalePerTier * tier),
      anchorChance: Math.max(DIFFICULTY.anchorChanceMin, 1 - DIFFICULTY.anchorChancePerTier * tier),
      speed: Math.min(DIFFICULTY.speedMax, 1 + DIFFICULTY.speedPerTier * tier),
      types,
    };
    cache.set(tier, d);
  }
  return d;
}
