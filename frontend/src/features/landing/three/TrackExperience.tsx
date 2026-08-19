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

const STATIC_POSITION = new THREE.Vector3(10, 10, 13);
const HALF_STRAIGHT = 4.5;

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
    const shape = stadiumShape(4.72);
    shape.holes.push(stadiumShape(3.18));
    return shape;
  }, []);
  const infieldShape = useMemo(() => stadiumShape(3.12), []);
  const laneCurves = useMemo(() => [3.18, 3.4, 3.62, 3.84, 4.06, 4.28, 4.5, 4.72].map((radius) => {
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
              color={edge ? '#eafdff' : '#9fe8f0'}
              roughness={.4}
              emissive={edge ? '#3ea9bf' : '#1a7f9a'}
              emissiveIntensity={.42}
            />
          </mesh>
        );
      })}
      <mesh position={[-HALF_STRAIGHT + .28, .13, -3.95]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.055, 1.48]} />
        <meshStandardMaterial color="#efffff" roughness={.45} emissive="#69d9e7" emissiveIntensity={.1} />
      </mesh>
    </group>
  );
}

const START_Y = 0.08;

const SKIN = '#eabfa0';
const SKIN_DARK = '#c9986f';
const SINGLET = '#42d3df';
const SHORTS = '#0f6b85';
const INK = '#182e48';

/** A stylized articulated humanoid sprinter built from primitives. Faces +Z (forward). */
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
      torso.current.position.y = .56 + Math.abs(Math.cos(t)) * .04;
    }
  });

  return (
    <group>
      {/* Torso / singlet */}
      <group ref={torso} position={[0, .56, 0]}>
        <mesh position-y={.12} castShadow>
          <capsuleGeometry args={[.085, .26, 6, 12]} />
          <meshStandardMaterial color={SINGLET} roughness={.5} metalness={.05} />
        </mesh>
        {/* Head */}
        <mesh position-y={.32} castShadow>
          <sphereGeometry args={[.1, 16, 12]} />
          <meshStandardMaterial color={INK} roughness={.7} />
        </mesh>
      </group>

      {/* Shorts */}
      <mesh position={[0, .37, 0]} castShadow>
        <boxGeometry args={[.2, .08, .13]} />
        <meshStandardMaterial color={SHORTS} roughness={.6} />
      </mesh>

      {/* Arms */}
      {[{ ref: armL, side: -1 }, { ref: armR, side: 1 }].map(({ ref, side }) => (
        <group key={side} ref={ref} position={[side * .14, .72, 0]}>
          <mesh position-y={-.1} castShadow>
            <capsuleGeometry args={[.042, .15, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={.55} />
          </mesh>
          <group ref={side === -1 ? foreL : foreR} position={[0, -.2, 0]}>
            <mesh position-y={-.08} castShadow>
              <capsuleGeometry args={[.036, .13, 4, 8]} />
              <meshStandardMaterial color={SKIN_DARK} roughness={.55} />
            </mesh>
            <mesh position-y={-.165} castShadow>
              <sphereGeometry args={[.045, 8, 6]} />
              <meshStandardMaterial color={SKIN} roughness={.6} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Legs */}
      {[{ ref: legL, shin: shinL, side: -1 }, { ref: legR, shin: shinR, side: 1 }].map(({ ref, shin, side }) => (
        <group key={side} ref={ref} position={[side * .075, .4, 0]}>
          <mesh position-y={-.09} castShadow>
            <capsuleGeometry args={[.05, .14, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={.55} />
          </mesh>
          <group ref={shin} position={[0, -.18, 0]}>
            <mesh position-y={-.07} castShadow>
              <capsuleGeometry args={[.042, .13, 4, 8]} />
              <meshStandardMaterial color={SKIN_DARK} roughness={.55} />
            </mesh>
            <mesh position-y={-.16} castShadow>
              <boxGeometry args={[.09, .05, .18]} />
              <meshStandardMaterial color={INK} roughness={.6} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function TrackScene({ runtime }: { runtime: React.MutableRefObject<SceneRuntime> }) {
  const { camera, invalidate } = useThree();
  const runnerRef = useRef<THREE.Group>(null);
  const initializedMode = useRef<SceneMode>('hidden');
  const lookAt = useRef(new THREE.Vector3());
  const cameraGoal = useRef(new THREE.Vector3());

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
    state.progress = smoothProgress(state.progress, state.targetProgress, Math.min(delta, .05));
    const point = ovalPoint(state.progress);
    const tangent = ovalTangent(state.progress);
    const runner = runnerRef.current;
    if (runner) {
      runner.position.set(point.x, START_Y, point.z);
      runner.rotation.y = Math.atan2(tangent.x, tangent.z);
    }

    const desiredX = point.x - tangent.x * 4.6;
    const desiredZ = point.z - tangent.z * 4.6;
    cameraGoal.current.set(desiredX, 3.2, desiredZ);
    camera.position.lerp(cameraGoal.current, 1 - Math.exp(-5 * delta));
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
      const footerTop = footer.getBoundingClientRect().top + pageY;
      lapEnd = Math.max(featureTop + 1, footerTop);
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
      if (y >= featureTop && y < lapEnd) {
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
