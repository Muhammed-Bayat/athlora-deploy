import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import styles from './TrackExperience.module.css';
import { lapProgress, ovalPoint, ovalTangent, smoothProgress } from './trackMath';

type SceneMode = 'hidden' | 'lap' | 'static';

interface SceneRuntime {
  mode: SceneMode;
  targetProgress: number;
  progress: number;
  invalidate: (() => void) | null;
}

const STATIC_POSITION = new THREE.Vector3(12, 12, 15);
const HALF_STRAIGHT = 5.2;
const RUNNER_RADIUS = 4.5;
const LANE_RADII = [3.7, 3.92, 4.14, 4.36, 4.58, 4.8, 5.02, 5.24];

function stadiumShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-HALF_STRAIGHT, -radius);
  shape.lineTo(HALF_STRAIGHT, -radius);
  shape.absarc(HALF_STRAIGHT, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-HALF_STRAIGHT, radius);
  shape.absarc(-HALF_STRAIGHT, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

function TrackModel() {
  const trackShape = useMemo(() => {
    const shape = stadiumShape(LANE_RADII[LANE_RADII.length - 1]);
    shape.holes.push(stadiumShape(LANE_RADII[0]));
    return shape;
  }, []);
  const infieldShape = useMemo(() => stadiumShape(3.12), []);
  const laneCurves = useMemo(() => LANE_RADII.map((radius) => {
    const points = Array.from({ length: 193 }, (_, index) => {
      const point = ovalPoint(index / 192, radius, HALF_STRAIGHT);
      return new THREE.Vector3(point.x, .11, point.z);
    });
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
  }), []);

  return (
    <group>
      <mesh position-y={.1} rotation-x={Math.PI / 2} castShadow receiveShadow>
        <extrudeGeometry args={[trackShape, { depth: .14, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 64 }]} />
        <meshStandardMaterial color="#04364f" roughness={.88} metalness={.015} />
      </mesh>
      <mesh position-y={.02} rotation-x={-Math.PI / 2} receiveShadow>
        <shapeGeometry args={[infieldShape, 64]} />
        <meshStandardMaterial color="#062d36" roughness={.98} metalness={0} />
      </mesh>
      {laneCurves.map((curve, index) => {
        const edge = index === 0 || index === laneCurves.length - 1;
        return (
          <mesh key={index}>
            <tubeGeometry args={[curve, 192, edge ? .03 : .022, 6, true]} />
            <meshStandardMaterial
              color={edge ? '#eefcff' : '#b8f4f8'}
              roughness={.4}
              emissive={edge ? '#4ec6d8' : '#2aa9c4'}
              emissiveIntensity={.62}
            />
          </mesh>
        );
      })}
      <mesh position={[-HALF_STRAIGHT, .13, -RUNNER_RADIUS]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.055, 1.48]} />
        <meshStandardMaterial color="#efffff" roughness={.45} emissive="#69d9e7" emissiveIntensity={.1} />
      </mesh>
    </group>
  );
}

const START_Y = 0.08;

const LOGO_NAVY = '#001D3C';
const LOGO_CYAN = '#5CCCFE';
const LOGO_BLUE = '#5AC9FE';

/** A stylized humanoid sprinter built from overlapping primitives so every joint
 *  connects. Painted in the logo's crisp cyan/blue palette (no clothes, no skin)
 *  and faces +Z (forward). */
