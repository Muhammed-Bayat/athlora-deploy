import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3 } from 'three';
import styles from './PublicStatsPage.module.css';

function stadiumPoints(radius: number, straight: number, y = 0, samples = 180) {
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
    positions.push(point.x, 0.02, point.z, inside.x, 0.02, inside.z, point.x, -0.22, point.z, inside.x, -0.22, inside.z);
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

function StaticTrackWorld() {
  const surface = useMemo(createTrackGeometry, []);
  const lanes = useMemo(() => Array.from({ length: 8 }, (_, lane) => {
    const radius = 2.02 + lane * 0.29;
    return new BufferGeometry().setFromPoints(stadiumPoints(radius, 5.55, 0.045));
  }), []);

  useEffect(() => () => {
    surface.dispose();
    lanes.forEach((lane) => lane.dispose());
  }, [lanes, surface]);

  return (
    <group position={[-0.5, 0, 0]} rotation={[0.16, -0.36, 0]}>
      <mesh geometry={surface} receiveShadow>
        <meshStandardMaterial color="#062333" roughness={0.78} metalness={0.3} transparent opacity={0.96} side={DoubleSide} />
      </mesh>
      {lanes.map((geometry, lane) => (
        <lineLoop key={lane} geometry={geometry}>
          <lineBasicMaterial color={lane === 3 ? '#d7fdff' : '#3c90a5'} transparent opacity={lane === 3 ? 0.96 : 0.46} />
        </lineLoop>
      ))}
    </group>
  );
}

function canRenderTrack() {
  return typeof window !== 'undefined'
    && typeof window.WebGLRenderingContext === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function StaticTrack() {
  const [canRender, setCanRender] = useState(canRenderTrack);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setCanRender(canRenderTrack());
    reducedMotion.addEventListener('change', update);
    return () => reducedMotion.removeEventListener('change', update);
  }, []);

  return (
    <figure className={styles.trackFigure}>
      {canRender ? (
        <Canvas className={styles.trackCanvas} dpr={[1, 1.5]} camera={{ position: [0, 7.7, 13.4], fov: 39, near: 0.1, far: 50 }} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}>
          <ambientLight intensity={0.52} color="#9beff8" />
          <directionalLight position={[4, 8, 6]} intensity={1.75} color="#d8feff" />
          <pointLight position={[-5, 4, 1]} intensity={5} distance={16} color="#087f9c" />
          <StaticTrackWorld />
        </Canvas>
      ) : <div className={styles.trackFallback} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>}
      <figcaption>All-time 100m performance, arranged around the track.</figcaption>
    </figure>
  );
}
