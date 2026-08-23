import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  MathUtils,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import styles from './PersistentWebGLStage.module.css';

interface PersistentWebGLStageProps {
  progressRef: MutableRefObject<number>;
}

interface StageErrorBoundaryProps {
  children: ReactNode;
}

interface StageErrorBoundaryState {
  failed: boolean;
}

class StageErrorBoundary extends Component<StageErrorBoundaryProps, StageErrorBoundaryState> {
  state: StageErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): StageErrorBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function smoothstep(start: number, end: number, value: number) {
  const t = MathUtils.clamp((value - start) / Math.max(end - start, .0001), 0, 1);
  return t * t * (3 - 2 * t);
}

function SceneDirector({ targetRef, visualRef }: { targetRef: MutableRefObject<number>; visualRef: MutableRefObject<number> }) {
  useFrame((_, delta) => {
    visualRef.current = MathUtils.damp(visualRef.current, targetRef.current, 5.2, delta);
  }, -1);
  return null;
}

function stadiumPoints(radius: number, straight: number, y = .03, samples = 180) {
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return new Vector3(Math.sign(Math.cos(angle) || 1) * straight + Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

function createTrackGeometry() {
  const outer = stadiumPoints(4.2, 5.55, 0, 220);
  const inner = stadiumPoints(1.78, 5.55, 0, 220);
  const positions: number[] = [];
  const indices: number[] = [];
  outer.forEach((point, index) => {
    const inside = inner[index];
    positions.push(point.x, .02, point.z, inside.x, .02, inside.z, point.x, -.22, point.z, inside.x, -.22, inside.z);
    const next = (index + 1) % outer.length;
    const currentTopOuter = index * 4;
    const nextTopOuter = next * 4;
    indices.push(currentTopOuter, nextTopOuter, currentTopOuter + 1, nextTopOuter, nextTopOuter + 1, currentTopOuter + 1);
    indices.push(currentTopOuter, currentTopOuter + 2, nextTopOuter, nextTopOuter, currentTopOuter + 2, nextTopOuter + 2);
    indices.push(currentTopOuter + 1, nextTopOuter + 1, currentTopOuter + 3, nextTopOuter + 1, nextTopOuter + 3, currentTopOuter + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function TrackLane({ progressRef, lane }: { progressRef: MutableRefObject<number>; lane: number }) {
  const geometry = useMemo(() => {
    const radius = 2.02 + lane * .29;
    const next = new BufferGeometry().setFromPoints(stadiumPoints(radius, 5.55, .045));
    return next;
  }, [lane]);
  const materialRef = useRef<LineBasicMaterial>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    const reveal = smoothstep(.02 + lane * .006, .18 + lane * .008, progressRef.current);
    material.opacity = reveal * (lane === 3 ? .88 : .38);
  });

  return <lineLoop geometry={geometry}><lineBasicMaterial ref={materialRef} color={lane === 3 ? '#d7fdff' : '#4a8291'} transparent depthWrite={false} /></lineLoop>;
}

function TrackWorld({ progressRef }: PersistentWebGLStageProps) {
  const geometry = useMemo(createTrackGeometry, []);
  const surfaceRef = useRef<MeshStandardMaterial>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const reveal = smoothstep(.015, .18, progressRef.current);
    if (surfaceRef.current) surfaceRef.current.opacity = .12 + reveal * .86;
  });

  return <group rotation={[0, -.13, 0]}>
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial ref={surfaceRef} color="#05151d" roughness={.82} metalness={.18} transparent side={DoubleSide} />
    </mesh>
    {Array.from({ length: 8 }, (_, lane) => <TrackLane key={lane} lane={lane} progressRef={progressRef} />)}
  </group>;
}

function AthleteSignals({ progressRef }: PersistentWebGLStageProps) {
  const groupRef = useRef<import('three').Group>(null);
  const curve = useMemo(() => new CatmullRomCurve3(stadiumPoints(2.9, 5.55, .12, 96), true), []);
  const offsets = useMemo(() => [.04, .27, .49, .72], []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const presence = smoothstep(.14, .3, progressRef.current) * (1 - smoothstep(.82, .94, progressRef.current) * .38);
    group.visible = presence > .002;
    group.children.forEach((child, index) => {
      const point = curve.getPointAt((offsets[index] + progressRef.current * (.42 + index * .04)) % 1);
      child.position.copy(point);
      child.scale.setScalar(.44 + presence * .95);
    });
  });

  return <group ref={groupRef}>{offsets.map((offset) => <mesh key={offset}><sphereGeometry args={[.09, 12, 12]} /><meshBasicMaterial color="#d8fdff" /></mesh>)}</group>;
}

function EventMarkers({ progressRef }: PersistentWebGLStageProps) {
  const groupRef = useRef<import('three').Group>(null);
  const positions = useMemo(() => [
    new Vector3(5.4, .08, 2.85),
    new Vector3(-2.4, .08, -3.18),
    new Vector3(-7.1, .08, 1.7),
  ], []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const presence = smoothstep(.43, .53, progressRef.current) * (1 - smoothstep(.75, .86, progressRef.current));
    group.visible = presence > .002;
    group.children.forEach((child, index) => child.scale.setScalar(.2 + presence * (1 + index * .06)));
  });

  return <group ref={groupRef}>{positions.map((position, index) => <group key={position.toArray().join('-')} position={position}><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.27, .018, 8, 32]} /><meshBasicMaterial color={index === 1 ? '#d8fdff' : '#49c8da'} transparent opacity={.9} /></mesh><mesh position={[0, .36, 0]}><cylinderGeometry args={[.008, .008, .7, 6]} /><meshBasicMaterial color="#8ae9f2" transparent opacity={.72} /></mesh></group>)}</group>;
}

