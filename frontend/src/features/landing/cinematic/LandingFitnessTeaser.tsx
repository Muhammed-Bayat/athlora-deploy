import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  Box3,
  DoubleSide,
  FileLoader,
  Light,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { attachAnatomyAttributes, parseAnatomyMap, updateInjuryAttributes } from '../../fitness/anatomySurfaceMap';
import { anatomyMapUrl, anatomyModelUrl } from '../../fitness/anatomyAssets';
import type { Injury } from '../../fitness/injuryRegions';

interface LandingFitnessTeaserProps {
  progressRef: MutableRefObject<number>;
}

const teaserInjury: Injury[] = [{
  id: 'landing-left-knee',
  workspaceId: 'ws',
  athleteId: 'ath',
  bodyRegion: 'Leg',
  region: 'Leg',
  area: 'Knee',
  side: 'Left',
  severity: 'Moderate',
  notes: '',
  occurrenceDate: '2026-01-01',
  expectedReturnDate: null,
  resolvedDate: null,
  resolutionNotes: null,
  createdBy: 'u',
  updatedBy: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deletedBy: null,
}];

function smoothstep(start: number, end: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - start) / Math.max(end - start, .0001)));
  return t * t * (3 - 2 * t);
}

function createFitnessMaterial() {
  const material = new MeshStandardMaterial({
    color: '#75fff8',
    emissive: '#087b95',
    emissiveIntensity: .54,
    metalness: .04,
    roughness: .32,
    transparent: true,
    opacity: 0,
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
float injuryMix = smoothstep(0.18, 0.82, clamp(vInjuryStrength, 0.0, 1.0));
float baseAlpha = diffuseColor.a;
diffuseColor.rgb = mix(diffuseColor.rgb, vInjuryColor, injuryMix);
diffuseColor.a = mix(baseAlpha, min(0.98, baseAlpha + 0.34), injuryMix);
totalEmissiveRadiance += vInjuryColor * injuryMix * (baseAlpha / 0.64) * 0.9;`);
  };
  material.customProgramCacheKey = () => 'athlora-landing-injury-standard-v1';
  return material;
}

export function LandingFitnessTeaser({ progressRef }: LandingFitnessTeaserProps) {
  const { gl, camera, scene: stageScene } = useThree();
  const preparation = useRef({ started: false, ready: false, cancelled: false });
  const groupRef = useRef<import('three').Group>(null);
  const { scene } = useGLTF(anatomyModelUrl);
  const mapSource = useLoader(FileLoader, anatomyMapUrl) as string;
  const map = useMemo(() => parseAnatomyMap(mapSource), [mapSource]);
  const model = useMemo(() => {
    const next = scene.clone(true);
    let mappedMeshFound = false;
    next.traverse((object) => {
      if (!(object instanceof Mesh) || object.name !== map.source.meshName) return;
      object.geometry = object.geometry.clone();
      attachAnatomyAttributes(object.geometry, map);
      updateInjuryAttributes(object.geometry, map, teaserInjury, null, '');
      mappedMeshFound = true;
    });
    if (!mappedMeshFound) throw new Error(`Anatomy mesh "${map.source.meshName}" was not found.`);
    const bounds = new Box3().setFromObject(next);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 4.65 / size.y;
    next.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    next.scale.setScalar(scale);
    return next;
  }, [map, scene]);
  const material = useMemo(() => createFitnessMaterial(), []);

  useEffect(() => {
    const state = { started: false, ready: false, cancelled: false };
    preparation.current = state;
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = material;
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    return () => {
      state.cancelled = true;
      model.traverse((object) => {
        if (object instanceof Mesh && object.name === map.source.meshName) object.geometry.dispose();
      });
      material.dispose();
    };
  }, [map.source.meshName, material, model]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const progress = progressRef.current;
    const state = preparation.current;
    // Prepare after the tunnel lights have gone, using the same lighting as the injury chapter.
    if (progress > 0 && !state.started) {
      state.started = true;
      void gl.compileAsync(model, camera, stageScene).then(() => {
        if (state.cancelled) return;
        // Upload the shared vertex buffers now, rather than on the first visible injury frame.
        const warmScene = new Scene();
        warmScene.fog = stageScene.fog;
        warmScene.add(model.clone(true));
        stageScene.traverseVisible((object) => {
          if (object instanceof Light) {
            const light = object.clone();
            object.getWorldPosition(light.position);
            warmScene.add(light);
          }
        });
        const warmCamera = new PerspectiveCamera(39, 1, .1, 65);
        warmCamera.position.set(0, 2.3, 10);
        warmCamera.lookAt(0, 2.3, 0);
        const target = new WebGLRenderTarget(16, 16);
        const previousTarget = gl.getRenderTarget();
        const previousFace = gl.getActiveCubeFace();
        const previousLevel = gl.getActiveMipmapLevel();
        try {
          gl.setRenderTarget(target);
          gl.render(warmScene, warmCamera);
        } finally {
          gl.setRenderTarget(previousTarget, previousFace, previousLevel);
          target.dispose();
        }
        state.ready = true;
      }).catch(() => {
        // Fall back to normal compilation on devices without async shader support.
        if (!state.cancelled) state.ready = true;
      });
    }
    const presence = smoothstep(.72, .78, progress) * (1 - smoothstep(.84, .9, progress));
    group.visible = state.ready && presence > .001;
    material.opacity = presence * .64;
    group.scale.setScalar(.94 + presence * .06);
    group.rotation.y = -.16 + smoothstep(.72, .84, progress) * .35;
    group.position.y = -.18;
  });

  return <group ref={groupRef} visible={false}><primitive object={model} /></group>;
}
