export interface TrackPoint {
  x: number;
  z: number;
}

const DEFAULT_HALF_STRAIGHT = 5.2;
const DEFAULT_RADIUS = 4.5;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lapProgress(scrollY: number, featureTop: number, footerTop: number): number {
  if (footerTop <= featureTop) return 0;
  return clamp01((scrollY - featureTop) / (footerTop - featureTop));
}

export function ovalPoint(
  progress: number,
  radius = DEFAULT_RADIUS,
  halfStraight = DEFAULT_HALF_STRAIGHT,
): TrackPoint {
  const straightLength = halfStraight * 2;
  const bendLength = Math.PI * radius;
  const lapLength = straightLength * 2 + bendLength * 2;
  let distance = clamp01(progress) * lapLength;

  if (distance <= straightLength) {
    return { x: -halfStraight + distance, z: -radius };
  }
  distance -= straightLength;
  if (distance <= bendLength) {
    const angle = -Math.PI / 2 + distance / radius;
    return { x: halfStraight + Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }
  distance -= bendLength;
  if (distance <= straightLength) {
    return { x: halfStraight - distance, z: radius };
  }

  distance -= straightLength;
  const angle = Math.PI / 2 + distance / radius;
  return { x: -halfStraight + Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

export function ovalTangent(
  progress: number,
  radius = DEFAULT_RADIUS,
  halfStraight = DEFAULT_HALF_STRAIGHT,
): TrackPoint {
  const straightLength = halfStraight * 2;
  const bendLength = Math.PI * radius;
  const lapLength = straightLength * 2 + bendLength * 2;
  let distance = clamp01(progress) * lapLength;

  if (distance <= straightLength) return { x: 1, z: 0 };
  distance -= straightLength;
  if (distance <= bendLength) {
    const angle = -Math.PI / 2 + distance / radius;
    return { x: -Math.sin(angle), z: Math.cos(angle) };
  }
  distance -= bendLength;
  if (distance <= straightLength) return { x: -1, z: 0 };

  distance -= straightLength;
  const angle = Math.PI / 2 + distance / radius;
  return { x: -Math.sin(angle), z: Math.cos(angle) };
}

export function smoothProgress(current: number, target: number, deltaSeconds: number, response = 7): number {
  return current + (target - current) * (1 - Math.exp(-response * Math.max(0, deltaSeconds)));
}
