import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import { Box3, FileLoader, Mesh, Vector3 } from 'three';
import type { Injury } from '../../types';
import { attachAnatomyAttributes, parseAnatomyMap, updateInjuryAttributes } from './anatomySurfaceMap';
import { createAnatomyMaterial } from './anatomyMaterial';

type StaticInjury = Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>;

function StaticHumanModel({ injuries }: { injuries: StaticInjury[] }) {
  const { scene } = useGLTF('/models/athlora-anatomy.glb');
  const mapSource = useLoader(FileLoader, '/models/athlora-anatomy-map-v2.json') as string;
  const map = useMemo(() => parseAnatomyMap(mapSource), [mapSource]);
  const model = useMemo(() => {
    const next = scene.clone(true);
    let mappedMeshFound = false;
    next.traverse((object) => {
      if (!(object instanceof Mesh) || object.name !== map.source.meshName) return;
      object.geometry = object.geometry.clone();
      attachAnatomyAttributes(object.geometry, map);
      mappedMeshFound = true;
    });
    if (!mappedMeshFound) throw new Error(`Anatomy mesh "${map.source.meshName}" was not found.`);

    const bounds = new Box3().setFromObject(next);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 3.05 / size.y;
    next.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    next.scale.setScalar(scale);
    return next;
  }, [map, scene]);
  const material = useMemo(() => createAnatomyMaterial(), []);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    model.traverse((object) => {
      if (object instanceof Mesh) object.material = material;
    });
    return () => material.dispose();
  }, [material, model]);

  useEffect(() => {
    const visualInjuries = injuries.map(({ bodyRegion, ...injury }) => ({ ...injury, region: bodyRegion }));
    model.traverse((object) => {
      if (object instanceof Mesh && object.name === map.source.meshName) {
        updateInjuryAttributes(object.geometry, map, visualInjuries, null, '');
      }
    });
    invalidate();
  }, [injuries, invalidate, map, model]);

  return <primitive object={model} />;
}

function StaticAnatomyScene({ injuries }: { injuries: StaticInjury[] }) {
  return <>
    <hemisphereLight args={['#c9ffff', '#010509', 1.2]} />
    <directionalLight position={[3.5, 5.5, 4]} intensity={2} color="#e4ffff" />
    <directionalLight position={[-3, 2.6, -3.8]} intensity={1.25} color="#47e7e1" />
    <pointLight position={[0, 1.8, 3.5]} intensity={.7} color="#b6ffff" distance={6} />
    <StaticHumanModel injuries={injuries} />
  </>;
}

export function StaticAnatomy({ injuries }: { injuries: StaticInjury[] }) {
  // Canvas requires ResizeObserver, which is unavailable in some non-browser renderers.
  if (typeof ResizeObserver === 'undefined') return null;

  return (
    <Canvas
      aria-hidden="true"
      camera={{ position: [0, 1.58, 6.2], fov: 31 }}
      dpr={[1, 1.25]}
      frameloop="demand"
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ camera }) => camera.lookAt(0, 1.58, 0)}
    >
      <Suspense fallback={null}><StaticAnatomyScene injuries={injuries} /></Suspense>
    </Canvas>
  );
}
