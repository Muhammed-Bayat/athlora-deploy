import { describe, expect, it } from 'vitest';
import {
  cameraTransform,
  clamp01,
  droneRig,
  findTrackOpacity,
  lapWindow,
  objectTransform,
  runnerHeading,
  runnerScreenPoint,
  smoothProgress,
} from './trackMath';

describe('landing track math', () => {
  it('clamps progress to the mockup lap window and clamps outside it', () => {
    const featureTop = 2_000;
    const footerTop = 6_000;
    const vh = 800;
    const lapStart = featureTop - vh * 0.26;
    const lapEnd = Math.max(lapStart + vh * 1.4, footerTop - vh * 0.28);

    expect(lapWindow(lapStart - 100, featureTop, footerTop, vh).progress).toBe(0);
    expect(lapWindow(lapEnd + 100, featureTop, footerTop, vh).progress).toBe(1);
    expect(lapWindow((lapStart + lapEnd) / 2, featureTop, footerTop, vh).progress).toBeCloseTo(0.5, 5);
  });

  it('maps the lap window continuously', () => {
    const featureTop = 2_000;
    const footerTop = 6_000;
    const vh = 800;
    const { lapStart, lapEnd } = lapWindow(0, featureTop, footerTop, vh);
    const samples = Array.from({ length: 101 }, (_, index) =>
      lapWindow(lapStart + (index * (lapEnd - lapStart)) / 100, featureTop, footerTop, vh).progress,
    );
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
  });

  it('traces the mockup runner on an ellipse that closes without a discontinuity', () => {
    const start = runnerScreenPoint(0);
    const finish = runnerScreenPoint(1);
    expect(finish.x).toBeCloseTo(start.x, 10);
    expect(finish.y).toBeCloseTo(start.y, 10);

    const beforeFinish = runnerScreenPoint(1 - 1e-5);
    expect(Math.hypot(beforeFinish.x - start.x, beforeFinish.y - start.y)).toBeLessThan(0.5);
  });

  it('returns a heading that wraps continuously across the lap seam', () => {
    const start = runnerHeading(0);
    const finish = runnerHeading(1);
    const delta = Math.abs(((finish - start + 540) % 360) - 180);
    expect(delta).toBeLessThan(0.001);
  });

  it('places the runner lower/right in frame like the mockup target', () => {
    const rig = droneRig(0, 1440, 900);
    expect(rig.targetX).toBeCloseTo(1440 * 0.72, 5);
    expect(rig.targetY).toBeCloseTo(900 * 0.7, 5);
  });

  it('zooms to fit the oval and pitches like a low aerial drone', () => {
    const rig = droneRig(0, 1600, 900);
    expect(rig.droneZoom).toBeCloseTo(2.15, 5);
    expect(rig.pitch).toBeCloseTo(63, 5);
  });

  it('builds a camera transform string in the mockup form', () => {
    const rig = droneRig(0.25, 1600, 900);
    const transform = cameraTransform(rig);
    expect(transform).toMatch(/^translate3d\([0-9.]+px,[0-9.]+px,0\) rotateX\(/);
    expect(transform).toContain('rotateY(');
    expect(transform).toContain('rotateZ(');
    expect(transform).toContain('scale3d(');
  });

  it('translates the artwork by the negative runner position', () => {
    const point = runnerScreenPoint(0.25);
    const transform = objectTransform(0.25);
    expect(transform).toBe(`translate3d(${(-point.x).toFixed(2)}px,${(-point.y).toFixed(2)}px,0)`);
  });

  it('fades per section with the mockup opacity ladder', () => {
    const tops = [1000, 2000, 3000, 4000];
    const opacities = [0.23, 0.2, 0.15, 0.075];
    expect(findTrackOpacity(500, tops, opacities)).toBe(0);
    expect(findTrackOpacity(1000, tops, opacities)).toBe(0);
    expect(findTrackOpacity(1100, tops, opacities)).toBeCloseTo(0.227, 5);
    expect(findTrackOpacity(4000, tops, opacities)).toBe(0.075);
    expect(findTrackOpacity(2000, tops, opacities)).toBeCloseTo(0.2, 5);
    expect(findTrackOpacity(2500, tops, opacities)).toBeCloseTo(0.175, 5);
  });

  it('clamps a value to the unit interval', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
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