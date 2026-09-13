import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import {
  getLegacyCameraState,
  getLegacyCameraTangent,
  LEGACY_CAMERA_FOV,
  LEGACY_CAMERA_HANDOFF_PROGRESS,
} from './legacyCamera';

export const INTRO_TIMELINE_SPAN = .38;
export const INTRO_CAMERA_START_POSITION = [-5.75, 1.1, 15.6] as const;
export const INTRO_CAMERA_START_FOV = 39;

export const LEGACY_CAMERA_HANDOFF_POSITION = new Vector3();
export const LEGACY_CAMERA_HANDOFF_TARGET = new Vector3();
export const LEGACY_CAMERA_HANDOFF_FOV = LEGACY_CAMERA_FOV;

const legacyPositionTangent = new Vector3();
const legacyTargetTangent = new Vector3();
getLegacyCameraState(LEGACY_CAMERA_HANDOFF_PROGRESS, LEGACY_CAMERA_HANDOFF_POSITION, LEGACY_CAMERA_HANDOFF_TARGET);
getLegacyCameraTangent(LEGACY_CAMERA_HANDOFF_PROGRESS, legacyPositionTangent, legacyTargetTangent);
const handoffApproachPosition = LEGACY_CAMERA_HANDOFF_POSITION.clone().addScaledVector(legacyPositionTangent, -.9);
const handoffApproachTarget = LEGACY_CAMERA_HANDOFF_TARGET.clone().addScaledVector(legacyTargetTangent, -.7);

const positionPath = new CatmullRomCurve3([
  new Vector3(...INTRO_CAMERA_START_POSITION),
  new Vector3(-5.75, 1.1, 13.6),
  new Vector3(-5.75, 1.1, 10.4),
  new Vector3(-5.7, 1.1, 7.5),
  new Vector3(-5.4, 1.1, 5.85),
  new Vector3(-3.15, 1.1, 4.45),
  new Vector3(.45, 1.1, 3.7),
  new Vector3(3.55, 1.11, 4.1),
  new Vector3(5.9, 1.12, 5.45),
  handoffApproachPosition,
  LEGACY_CAMERA_HANDOFF_POSITION.clone(),
], false, 'centripetal');

const targetPath = new CatmullRomCurve3([
  new Vector3(-5.75, 1.1, 9.2),
  new Vector3(-5.75, 1.1, 8.5),
  new Vector3(-5.7, 1.1, 6.2),
  new Vector3(-5.25, 1.1, 4.8),
  new Vector3(-3, 1.1, 3.9),
  new Vector3(.4, 1.05, 2.6),
  new Vector3(3.2, .85, 1.5),
  new Vector3(4.6, .5, .8),
  handoffApproachTarget,
  LEGACY_CAMERA_HANDOFF_TARGET.clone(),
], false, 'centripetal');

function smoothstep(start: number, end: number, value: number) {
  const t = MathUtils.clamp((value - start) / Math.max(end - start, .0001), 0, 1);
  return t * t * (3 - 2 * t);
}

export interface IntroCameraOptions {
  compact: boolean;
  reducedMotion: boolean;
}

export interface IntroCameraState {
  fov: number;
  runningAmount: number;
}

/**
 * Writes the scroll-derived first-person camera state without allocating during frames.
 * The endpoint matches the closer handoff point on the retained legacy camera path.
 */
export function getIntroCameraState(
  progress: number,
  options: IntroCameraOptions,
  position: Vector3,
  target: Vector3,
): IntroCameraState {
  const clamped = MathUtils.clamp(progress, 0, 1);
  positionPath.getPointAt(clamped, position);
  targetPath.getPointAt(clamped, target);

  const runningAmount = smoothstep(.31, .42, clamped) * (1 - smoothstep(.52, .62, clamped));
  const bobAmount = options.reducedMotion ? 0 : runningAmount * (options.compact ? .012 : .022);

  if (bobAmount > 0) {
    const phase = MathUtils.mapLinear(MathUtils.clamp((clamped - .31) / .2, 0, 1), 0, 1, 0, Math.PI * 4.5);
    position.y += Math.sin(phase) * bobAmount;
    position.x += Math.sin(phase * .5) * bobAmount * .42;
  }

  const tunnelWiden = smoothstep(.08, .22, clamped) * (1 - smoothstep(.58, .78, clamped));
  const speedWiden = runningAmount * (1 - smoothstep(.54, .7, clamped));
  const fov = LEGACY_CAMERA_HANDOFF_FOV + (options.reducedMotion ? 0 : tunnelWiden * 1.5 + speedWiden * 2);

  return { fov, runningAmount };
}
