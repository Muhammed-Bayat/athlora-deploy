import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  FileLoader,
  Line,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  type PerspectiveCamera,
  Vector3,
} from 'three';
import styles from './PersistentWebGLStage.module.css';
import { anatomyMapUrl, anatomyModelUrl } from '../../fitness/anatomyAssets';
import { StadiumIntro } from './StadiumIntro';
import {
  getIntroCameraState,
  INTRO_CAMERA_START_FOV,
  INTRO_CAMERA_START_POSITION,
  INTRO_TIMELINE_SPAN,
  LEGACY_CAMERA_HANDOFF_FOV,
} from './introTimeline';
import { getLegacyCameraState, LEGACY_CAMERA_HANDOFF_PROGRESS } from './legacyCamera';

interface PersistentWebGLStageProps {
  progressRef: MutableRefObject<number>;
  introProgressRef: MutableRefObject<number>;
}

interface StoryProgressProps {
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

function SceneDirector({
  targetRef,
  introTargetRef,
  visualTimelineRef,
  introVisualRef,
  storyVisualRef,
}: {
  targetRef: MutableRefObject<number>;
  introTargetRef: MutableRefObject<number>;
  visualTimelineRef: MutableRefObject<number>;
  introVisualRef: MutableRefObject<number>;
  storyVisualRef: MutableRefObject<number>;
}) {
  useFrame((_, delta) => {
    const timelineTarget = introTargetRef.current < 1
      ? introTargetRef.current * INTRO_TIMELINE_SPAN
      : INTRO_TIMELINE_SPAN + targetRef.current * (1 - INTRO_TIMELINE_SPAN);
    visualTimelineRef.current = MathUtils.damp(visualTimelineRef.current, timelineTarget, 5.2, delta);
    introVisualRef.current = MathUtils.clamp(visualTimelineRef.current / INTRO_TIMELINE_SPAN, 0, 1);
    storyVisualRef.current = MathUtils.clamp((visualTimelineRef.current - INTRO_TIMELINE_SPAN) / (1 - INTRO_TIMELINE_SPAN), 0, 1);
  }, -1);
  return null;
}

function stadiumPoints(radius: number, straight: number, y = .03, samples = 320) {
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return new Vector3(Math.sign(Math.cos(angle) || 1) * straight + Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

function createTrackGeometry() {
  const outer = stadiumPoints(4.2, 5.55, 0, 320);
  const inner = stadiumPoints(1.78, 5.55, 0, 320);
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

function TrackLane({ progressRef, introProgressRef, lane }: { progressRef: MutableRefObject<number>; introProgressRef: MutableRefObject<number>; lane: number }) {
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
    const legacyReveal = smoothstep(.02 + lane * .006, .18 + lane * .008, progressRef.current);
    const introReveal = smoothstep(.27 + lane * .008, .47 + lane * .01, introProgressRef.current);
    const reveal = Math.max(legacyReveal, introReveal);
    material.opacity = reveal * (lane === 3 ? .96 : .56);
  });

  return <lineLoop geometry={geometry} renderOrder={-1}><lineBasicMaterial ref={materialRef} color={lane === 3 ? '#e8feff' : '#72b8c5'} transparent depthWrite={false} toneMapped={false} fog={false} /></lineLoop>;
}

function TrackWorld({ progressRef, introProgressRef }: PersistentWebGLStageProps) {
  const geometry = useMemo(createTrackGeometry, []);
  const surfaceRef = useRef<MeshBasicMaterial>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const legacyReveal = smoothstep(.015, .18, progressRef.current);
    const introReveal = smoothstep(.18, .42, introProgressRef.current);
    const reveal = Math.max(legacyReveal, introReveal);
    if (surfaceRef.current) surfaceRef.current.opacity = .12 + reveal * .86;
  });

  return <group rotation={[0, -.13, 0]}>
    {/* Draw the surface before lanes and story overlays regardless of camera sorting. */}
    <mesh geometry={geometry} renderOrder={-2}>
      <meshBasicMaterial ref={surfaceRef} color="#05151d" transparent side={DoubleSide} fog={false} toneMapped={false} />
    </mesh>
    {Array.from({ length: 8 }, (_, lane) => <TrackLane key={lane} lane={lane} progressRef={progressRef} introProgressRef={introProgressRef} />)}
  </group>;
}

