export const DRAWING = {
  /** Raw finger samples are kept when the pointer has moved at least this far. */
  sampleSpacing: 12,
  /** Ramer-Douglas-Peucker tolerance used to smooth jitter out of a stroke. */
  simplifyEpsilon: 2.5,
  /** Simplified strokes are cut into physics segments between these lengths. */
  minSegment: 16,
  maxSegment: 24,
  targetSegment: 20,
  /** Strokes shorter than this are treated as taps and discarded. */
  minStrokeLength: 14,
  /** A stroke end within this radius of a nail snaps onto it and is pinned. */
  anchorSnapRadius: 26,
};
