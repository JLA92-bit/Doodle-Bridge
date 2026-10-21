export type PenId = 'pencil' | 'crayon' | 'marker' | 'glow' | 'golden';

export interface PenConfig {
  id: PenId;
  name: string;
  /** Multiplier applied to a level's ink allowance. */
  inkMultiplier: number;
  /** Matter constraint stiffness between neighbouring segments (0.6 to 0.9). */
  stiffness: number;
  /** Constraint damping, higher feels less springy. */
  damping: number;
  /** Segment thickness in px. */
  thickness: number;
  /** Segment body density (Matter units). */
  density: number;
  friction: number;
  /** Joint gap as a fraction of segment length that counts as overstretched (snaps after a few steps). */
  breakStretch: number;
  colour: number;
}

export const PENS: Record<PenId, PenConfig> = {
  pencil: {
    id: 'pencil', name: 'Pencil', inkMultiplier: 1, stiffness: 0.75, damping: 0.08,
    thickness: 7, density: 0.0012, friction: 0.9, breakStretch: 0.13, colour: 0x4a4a4f,
  },
  crayon: {
    id: 'crayon', name: 'Crayon', inkMultiplier: 1.3, stiffness: 0.6, damping: 0.05,
    thickness: 9, density: 0.0012, friction: 0.95, breakStretch: 0.2, colour: 0xe0663a,
  },
  marker: {
    id: 'marker', name: 'Marker', inkMultiplier: 0.7, stiffness: 0.9, damping: 0.1,
    thickness: 8, density: 0.0012, friction: 0.9, breakStretch: 0.2, colour: 0x2e5fb8,
  },
  glow: {
    id: 'glow', name: 'Glow Pen', inkMultiplier: 1, stiffness: 0.75, damping: 0.08,
    thickness: 7, density: 0.0012, friction: 0.9, breakStretch: 0.13, colour: 0x7cf2c8,
  },
  golden: {
    id: 'golden', name: 'Golden Pencil', inkMultiplier: 1, stiffness: 0.9, damping: 0.1,
    thickness: 7, density: 0.0012, friction: 0.9, breakStretch: 0.32, colour: 0xd9a400,
  },
};

/** How nails hold a stroke: a hinge at the nail plus a softer second pin a little further along. */
export const ANCHOR = {
  hingeStiffness: 1,
  braceStiffness: 0.35,
  braceDistance: 12,
};

export const BREAKING = {
  /** A joint snaps after being over its pen's breakStretch for this many steps in a row. */
  framesOverLimit: 6,
  /** Stress (fraction of the limit) where lines start to tint red. */
  tintFrom: 0.35,
};
