import { DoubleSide, MeshPhysicalMaterial } from 'three';

export function createAnatomyMaterial() {
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
