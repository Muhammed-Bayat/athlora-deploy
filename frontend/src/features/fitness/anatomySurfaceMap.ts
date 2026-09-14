import { BufferAttribute, Color, type BufferGeometry } from 'three';
import type { Injury, InjuryDraft, InjurySeverity, InjurySide } from './injuryRegions';

export const ANATOMY_VERTEX_COUNT = 79534;

type AnatomyMapSide = 'left' | 'right' | 'both' | 'center';
export type VisualInjury = Pick<Injury | InjuryDraft, 'region' | 'area' | 'side' | 'severity'>;

export interface AnatomyMap {
  format: string;
  version: number;
  source: {
    sha256: string;
    meshName: string;
    vertexCount: number;
    faceCount: number;
  };
  regionNameToId: Record<string, number>;
  uiMappings: Record<string, Record<string, Partial<Record<AnatomyMapSide, string[]>>>>;
  vertexRegionIds: number[];
  vertexCoreWeights: number[];
}

interface InjuryStyle {
  color: Color;
  strength: number;
}

const SEVERITY_STYLES: Record<InjurySeverity, InjuryStyle> = {
  Minor: { color: new Color('#d17b00'), strength: .72 },
  Moderate: { color: new Color('#e23b00'), strength: .84 },
  Severe: { color: new Color('#dc002f'), strength: .98 },
};

const DEBUG_STYLE: InjuryStyle = { color: new Color('#ff2fbf'), strength: 1 };

export function parseAnatomyMap(serialized: string): AnatomyMap {
  const map = JSON.parse(serialized) as AnatomyMap;
  if (
    map.format !== 'athlora-anatomy-map'
    || map.version !== 2
    || map.source?.vertexCount !== ANATOMY_VERTEX_COUNT
    || map.vertexRegionIds?.length !== ANATOMY_VERTEX_COUNT
    || map.vertexCoreWeights?.length !== ANATOMY_VERTEX_COUNT
  ) {
    throw new Error('Invalid Athlora anatomy map asset.');
  }
  return map;
}

export function anatomyRegionNames(map: AnatomyMap) {
  return Object.keys(map.regionNameToId);
}

export function attachAnatomyAttributes(geometry: BufferGeometry, map: AnatomyMap) {
  const position = geometry.getAttribute('position');
  if (!position || position.count !== ANATOMY_VERTEX_COUNT || position.count !== map.source.vertexCount) {
    throw new Error(`Anatomy map mismatch: expected ${ANATOMY_VERTEX_COUNT} vertices, got ${position?.count ?? 0}.`);
  }

  const coreWeights = new Float32Array(ANATOMY_VERTEX_COUNT);
  for (let index = 0; index < coreWeights.length; index += 1) coreWeights[index] = map.vertexCoreWeights[index] / 255;

  geometry.setAttribute('anatomyRegion', new BufferAttribute(Float32Array.from(map.vertexRegionIds), 1));
  geometry.setAttribute('anatomyCoreWeight', new BufferAttribute(coreWeights, 1));
  geometry.setAttribute('injuryColor', new BufferAttribute(new Float32Array(ANATOMY_VERTEX_COUNT * 3), 3));
  geometry.setAttribute('injuryStrength', new BufferAttribute(new Float32Array(ANATOMY_VERTEX_COUNT), 1));
}

function mapSide(side: InjurySide): AnatomyMapSide {
  if (side === 'Center') return 'center';
  return side.toLowerCase() as Exclude<AnatomyMapSide, 'center'>;
}

export function resolveInjuryRegionIds(map: AnatomyMap, injury: VisualInjury) {
  const regionNames = map.uiMappings[injury.region]?.[injury.area]?.[mapSide(injury.side)] ?? [];
  return regionNames.map((regionName) => map.regionNameToId[regionName]).filter((regionId): regionId is number => regionId != null);
}

export function updateInjuryAttributes(
  geometry: BufferGeometry,
  map: AnatomyMap,
  injuries: VisualInjury[],
  preview: VisualInjury | null,
  debugRegion: string,
) {
  const colorAttribute = geometry.getAttribute('injuryColor') as BufferAttribute;
  const strengthAttribute = geometry.getAttribute('injuryStrength') as BufferAttribute;
  const colors = colorAttribute.array as Float32Array;
  const strengths = strengthAttribute.array as Float32Array;
  const stylesByRegion = new Map<number, InjuryStyle>();
  colors.fill(0);
  strengths.fill(0);

  if (debugRegion) {
    const regionId = map.regionNameToId[debugRegion];
    if (regionId != null) stylesByRegion.set(regionId, DEBUG_STYLE);
  } else {
    const entries: Array<[VisualInjury, number]> = injuries.map((injury) => [injury, 1]);
    if (preview) entries.push([preview, .76]);
    for (const [injury, scale] of entries) {
      const baseStyle = SEVERITY_STYLES[injury.severity];
      const style = { color: baseStyle.color, strength: baseStyle.strength * scale };
      for (const regionId of resolveInjuryRegionIds(map, injury)) {
        const existing = stylesByRegion.get(regionId);
        if (!existing || style.strength > existing.strength) stylesByRegion.set(regionId, style);
      }
    }
  }

  for (let index = 0; index < map.vertexRegionIds.length; index += 1) {
    const style = stylesByRegion.get(map.vertexRegionIds[index]);
    if (!style) continue;
    const strength = style.strength * (map.vertexCoreWeights[index] / 255);
    strengths[index] = strength;
    colors[index * 3] = style.color.r;
    colors[index * 3 + 1] = style.color.g;
    colors[index * 3 + 2] = style.color.b;
  }

  colorAttribute.needsUpdate = true;
  strengthAttribute.needsUpdate = true;
}