function AthleteSignals({ progressRef }: StoryProgressProps) {
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

function EventMarkers({ progressRef }: StoryProgressProps) {
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

function PerformanceRibbon({ progressRef }: StoryProgressProps) {
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

function CameraRig({ progressRef, introProgressRef, compact, reducedMotion }: PersistentWebGLStageProps & { compact: boolean; reducedMotion: boolean }) {
  const { camera } = useThree();
  const targetPosition = useRef(new Vector3());
  const targetLookAt = useRef(new Vector3());
  const actualLookAt = useRef(new Vector3());

  useFrame((_, delta) => {
    const introProgress = introProgressRef.current;
    const fov = introProgress < 1
      ? getIntroCameraState(introProgress, { compact, reducedMotion }, targetPosition.current, targetLookAt.current).fov
      : (() => {
        const legacyProgress = LEGACY_CAMERA_HANDOFF_PROGRESS + progressRef.current * (1 - LEGACY_CAMERA_HANDOFF_PROGRESS);
        getLegacyCameraState(legacyProgress, targetPosition.current, targetLookAt.current);
        return LEGACY_CAMERA_HANDOFF_FOV;
      })();
    const damp = 1 - Math.exp(-5.4 * Math.min(delta, .05));
    camera.position.lerp(targetPosition.current, damp);
    actualLookAt.current.lerp(targetLookAt.current, damp);
    camera.lookAt(actualLookAt.current);
    const perspectiveCamera = camera as PerspectiveCamera;
    if (perspectiveCamera.isPerspectiveCamera && Math.abs(perspectiveCamera.fov - fov) > .001) {
      perspectiveCamera.fov = fov;
      perspectiveCamera.updateProjectionMatrix();
    }
  });
  return null;
}

function FitnessTeaserGate({ progressRef }: StoryProgressProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const loadTeaser = () => {
      useGLTF.preload(anatomyModelUrl);
      useLoader.preload(FileLoader, anatomyMapUrl);
      void loadFitnessTeaser();
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

function LandingScene({ progressRef, introProgressRef, compact, reducedMotion }: PersistentWebGLStageProps & { compact: boolean; reducedMotion: boolean }) {
  const visualTimelineRef = useRef(0);
  const introVisualRef = useRef(0);
  const storyVisualRef = useRef(0);
  return <>
    <fog attach="fog" args={['#00070d', 11, 31]} />
    <ambientLight intensity={.2} color="#9beff8" />
    <directionalLight position={[4, 8, 6]} intensity={1.65} color="#d8feff" />
    <pointLight position={[-5, 4, 1]} intensity={4.5} distance={14} color="#087f9c" />
    <SceneDirector targetRef={progressRef} introTargetRef={introProgressRef} visualTimelineRef={visualTimelineRef} introVisualRef={introVisualRef} storyVisualRef={storyVisualRef} />
    <StadiumIntro introProgressRef={introVisualRef} compact={compact} />
    <CameraRig progressRef={storyVisualRef} introProgressRef={introVisualRef} compact={compact} reducedMotion={reducedMotion} />
    <TrackWorld progressRef={storyVisualRef} introProgressRef={introVisualRef} />
    <AthleteSignals progressRef={storyVisualRef} />
    <EventMarkers progressRef={storyVisualRef} />
    <PerformanceRibbon progressRef={storyVisualRef} />
    <FitnessTeaserGate progressRef={storyVisualRef} />
  </>;
}

function canRenderStage() {
  return typeof window !== 'undefined' && !!window.matchMedia && typeof window.WebGLRenderingContext === 'function' && import.meta.env.MODE !== 'test' && !/jsdom/i.test(window.navigator.userAgent);
}

export function PersistentWebGLStage({ progressRef, introProgressRef }: PersistentWebGLStageProps) {
  const [eligible, setEligible] = useState(canRenderStage);
  const [paused, setPaused] = useState(false);
  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const compact = window.matchMedia('(max-width: 900px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreferences = () => {
      setEligible(canRenderStage());
      setCompact(compact.matches);
      setReducedMotion(reduced.matches);
    };
    const updateVisibility = () => setPaused(document.visibilityState !== 'visible');
    updatePreferences();
    updateVisibility();
    compact.addEventListener('change', updatePreferences);
    reduced.addEventListener('change', updatePreferences);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { compact.removeEventListener('change', updatePreferences); reduced.removeEventListener('change', updatePreferences); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);
  if (!eligible) return null;
  return <StageErrorBoundary><div className={styles.stage} aria-hidden="true"><Canvas dpr={compact ? [1, 1] : [1, 1.5]} camera={{ position: [...INTRO_CAMERA_START_POSITION], fov: INTRO_CAMERA_START_FOV, near: .1, far: 65 }} frameloop={paused ? 'never' : 'always'} gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}><Suspense fallback={null}><LandingScene progressRef={progressRef} introProgressRef={introProgressRef} compact={compact} reducedMotion={reducedMotion} /></Suspense></Canvas></div></StageErrorBoundary>;
}
const loadFitnessTeaser = () => import('./LandingFitnessTeaser').then((module) => ({ default: module.LandingFitnessTeaser }));
const LandingFitnessTeaser = lazy(loadFitnessTeaser);
