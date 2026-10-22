import { levelId } from '../config/notebooks';
import type { LevelData } from './Level';

/** Every campaign level, loaded from /src/levels/nbN-MM.json at build time. */
const modules = import.meta.glob<LevelData>('../levels/nb*.json', { eager: true, import: 'default' });

export const LEVELS: LevelData[] = Object.values(modules).sort((a, b) => a.notebook - b.notebook || a.index - b.index);

const byId = new Map(LEVELS.map((l) => [l.id, l]));

export function getLevel(id: string): LevelData | undefined {
  return byId.get(id);
}

export function levelAt(notebook: number, index: number): LevelData | undefined {
  return byId.get(levelId(notebook, index));
}

export function levelsIn(notebook: number): LevelData[] {
  return LEVELS.filter((l) => l.notebook === notebook);
}

/** The level after this one in campaign order, if it exists. */
export function nextLevel(level: LevelData): LevelData | undefined {
  const i = LEVELS.indexOf(level);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
