import { describe, expect, it } from 'vitest';
import { lapProgress, ovalPoint, ovalTangent, smoothProgress } from './trackMath';

describe('landing track math', () => {
  it('maps the features-to-footer range continuously and clamps outside it', () => {
    expect(lapProgress(800, 1_000, 3_000)).toBe(0);
    expect(lapProgress(1_500, 1_000, 3_000)).toBe(0.25);
    expect(lapProgress(3_200, 1_000, 3_000)).toBe(1);

    const samples = Array.from({ length: 101 }, (_, index) => lapProgress(1_000 + index * 20, 1_000, 3_000));
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
  });

  it('closes the stadium lap without a position discontinuity', () => {
    const start = ovalPoint(0);
    const finish = ovalPoint(1);
    expect(finish.x).toBeCloseTo(start.x, 10);
    expect(finish.z).toBeCloseTo(start.z, 10);

    const beforeFinish = ovalPoint(1 - 1e-5);
    expect(Math.hypot(beforeFinish.x - start.x, beforeFinish.z - start.z)).toBeLessThan(0.001);
  });

  it('contains two straight sections with constant depth', () => {
    const first = [0.02, 0.08, 0.14].map((progress) => ovalPoint(progress));
    const opposite = [0.52, 0.58, 0.64].map((progress) => ovalPoint(progress));

    expect(first.every((point) => point.z === first[0].z)).toBe(true);
    expect(opposite.every((point) => point.z === opposite[0].z)).toBe(true);
    expect(first[2].x).toBeGreaterThan(first[0].x);
    expect(opposite[2].x).toBeLessThan(opposite[0].x);
  });

  it('returns a unit tangent that is continuous across the lap seam', () => {
    const start = ovalTangent(0);
    const finish = ovalTangent(1);
    expect(Math.hypot(start.x, start.z)).toBeCloseTo(1, 10);
    expect(finish.x).toBeCloseTo(start.x, 10);
    expect(finish.z).toBeCloseTo(start.z, 10);
  });

  it('smooths toward scroll progress without overshooting', () => {
    let progress = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const next = smoothProgress(progress, 0.75, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(progress);
      expect(next).toBeLessThanOrEqual(0.75);
      progress = next;
    }
    expect(progress).toBeCloseTo(0.75, 5);
  });
});