function Runner() {
  const torso = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const shinL = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 7.2;
    const swing = Math.sin(t);
    const opp = Math.sin(t + Math.PI);
    const rotate = (target: THREE.Group | null, x: number) => {
      if (target) target.rotation.x = x;
    };
    rotate(armL.current, swing * .85 - .08);
    rotate(armR.current, opp * .85 - .08);
    rotate(foreL.current, .18 + Math.max(0, -swing) * .45);
    rotate(foreR.current, .18 + Math.max(0, -opp) * .45);
    rotate(legL.current, opp * .72);
    rotate(legR.current, swing * .72);
    rotate(shinL.current, .08 - Math.max(0, -opp) * .5);
    rotate(shinR.current, .08 - Math.max(0, -swing) * .5);
    if (torso.current) {
      torso.current.rotation.x = Math.sin(t * 2) * .03 - .13;
      torso.current.position.y = .58 + Math.abs(Math.cos(t)) * .04;
    }
  });

  return (
    <group>
      <group ref={torso} position={[0, .58, 0]}>
        {/* Torso */}
        <mesh position-y={0} castShadow>
          <capsuleGeometry args={[.11, .24, 8, 16]} />
          <meshStandardMaterial color={LOGO_CYAN} roughness={.45} metalness={.05} />
        </mesh>
        {/* Head (sits into the torso top) */}
        <mesh position-y={.30} castShadow>
          <sphereGeometry args={[.10, 20, 14]} />
          <meshStandardMaterial color={LOGO_NAVY} roughness={.6} />
        </mesh>

        {/* Arms pivot on the shoulder, overlapping the torso */}
        {[{ ref: armL, fore: foreL, side: -1 }, { ref: armR, fore: foreR, side: 1 }].map(({ ref, fore, side }) => (
          <group key={side} ref={ref} position={[side * .15, .13, 0]}>
            <mesh position-y={-.11} castShadow>
              <capsuleGeometry args={[.04, .16, 6, 10]} />
              <meshStandardMaterial color={LOGO_CYAN} roughness={.45} />
            </mesh>
            <group ref={fore} position={[0, -.2, 0]}>
              <mesh position-y={-.07} castShadow>
                <capsuleGeometry args={[.036, .13, 6, 10]} />
                <meshStandardMaterial color={LOGO_BLUE} roughness={.45} />
              </mesh>
              <mesh position-y={-.155} castShadow>
                <sphereGeometry args={[.045, 12, 8]} />
                <meshStandardMaterial color={LOGO_BLUE} roughness={.5} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Legs pivot on the hip, overlapping the torso bottom */}
        {[{ ref: legL, shin: shinL, side: -1 }, { ref: legR, shin: shinR, side: 1 }].map(({ ref, shin, side }) => (
          <group key={side} ref={ref} position={[side * .08, -.24, 0]}>
            <mesh position-y={-.1} castShadow>
              <capsuleGeometry args={[.05, .15, 6, 10]} />
              <meshStandardMaterial color={LOGO_BLUE} roughness={.45} />
            </mesh>
            <group ref={shin} position={[0, -.2, 0]}>
              <mesh position-y={-.07} castShadow>
                <capsuleGeometry args={[.042, .13, 6, 10]} />
                <meshStandardMaterial color={LOGO_CYAN} roughness={.45} />
              </mesh>
              <mesh position-y={-.155} castShadow>
                <boxGeometry args={[.09, .05, .18]} />
                <meshStandardMaterial color={LOGO_NAVY} roughness={.5} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

function TrackScene({ runtime }: { runtime: React.MutableRefObject<SceneRuntime> }) {
  const { camera, invalidate } = useThree();
  const runnerRef = useRef<THREE.Group>(null);
  const initializedMode = useRef<SceneMode>('hidden');
  const lookAt = useRef(new THREE.Vector3());
  const cameraGoal = useRef(new THREE.Vector3());
  const heading = useRef(Math.atan2(ovalTangent(0).x, ovalTangent(0).z));

  useEffect(() => {
    const currentRuntime = runtime.current;
    currentRuntime.invalidate = invalidate;
    invalidate();
    return () => {
      currentRuntime.invalidate = null;
    };
  }, [invalidate, runtime]);

  useFrame((_, delta) => {
    const state = runtime.current;
    if (state.mode === 'hidden') return;

    if (state.mode === 'static') {
      if (initializedMode.current !== state.mode) {
        camera.position.copy(STATIC_POSITION);
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        camera.updateProjectionMatrix();
        initializedMode.current = state.mode;
      }
      return;
    }

    initializedMode.current = 'lap';
    const capped = Math.min(delta, .05);
    state.progress = smoothProgress(state.progress, state.targetProgress, capped, 9);
    const point = ovalPoint(state.progress);
    const tangent = ovalTangent(state.progress);
    const runner = runnerRef.current;
    if (runner) {
      runner.position.set(point.x, START_Y, point.z);
      const targetHeading = Math.atan2(tangent.x, tangent.z);
      const currentHeading = heading.current;
      let turn = targetHeading - currentHeading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      heading.current = currentHeading + turn * (1 - Math.exp(-12 * capped));
      runner.rotation.y = heading.current;
    }

    const desiredX = point.x - tangent.x * 4.6;
    const desiredZ = point.z - tangent.z * 4.6;
    cameraGoal.current.set(desiredX, 3.2, desiredZ);
    camera.position.lerp(cameraGoal.current, 1 - Math.exp(-5 * capped));
    lookAt.current.set(point.x + tangent.x * 1.4, .28, point.z + tangent.z * 1.4);
    camera.lookAt(lookAt.current);

    if (Math.abs(state.targetProgress - state.progress) > .0002) invalidate();
  });

  const start = ovalPoint(0);
  return (
    <>
      <ambientLight intensity={.7} />
      <hemisphereLight args={['#d8f8ff', '#12243a', 1.05]} />
      <directionalLight
        castShadow
        color="#fff2db"
        intensity={2.1}
        position={[7, 11, 5]}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-.0004}
      />
      <group>
        <TrackModel />
        <group ref={runnerRef} position={[start.x, START_Y, start.z]}>
          <Runner />
        </group>
      </group>
    </>
  );
}

export function TrackExperience() {
  const layerRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<SceneRuntime>({ mode: 'hidden', targetProgress: 0, progress: 0, invalidate: null });

  useEffect(() => {
    const layer = layerRef.current;
    const features = document.querySelector<HTMLElement>('#features');
    const footer = document.querySelector<HTMLElement>('footer');
    if (!layer || !features || !footer) return;
    const currentRuntime = runtime.current;

    const compactQuery = window.matchMedia('(max-width: 900px)');
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let featureTop = 0;
    let lapEnd = 0;

    const measure = () => {
      const pageY = window.scrollY;
      featureTop = features.getBoundingClientRect().top + pageY;
      lapEnd = Math.max(featureTop + 1, document.documentElement.scrollHeight - window.innerHeight);
    };

    const setMode = (mode: SceneMode) => {
      if (runtime.current.mode === mode) return;
      runtime.current.mode = mode;
      layer.dataset.mode = mode;
      runtime.current.invalidate?.();
    };

    const updateFromScroll = () => {
      const y = window.scrollY;
      if (compactQuery.matches || reducedQuery.matches) {
        setMode(y >= featureTop && y < lapEnd ? 'static' : 'hidden');
        return;
      }
      if (y >= featureTop) {
        runtime.current.targetProgress = lapProgress(y, featureTop, lapEnd);
        setMode('lap');
        runtime.current.invalidate?.();
      } else {
        setMode('hidden');
      }
    };

    const onResize = () => {
      measure();
      updateFromScroll();
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);

    measure();
    updateFromScroll();
    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    compactQuery.addEventListener('change', onResize);
    reducedQuery.addEventListener('change', onResize);
    resizeObserver?.observe(features);
    resizeObserver?.observe(footer);

    return () => {
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', onResize);
      compactQuery.removeEventListener('change', onResize);
      reducedQuery.removeEventListener('change', onResize);
      resizeObserver?.disconnect();
      currentRuntime.mode = 'hidden';
    };
  }, []);

  return (
    <div ref={layerRef} className={styles.layer} data-mode="hidden" aria-hidden="true">
      <Canvas
        aria-hidden="true"
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows
        camera={{ fov: 38, near: .1, far: 80, position: STATIC_POSITION.toArray() }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = .92;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <TrackScene runtime={runtime} />
      </Canvas>
    </div>
  );
}
