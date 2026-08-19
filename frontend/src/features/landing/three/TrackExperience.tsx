import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import styles from './TrackExperience.module.css';
import { lapProgress, ovalPoint, ovalTangent, smoothProgress } from './trackMath';

type SceneMode = 'hidden' | 'hero' | 'lap' | 'static';

interface SceneRuntime {
  mode: SceneMode;
  targetProgress: number;
  progress: number;
  invalidate: (() => void) | null;
}

const HERO_POSITION = new THREE.Vector3(11, 8.2, 12.5);
const HERO_TARGET = new THREE.Vector3(0, 0, 0);
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
      {laneCurves.map((curve, index) => (
        <mesh key={index}>
          <tubeGeometry args={[curve, 192, index === 0 || index === laneCurves.length - 1 ? .022 : .014, 5, true]} />
          <meshStandardMaterial color={index === 0 || index === laneCurves.length - 1 ? '#dffcff' : '#78dce8'} roughness={.54} emissive="#0d5366" emissiveIntensity={.12} />
        </mesh>
      ))}
      <mesh position={[-HALF_STRAIGHT + .28, .13, -3.95]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[.055, 1.48]} />
        <meshStandardMaterial color="#efffff" roughness={.45} emissive="#69d9e7" emissiveIntensity={.1} />
      </mesh>
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

    if (state.mode === 'hero' || state.mode === 'static') {
      if (initializedMode.current !== state.mode) {
        camera.position.copy(state.mode === 'hero' ? HERO_POSITION : STATIC_POSITION);
        camera.lookAt(HERO_TARGET);
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
      runner.position.set(point.x, .08, point.z);
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
        <group ref={runnerRef} position={[start.x, .08, start.z]}>
          <mesh position-y={.42} castShadow>
            <capsuleGeometry args={[.13, .45, 4, 8]} />
            <meshStandardMaterial color="#42d3df" roughness={.5} />
          </mesh>
          <mesh position-y={.84} castShadow>
            <sphereGeometry args={[.14, 12, 8]} />
            <meshStandardMaterial color="#182e48" roughness={.72} />
          </mesh>
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
    const top = document.querySelector<HTMLElement>('#top');
    const features = document.querySelector<HTMLElement>('#features');
    const footer = document.querySelector<HTMLElement>('footer');
    if (!layer || !top || !features || !footer) return;
    const currentRuntime = runtime.current;

    const compactQuery = window.matchMedia('(max-width: 900px)');
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    let featureTop = 0;
    let lapEnd = 0;
    let heroTop = 0;
    let heroBottom = 0;
    let heroLeft = 0;
    let heroRight = 0;
    let pointerFrame = 0;
    let pointerX = window.innerWidth * .76;
    let pointerY = window.innerHeight * .42;
    let pointerInside = false;

    const measure = () => {
      const pageY = window.scrollY;
      featureTop = features.getBoundingClientRect().top + pageY;
      const footerTop = footer.getBoundingClientRect().top + pageY;
      lapEnd = Math.max(featureTop + 1, footerTop);
      const heroRect = top.getBoundingClientRect();
      heroTop = heroRect.top + pageY;
      heroBottom = heroRect.bottom + pageY;
      heroLeft = heroRect.left;
      heroRight = heroRect.right;
    };

    const setMode = (mode: SceneMode) => {
      if (runtime.current.mode === mode) return;
      runtime.current.mode = mode;
      layer.dataset.mode = mode;
      runtime.current.invalidate?.();
    };

    const updateFromScroll = () => {
      const y = window.scrollY;
      const pointerPageY = pointerY + y;
      pointerInside = pointerX >= heroLeft && pointerX <= heroRight && pointerPageY >= heroTop && pointerPageY <= heroBottom;

      if (compactQuery.matches || reducedQuery.matches) {
        setMode(y >= featureTop && y < lapEnd ? 'static' : 'hidden');
        return;
      }
      if (y >= featureTop && y < lapEnd) {
        runtime.current.targetProgress = lapProgress(y, featureTop, lapEnd);
        setMode('lap');
        runtime.current.invalidate?.();
      } else if (pointerInside && finePointerQuery.matches && y >= heroTop && y < heroBottom) {
        setMode('hero');
      } else {
        setMode('hidden');
      }
    };

    const updatePointer = () => {
      pointerFrame = 0;
      layer.style.setProperty('--track-pointer-x', `${pointerX}px`);
      layer.style.setProperty('--track-pointer-y', `${pointerY}px`);
      updateFromScroll();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!finePointerQuery.matches || compactQuery.matches || reducedQuery.matches) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      const pointerPageY = event.clientY + window.scrollY;
      pointerInside = event.clientX >= heroLeft && event.clientX <= heroRight && pointerPageY >= heroTop && pointerPageY <= heroBottom;
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(updatePointer);
    };

    const onHeroLeave = () => {
      pointerInside = false;
      setMode('hidden');
    };

    const onResize = () => {
      measure();
      updateFromScroll();
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);

    measure();
    updatePointer();
    updateFromScroll();
    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    top.addEventListener('pointerleave', onHeroLeave, { passive: true });
    compactQuery.addEventListener('change', onResize);
    reducedQuery.addEventListener('change', onResize);
    resizeObserver?.observe(top);
    resizeObserver?.observe(footer);

    return () => {
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      top.removeEventListener('pointerleave', onHeroLeave);
      compactQuery.removeEventListener('change', onResize);
      reducedQuery.removeEventListener('change', onResize);
      resizeObserver?.disconnect();
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
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
        camera={{ fov: 38, near: .1, far: 80, position: HERO_POSITION.toArray() }}
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
