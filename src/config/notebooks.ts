export type PaperStyle = 'lined' | 'graph' | 'wet' | 'sketch' | 'night' | 'scraps';

export interface NotebookConfig {
  /** 1 to 6. */
  id: number;
  title: string;
  /** Short description of the new idea it teaches. */
  mechanic: string;
  paper: PaperStyle;
  /** Cover and accent colour. */
  accent: number;
  /** Total stars needed to open this notebook. */
  unlockStars: number;
  /** Unlock reward for finishing it (shown on the cover; granted in phase 8). */
  reward: string;
}

export const NOTEBOOKS: NotebookConfig[] = [
  { id: 1, title: 'Homework', mechanic: 'Draw, nails, ink', paper: 'lined', accent: 0x3c8dde, unlockStars: 0, reward: 'Crayon pen' },
  { id: 2, title: 'Doodle Desert', mechanic: 'Ramps, jumps, boost', paper: 'graph', accent: 0xe0a33a, unlockStars: 10, reward: 'Skateboard' },
  { id: 3, title: 'Rainy Margins', mechanic: 'Moving platforms, wind', paper: 'wet', accent: 0x4bb3a7, unlockStars: 25, reward: 'Marker pen' },
  { id: 4, title: 'Stick Mountain', mechanic: 'Heavy loads, many gaps', paper: 'sketch', accent: 0x8a6ad6, unlockStars: 45, reward: 'Monster truck' },
  { id: 5, title: 'Night Notes', mechanic: 'Darkness, eraser zones', paper: 'night', accent: 0x2b3a67, unlockStars: 70, reward: 'Glow pen' },
  { id: 6, title: 'The Final Exam', mechanic: 'Everything, against the clock', paper: 'scraps', accent: 0xd8433b, unlockStars: 100, reward: 'Rocket car + Golden pencil' },
];

export const LEVELS_PER_NOTEBOOK = 10;
/** Optional challenge levels: they can be skipped on the way to the boss. */
export const OPTIONAL_LEVELS = [8, 9];
export const BOSS_LEVEL = 10;

export const levelId = (notebook: number, index: number): string =>
  `nb${notebook}-${String(index).padStart(2, '0')}`;
