import { BOSS_LEVEL, NOTEBOOKS, OPTIONAL_LEVELS, levelId } from '../config/notebooks';
import type { SaveStore } from './Save';

/** Notebooks open with total stars, not completion, so skilled players can skip ahead. */
export function notebookUnlocked(save: SaveStore, notebook: number): boolean {
  const nb = NOTEBOOKS.find((n) => n.id === notebook);
  return !!nb && save.totalStars() >= nb.unlockStars;
}

/** The last non-optional level before `index`, which must be done to open it. */
function requiredBefore(index: number): number | null {
  if (index <= 1) return null;
  let prev = index - 1;
  if (index === BOSS_LEVEL) while (OPTIONAL_LEVELS.includes(prev)) prev--;
  return prev;
}

/**
 * Levels open one after another. The optional challenge levels (8, 9) can be skipped:
 * the boss opens as soon as level 7 is done.
 */
export function levelUnlocked(save: SaveStore, notebook: number, index: number): boolean {
  if (!notebookUnlocked(save, notebook)) return false;
  const req = requiredBefore(index);
  return req === null || save.completed(levelId(notebook, req));
}

export function notebookStars(save: SaveStore, notebook: number): number {
  let n = 0;
  for (let i = 1; i <= 10; i++) n += save.starCount(levelId(notebook, i));
  return n;
}
