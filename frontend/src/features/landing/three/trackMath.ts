/**
 * Pure math for the landing page's cinematic chase-camera track, ported exactly
 * from the SDP-Landing mockup's scroll choreography. All coordinates are SVG
 * art-space (1600x900 viewBox) values so the shared TrackArtwork SVG can be
 * translated/rotated by the same numbers the mockup uses.
 */

const CX = 815;
const CY = 500;
const RX = 666;
const RY = 296;
const ARTWORK_ROT = (-8 * Math.PI) / 180;
const DESIRED_SCREEN_HEADING = -68;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothProgress(current: number, target: number, deltaSeconds: number, response = 7): number {
  return current + (target - current) * (1 - Math.exp(-response * Math.max(0, deltaSeconds)));
}

/** Mirrors the mockup's lap window: one full lap from just above The Squad to the
 *  lower page. Returns the smoothed lap progress (0..1) plus the window edges. */
export function lapWindow(
  scrollY: number,
  featuresTop: number,
  footerTop: number,
  viewportHeight: number,
): { progress: number; lapStart: number; lapEnd: number } {
  const lapStart = featuresTop - viewportHeight * 0.26;
  const lapEnd = Math.max(lapStart + viewportHeight * 1.4, footerTop - viewportHeight * 0.28);
  return { progress: clamp01((scrollY - lapStart) / Math.max(1, lapEnd - lapStart)), lapStart, lapEnd };
}

/** The mockup's runner heading in degrees at a lap progress point. */
export function runnerHeading(progress: number): number {
  const theta = -clamp01(progress) * Math.PI * 2;
  const tx = RX * Math.sin(theta);
  const ty = -RY * Math.cos(theta);
  const rtx = tx * Math.cos(ARTWORK_ROT) - ty * Math.sin(ARTWORK_ROT);
  const rty = tx * Math.sin(ARTWORK_ROT) + ty * Math.cos(ARTWORK_ROT);
  return (Math.atan2(rty, rtx) * 180) / Math.PI;
}

/** The runner's screen-space position (rotated ellipse) at a lap progress point,
 *  matching the mockup's `runnerX`/`runnerY`. */
export function runnerScreenPoint(progress: number): { x: number; y: number } {
  const theta = -clamp01(progress) * Math.PI * 2;
  const ex = CX + RX * Math.cos(theta);
  const ey = CY + RY * Math.sin(theta);
  const dx0 = ex - CX;
  const dy0 = ey - CY;
  const ca = Math.cos(ARTWORK_ROT);
  const sa = Math.sin(ARTWORK_ROT);
  return { x: CX + dx0 * ca - dy0 * sa, y: CY + dx0 * sa + dy0 * ca };
}

/** The mockup's drone camera values: oblique pitch, bend-dependent bank, and a
 *  fit-scaled zoom that keeps the oval framed for the current viewport. */
export function droneRig(progress: number, viewportWidth: number, viewportHeight: number) {
  const theta = -clamp01(progress) * Math.PI * 2;
  const heading = runnerHeading(progress);
  const yaw = DESIRED_SCREEN_HEADING - heading;
  const targetX = viewportWidth * 0.72;
  const targetY = viewportHeight * 0.7;
  const bendAmount = Math.abs(Math.cos(theta));
  const fitScale = Math.max(viewportWidth / 1600, viewportHeight / 900);
  const droneZoom = fitScale * (2.02 + bendAmount * 0.13);
  const pitch = 60 + bendAmount * 3.0;
  const bank = Math.sin(theta) * 1.2;
  return { theta, heading, yaw, targetX, targetY, bendAmount, fitScale, droneZoom, pitch, bank };
}

/** The camera wrapper transform string, matching the mockup byte-for-byte in form. */
export function cameraTransform(rig: ReturnType<typeof droneRig>): string {
  return `translate3d(${rig.targetX.toFixed(1)}px,${rig.targetY.toFixed(1)}px,0) rotateX(${rig.pitch.toFixed(2)}deg) rotateY(${rig.bank.toFixed(2)}deg) rotateZ(${rig.yaw.toFixed(2)}deg) scale3d(${rig.droneZoom.toFixed(4)},${rig.droneZoom.toFixed(4)},1)`;
}

/** The track-object transform string: the artwork is translated by the negative
 *  runner position so the camera effectively chases the lap. */
export function objectTransform(progress: number): string {
  const point = runnerScreenPoint(progress);
  return `translate3d(${(-point.x).toFixed(2)}px,${(-point.y).toFixed(2)}px,0)`;
}

/** Per-section opacity ladder from the mockup (features .23 → faq .075). */
export function findTrackOpacity(
  scrollY: number,
  sceneTops: number[],
  opacities: number[],
): number {
  if (!sceneTops.length || !opacities.length) return 0;
  if (scrollY <= sceneTops[0]) return 0;
  for (let i = 0; i < opacities.length - 1; i += 1) {
    if (scrollY <= sceneTops[i + 1]) {
      const t = clamp01((scrollY - sceneTops[i]) / Math.max(1, sceneTops[i + 1] - sceneTops[i]));
      return lerp(opacities[i], opacities[i + 1], t);
    }
  }
  return opacities[opacities.length - 1];
}