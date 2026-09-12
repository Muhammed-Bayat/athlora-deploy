import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

export const LEGACY_CAMERA_HANDOFF_PROGRESS = .16;
export const LEGACY_CAMERA_FOV = 39;

const positionPath = new CatmullRomCurve3([
  new Vector3(0, .82, 14.8), new Vector3(3.4, .94, 10.7), new Vector3(8.6, 1.18, 5.1),
  new Vector3(9.5, 1.34, -2.2), new Vector3(5.3, 1.52, -7.4), new Vector3(-2.8, 1.4, -8.7),
  new Vector3(-8.8, 1.7, -3.2), new Vector3(-8.4, 2.4, 4.8), new Vector3(-2.6, 2.95, 8.8),
  new Vector3(5.8, 6.7, 13.4), new Vector3(0, 10.8, 16.6),
]);

const targetPath = new CatmullRomCurve3([
  new Vector3(0, .06, 1.2), new Vector3(3.8, .08, .5), new Vector3(6.7, .14, -1.6),
  new Vector3(4.7, .18, -3.3), new Vector3(.7, .22, -3.7), new Vector3(-3.7, .32, -1.5),
  new Vector3(-4.4, .55, 1.8), new Vector3(-1.5, 1.15, .4), new Vector3(0, 1.7, 0),
  new Vector3(0, .2, 0), new Vector3(0, .1, 0),
]);

export function getLegacyCameraState(progress: number, position: Vector3, target: Vector3) {
  const clamped = MathUtils.clamp(progress, 0, 1);
  positionPath.getPointAt(clamped, position);
  targetPath.getPointAt(clamped, target);
}

export function getLegacyCameraTangent(progress: number, position: Vector3, target: Vector3) {
  const clamped = MathUtils.clamp(progress, 0, 1);
  positionPath.getTangentAt(clamped, position);
  targetPath.getTangentAt(clamped, target);
}
