import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box3,
  DoubleSide,
  FileLoader,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { anatomyRegionNames, attachAnatomyAttributes, parseAnatomyMap, updateInjuryAttributes } from './anatomySurfaceMap';
import type { Injury, InjuryDraft } from './injuryRegions';
import styles from './FitnessView.module.css';

interface BodyViewerProps {
  injuries: Injury[];
  preview: InjuryDraft | null;
}

interface ModelFrame {
  height: number;
  width: number;
  centerY: number;
}

function createBodyMaterial() {
  const material = new MeshPhysicalMaterial({
    color: '#75fff8',
    emissive: '#087b95',
    emissiveIntensity: .54,
    metalness: .04,
    roughness: .32,
    transmission: .42,
    thickness: .22,
    clearcoat: .58,
    clearcoatRoughness: .18,
    transparent: true,
    opacity: .64,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 injuryColor;\nattribute float injuryStrength;\nvarying vec3 vInjuryColor;\nvarying float vInjuryStrength;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInjuryColor = injuryColor;\nvInjuryStrength = injuryStrength;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vInjuryColor;
varying float vInjuryStrength;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float injuryMix = clamp(vInjuryStrength, 0.0, 1.0);
injuryMix = smoothstep(0.18, 0.82, injuryMix);
diffuseColor.rgb = mix(diffuseColor.rgb, vInjuryColor, injuryMix);
diffuseColor.a = mix(diffuseColor.a, 0.98, injuryMix);
totalEmissiveRadiance += vInjuryColor * injuryMix * 0.9;`);
  };
  material.customProgramCacheKey = () => 'athlora-anatomy-injury-map-v2';
  return material;
}

function HumanModel({ injuries, preview, debugRegion, onFrame, onMapReady }: BodyViewerProps & { debugRegion: string; onFrame: (frame: ModelFrame) => void; onMapReady: (regions: string[]) => void }) {
  const { scene } = useGLTF('/models/athlora-anatomy.glb');
  const mapSource = useLoader(FileLoader, '/models/athlora-anatomy-map-v2.json') as string;
  const map = useMemo(() => parseAnatomyMap(mapSource), [mapSource]);
  const { model, frame } = useMemo(() => {
    const next = scene.clone(true);
    let mappedMeshFound = false;
    next.traverse((object) => {
      if (!(object instanceof Mesh) || object.name !== map.source.meshName) return;
      object.geometry = object.geometry.clone();
      attachAnatomyAttributes(object.geometry, map);
      mappedMeshFound = true;
    });
    if (!mappedMeshFound) throw new Error(`Anatomy mesh "${map.source.meshName}" was not found.`);
    const sourceBounds = new Box3().setFromObject(next);
    const sourceSize = sourceBounds.getSize(new Vector3());
    const sourceCenter = sourceBounds.getCenter(new Vector3());
    const scale = 3.05 / sourceSize.y;
    next.position.set(-sourceCenter.x * scale, -sourceBounds.min.y * scale, -sourceCenter.z * scale);
    next.scale.setScalar(scale);
    return {
      model: next,
      frame: { height: sourceSize.y * scale, width: sourceSize.x * scale, centerY: sourceSize.y * scale * .52 },
    };
  }, [map, scene]);
  const material = useMemo(() => createBodyMaterial(), []);

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    onFrame(frame);
    return () => material.dispose();
  }, [frame, material, model, onFrame]);

  useEffect(() => {
    model.traverse((object) => {
      if (object instanceof Mesh && object.name === map.source.meshName) updateInjuryAttributes(object.geometry, map, injuries, preview, debugRegion);
    });
  }, [debugRegion, injuries, map, model, preview]);

  useEffect(() => onMapReady(anatomyRegionNames(map)), [map, onMapReady]);

  return <primitive object={model} />;
}

function CameraControls({ frame, resetVersion }: { frame: ModelFrame | null; resetVersion: number }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const targetCamera = useRef(new Vector3(0, 1.6, 6));
  const targetLookAt = useRef(new Vector3(0, 1.6, 0));
  const shouldReset = useRef(false);
  const { camera, size } = useThree();

  useEffect(() => {
    if (!frame || !controlsRef.current) return;
    if (!(camera instanceof PerspectiveCamera)) return;
    const verticalFov = camera.fov * Math.PI / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / Math.max(size.height, 1)));
    const verticalDistance = frame.height / (2 * Math.tan(verticalFov / 2) * .82);
    const horizontalDistance = frame.width / (2 * Math.tan(horizontalFov / 2) * .82);
    const distance = Math.max(verticalDistance, horizontalDistance, 4.5);
    targetCamera.current.set(0, frame.centerY, distance);
    targetLookAt.current.set(0, frame.centerY, 0);
    camera.position.copy(targetCamera.current);
    controlsRef.current.target.copy(targetLookAt.current);
    controlsRef.current.update();
  }, [camera, frame, size.height, size.width]);

  useEffect(() => { if (resetVersion > 0) shouldReset.current = true; }, [resetVersion]);
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !shouldReset.current) return;
    camera.position.lerp(targetCamera.current, .12);
    controls.target.lerp(targetLookAt.current, .12);
    controls.update();
    if (camera.position.distanceTo(targetCamera.current) < .015 && controls.target.distanceTo(targetLookAt.current) < .015) {
      shouldReset.current = false;
    }
  });

  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={.075} rotateSpeed={.38} zoomSpeed={.62} enablePan={false} minDistance={3.4} maxDistance={8.5} minPolarAngle={.72} maxPolarAngle={2.35} />;
}

function Scene({ injuries, preview, debugRegion, resetVersion, onMapReady }: BodyViewerProps & { debugRegion: string; resetVersion: number; onMapReady: (regions: string[]) => void }) {
  const [frame, setFrame] = useState<ModelFrame | null>(null);
  return <>
    <color attach="background" args={['#01090f']} />
    <fog attach="fog" args={['#01090f', 5, 11]} />
    <hemisphereLight args={['#c9ffff', '#010509', 1.2]} />
    <directionalLight position={[3.5, 5.5, 4]} intensity={2} color="#e4ffff" />
    <directionalLight position={[-3, 2.6, -3.8]} intensity={1.25} color="#47e7e1" />
    <pointLight position={[0, 1.8, 3.5]} intensity={.7} color="#b6ffff" distance={6} />
    <HumanModel injuries={injuries} preview={preview} debugRegion={debugRegion} onFrame={setFrame} onMapReady={onMapReady} />
    <ContactShadows position={[0, 0, 0]} opacity={.32} scale={5} blur={2.5} far={3.5} color="#002534" />
    <CameraControls frame={frame} resetVersion={resetVersion} />
  </>;
}

interface ViewerErrorBoundaryProps { children: ReactNode }
interface ViewerErrorBoundaryState { failed: boolean }

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ViewerErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Unable to load the Fitness body model.', error);
  }

  render() {
    if (this.state.failed) return <div className={styles.viewerError} role="alert">The anatomical body model could not load. Please try again later.</div>;
    return this.props.children;
  }
}

export function BodyViewer({ injuries, preview }: BodyViewerProps) {
  const [resetVersion, setResetVersion] = useState(0);
  const [debugRegion, setDebugRegion] = useState('');
  const [debugRegions, setDebugRegions] = useState<string[]>([]);
  return (
    <section className={styles.viewerCard} aria-labelledby="body-viewer-heading">
      <header className={styles.viewerHeader}>
        <div><strong id="body-viewer-heading">3D body map</strong><span>Translucent anatomical heat map</span></div>
        <button type="button" className={styles.resetButton} onClick={() => setResetVersion((value) => value + 1)}>Reset view</button>
      </header>
      <div className={styles.canvasWrap} role="img" aria-label="A rotatable translucent cyan athlete body showing anatomical injury heat regions">
        <ViewerErrorBoundary>
          <Canvas className={styles.canvas} dpr={[1, 1.5]} camera={{ position: [0, 1.6, 6], fov: 31 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
            <Suspense fallback={<Html center><span className={styles.canvasLoader}>Loading anatomical model...</span></Html>}><Scene injuries={injuries} preview={preview} debugRegion={debugRegion} resetVersion={resetVersion} onMapReady={setDebugRegions} /></Suspense>
          </Canvas>
        </ViewerErrorBoundary>
      </div>
      <footer className={styles.viewerFooter}><span>Drag to rotate</span><span>Wheel or trackpad to zoom</span><span>Surface heat map follows the body</span></footer>
       {import.meta.env.DEV && <details className={styles.anatomyDebug}>
         <summary>Developer: verify anatomical regions</summary>
         <p>{debugRegions.length ? 'Select a mapped region to inspect its persisted surface mask.' : 'Loading the verified vertex map...'}</p>
         <label>Debug anatomical region
           <select value={debugRegion} onChange={(event) => setDebugRegion(event.target.value)} disabled={!debugRegions.length}>
             <option value="">None</option>
             {debugRegions.map((region) => <option key={region} value={region}>{region}</option>)}
           </select>
         </label>
       </details>}
    </section>
  );
}

useGLTF.preload('/models/athlora-anatomy.glb');
