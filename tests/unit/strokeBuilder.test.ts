import { describe, expect, it } from 'vitest';
import { DRAWING } from '../../src/config/drawing';
import { dist, isConvex, polylineLength } from '../../src/physics/geometry';
import { addSample, buildStroke, clipToLength, resample, simplify } from '../../src/physics/StrokeBuilder';

describe('StrokeBuilder', () => {
  it('only keeps samples at least 12 px apart', () => {
    const pts = [{ x: 0, y: 0 }];
    expect(addSample(pts, { x: 5, y: 0 })).toBe(false);
    expect(addSample(pts, { x: 12, y: 0 })).toBe(true);
    expect(pts).toHaveLength(2);
  });

  it('simplifies a nearly straight line to its ends', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: i % 2 ? 1 : 0 }));
    expect(simplify(pts)).toHaveLength(2);
  });

  it('resamples into segments between 16 and 24 px', () => {
    for (const len of [40, 57, 100, 333, 1000]) {
      const out = resample([{ x: 0, y: 0 }, { x: len, y: 0 }]);
      for (let i = 1; i < out.length; i++) {
        const d = dist(out[i - 1]!, out[i]!);
        expect(d).toBeGreaterThanOrEqual(DRAWING.minSegment - 1e-6);
        expect(d).toBeLessThanOrEqual(DRAWING.maxSegment + 1e-6);
      }
    }
  });

  it('clips a stroke to the remaining ink', () => {
    const out = clipToLength([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 150);
    expect(polylineLength(out)).toBeCloseTo(150);
  });

  it('snaps stroke ends onto nearby nails', () => {
    const anchors = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const s = buildStroke([{ x: 10, y: 8 }, { x: 100, y: 5 }, { x: 190, y: -6 }], anchors)!;
    expect(s.startAnchor).toBe(0);
    expect(s.endAnchor).toBe(1);
    expect(s.points[0]).toEqual({ x: 0, y: 0 });
    expect(s.points[s.points.length - 1]).toEqual({ x: 200, y: 0 });
  });

  it('ignores taps', () => {
    expect(buildStroke([{ x: 0, y: 0 }, { x: 3, y: 3 }], [])).toBeNull();
  });

  it('detects convex polygons', () => {
    expect(isConvex([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(true);
    expect(isConvex([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBe(false);
  });
});
