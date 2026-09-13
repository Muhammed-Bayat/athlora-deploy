import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  getIntroCameraState,
  INTRO_CAMERA_START_FOV,
  LEGACY_CAMERA_HANDOFF_FOV,
  LEGACY_CAMERA_HANDOFF_POSITION,
  LEGACY_CAMERA_HANDOFF_TARGET,
} from './introTimeline';
import { getLegacyCameraState, LEGACY_CAMERA_HANDOFF_PROGRESS } from './legacyCamera';

describe('intro camera timeline', () => {
  it('holds eye level through the portal and initial track run', () => {
    const position = new Vector3();
    const target = new Vector3();
    for (let step = 0; step <= 100; step += 1) {
      getIntroCameraState(step / 100, { compact: false, reducedMotion: false }, position, target);
      // Allow the small running bob, but never a return to the old floor-level view.
      expect(position.y).toBeGreaterThanOrEqual(1.07);
      expect(position.y).toBeLessThanOrEqual(1.18);
    }
  });

  it('begins in the tunnel and arrives at the closer legacy camera handoff', () => {
    const position = new Vector3();
    const target = new Vector3();

    const start = getIntroCameraState(0, { compact: false, reducedMotion: false }, position, target);
    expect(position.z).toBeGreaterThan(15);
    expect(start.fov).toBe(INTRO_CAMERA_START_FOV);

    const finish = getIntroCameraState(1, { compact: false, reducedMotion: false }, position, target);
    expect(position.distanceTo(LEGACY_CAMERA_HANDOFF_POSITION)).toBeLessThan(.000001);
    expect(target.distanceTo(LEGACY_CAMERA_HANDOFF_TARGET)).toBeLessThan(.000001);
    expect(finish.fov).toBe(LEGACY_CAMERA_HANDOFF_FOV);
    expect(finish.runningAmount).toBe(0);
  });

  it('uses the same transform when the retained track flight begins', () => {
    const introPosition = new Vector3();
    const introTarget = new Vector3();
    const legacyPosition = new Vector3();
    const legacyTarget = new Vector3();

    getIntroCameraState(1, { compact: false, reducedMotion: false }, introPosition, introTarget);
    getLegacyCameraState(LEGACY_CAMERA_HANDOFF_PROGRESS, legacyPosition, legacyTarget);

    expect(introPosition.distanceTo(legacyPosition)).toBeLessThan(.000001);
    expect(introTarget.distanceTo(legacyTarget)).toBeLessThan(.000001);
  });

  it('keeps the first-person field of view controlled during the run', () => {
    const position = new Vector3();
    const target = new Vector3();
    const state = getIntroCameraState(.4, { compact: false, reducedMotion: false }, position, target);

    expect(state.fov).toBeLessThanOrEqual(42.5);
  });

  it('removes running motion and FOV expansion for reduced-motion users', () => {
    const position = new Vector3();
    const target = new Vector3();
    const state = getIntroCameraState(.58, { compact: false, reducedMotion: true }, position, target);

    expect(state.fov).toBe(LEGACY_CAMERA_HANDOFF_FOV);
    expect(position.y).toBeGreaterThan(0);
  });
});