function PerformanceRibbon({ progressRef }: PersistentWebGLStageProps) {
  const trackPoints = useMemo(() => stadiumPoints(2.88, 5.55, .065, 180), []);
  const dataPoints = useMemo(() => [
    [32, '11.47'], [68, '11.39'], [111, '11.31'], [154, '11.24 PB'],
  ] as const, []);
  const graphPoints = useMemo(() => trackPoints.map((_, index) => {
    const t = index / (trackPoints.length - 1);
    return new Vector3(-7.6 + t * 15.2, .2 + Math.sin(t * Math.PI * 3.2) * .55 + t * 3.4, -.15 + Math.cos(t * Math.PI * 2) * .42);
  }), [trackPoints]);
  const geometry = useMemo(() => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(trackPoints.length * 3, 3)), [trackPoints.length]);
  const material = useMemo(() => new LineBasicMaterial({ color: '#e2feff', transparent: true, depthWrite: false }), []);
  const line = useMemo(() => new Line(geometry, material), [geometry, material]);
  const markerRefs = useRef<Array<import('three').Group | null>>([]);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const labelsVisibleRef = useRef(false);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    const progress = progressRef.current;
    const morph = smoothstep(.58, .7, progress) * (1 - smoothstep(.84, .94, progress));
    const attribute = geometry.getAttribute('position') as Float32BufferAttribute;
    trackPoints.forEach((point, index) => attribute.setXYZ(index, MathUtils.lerp(point.x, graphPoints[index].x, morph), MathUtils.lerp(point.y, graphPoints[index].y, morph), MathUtils.lerp(point.z, graphPoints[index].z, morph)));
    attribute.needsUpdate = true;
    material.opacity = smoothstep(.04, .17, progress) * (.25 + morph * .75) * (1 - smoothstep(.93, 1, progress));
    const markerPresence = smoothstep(.63, .69, progress) * (1 - smoothstep(.84, .91, progress));
    const shouldShowLabels = progress >= .63 && progress <= .91;
    if (labelsVisibleRef.current !== shouldShowLabels) {
      labelsVisibleRef.current = shouldShowLabels;
      setLabelsVisible(shouldShowLabels);
    }
    dataPoints.forEach(([pointIndex], index) => {
      const marker = markerRefs.current[index];
      if (!marker) return;
      const trackPoint = trackPoints[pointIndex];
      const graphPoint = graphPoints[pointIndex];
      marker.position.set(MathUtils.lerp(trackPoint.x, graphPoint.x, morph), MathUtils.lerp(trackPoint.y, graphPoint.y, morph), MathUtils.lerp(trackPoint.z, graphPoint.z, morph));
      marker.visible = markerPresence > .002;
      marker.scale.setScalar(.35 + markerPresence * .65);
    });
  });
  return <><primitive object={line} /><group>{dataPoints.map(([, value], index) => <group key={value} ref={(node) => { markerRefs.current[index] = node; }}><mesh><sphereGeometry args={[.12, 12, 12]} /><meshBasicMaterial color="#f4feff" /></mesh>{labelsVisible && <Html transform distanceFactor={8} center><span style={{ display: 'block', padding: '4px 7px', border: '1px solid rgba(138, 233, 242, .44)', borderRadius: '999px', color: '#d9fdff', background: 'rgba(0, 12, 20, .74)', fontFamily: 'Space Grotesk, sans-serif', fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{value}</span></Html>}</group>)}</group></>;
}

function CameraRig({ progressRef }: PersistentWebGLStageProps) {
  const { camera } = useThree();
  const positionPath = useMemo(() => new CatmullRomCurve3([
    new Vector3(0, .82, 14.8), new Vector3(3.4, .94, 10.7), new Vector3(8.6, 1.18, 5.1),
    new Vector3(9.5, 1.34, -2.2), new Vector3(5.3, 1.52, -7.4), new Vector3(-2.8, 1.4, -8.7),
    new Vector3(-8.8, 1.7, -3.2), new Vector3(-8.4, 2.4, 4.8), new Vector3(-2.6, 2.95, 8.8),
    new Vector3(5.8, 6.7, 13.4), new Vector3(0, 10.8, 16.6),
  ]), []);
  const targetPath = useMemo(() => new CatmullRomCurve3([
    new Vector3(0, .06, 1.2), new Vector3(3.8, .08, .5), new Vector3(6.7, .14, -1.6),
    new Vector3(4.7, .18, -3.3), new Vector3(.7, .22, -3.7), new Vector3(-3.7, .32, -1.5),
    new Vector3(-4.4, .55, 1.8), new Vector3(-1.5, 1.15, .4), new Vector3(0, 1.7, 0),
    new Vector3(0, .2, 0), new Vector3(0, .1, 0),
  ]), []);
  const targetPosition = useRef(new Vector3());
  const targetLookAt = useRef(new Vector3());
  const actualLookAt = useRef(new Vector3());

  useFrame((_, delta) => {
    const progress = progressRef.current;
    positionPath.getPointAt(progress, targetPosition.current);
    targetPath.getPointAt(progress, targetLookAt.current);
    const damp = 1 - Math.exp(-5.4 * Math.min(delta, .05));
    camera.position.lerp(targetPosition.current, damp);
    actualLookAt.current.lerp(targetLookAt.current, damp);
    camera.lookAt(actualLookAt.current);
  });
  return null;
}

function FitnessTeaserGate({ progressRef }: PersistentWebGLStageProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const loadTeaser = () => {
      useGLTF.preload('/models/athlora-anatomy.glb');
      setReady(true);
    };
    // Parsing the 5 MB anatomy model during the intro competes with its animation.
    const idleCallback = 'requestIdleCallback' in window
      ? window.requestIdleCallback(loadTeaser, { timeout: 5000 })
      : null;
    const timer = idleCallback === null ? window.setTimeout(loadTeaser, 2500) : null;
    return () => {
      if (idleCallback !== null) window.cancelIdleCallback(idleCallback);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
  return ready ? <Suspense fallback={null}><LandingFitnessTeaser progressRef={progressRef} /></Suspense> : null;
}

function LandingScene({ progressRef }: PersistentWebGLStageProps) {
  const visualProgressRef = useRef(0);
  return <>
    <fog attach="fog" args={['#00070d', 11, 31]} />
    <ambientLight intensity={.2} color="#9beff8" />
    <directionalLight position={[4, 8, 6]} intensity={1.65} color="#d8feff" />
    <pointLight position={[-5, 4, 1]} intensity={4.5} distance={14} color="#087f9c" />
    <SceneDirector targetRef={progressRef} visualRef={visualProgressRef} />
    <CameraRig progressRef={visualProgressRef} />
    <TrackWorld progressRef={visualProgressRef} />
    <AthleteSignals progressRef={visualProgressRef} />
    <EventMarkers progressRef={visualProgressRef} />
    <PerformanceRibbon progressRef={visualProgressRef} />
    <FitnessTeaserGate progressRef={visualProgressRef} />
  </>;
}

function canRenderStage() {
  if (typeof window === 'undefined' || !window.matchMedia || typeof window.WebGLRenderingContext !== 'function' || import.meta.env.MODE === 'test' || /jsdom/i.test(window.navigator.userAgent)) return false;
  return !window.matchMedia('(max-width: 900px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PersistentWebGLStage({ progressRef }: PersistentWebGLStageProps) {
  const [eligible, setEligible] = useState(canRenderStage);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 900px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateEligibility = () => setEligible(canRenderStage());
    const updateVisibility = () => setPaused(document.visibilityState !== 'visible');
    updateVisibility();
    compact.addEventListener('change', updateEligibility);
    reduced.addEventListener('change', updateEligibility);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { compact.removeEventListener('change', updateEligibility); reduced.removeEventListener('change', updateEligibility); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);
  if (!eligible) return null;
  return <StageErrorBoundary><div className={styles.stage} aria-hidden="true"><Canvas dpr={[1, 1.5]} camera={{ position: [0, .82, 14.8], fov: 39, near: .1, far: 65 }} frameloop={paused ? 'never' : 'always'} gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}><Suspense fallback={null}><LandingScene progressRef={progressRef} /></Suspense></Canvas></div></StageErrorBoundary>;
}
const LandingFitnessTeaser = lazy(() =>
  import('./LandingFitnessTeaser').then((module) => ({ default: module.LandingFitnessTeaser })),
);
