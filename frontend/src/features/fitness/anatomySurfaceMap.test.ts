import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import {
  ANATOMY_VERTEX_COUNT,
  anatomyRegionNames,
  attachAnatomyAttributes,
  parseAnatomyMap,
  resolveInjuryRegionIds,
  updateInjuryAttributes,
  type AnatomyMap,
} from './anatomySurfaceMap';

function makeValidMap(overrides: Partial<AnatomyMap> = {}): AnatomyMap {
  return {
    format: 'athlora-anatomy-map',
    version: 2,
    source: { sha256: 'test', meshName: 'model', vertexCount: ANATOMY_VERTEX_COUNT, faceCount: 120000 },
    regionNameToId: {
      ABDOMEN: 4,
      LEFT_SHOULDER: 8,
      LEFT_FOREARM: 11,
      LEFT_HAND: 13,
      RIGHT_SHOULDER: 14,
      RIGHT_FOREARM: 17,
      RIGHT_HAND: 19,
      LEFT_KNEE: 22,
      RIGHT_KNEE: 28,
    },
    uiMappings: {
      Torso: { 'Abdomen / core': { center: ['ABDOMEN'] } },
      Arm: {
        Shoulder: { left: ['LEFT_SHOULDER'], right: ['RIGHT_SHOULDER'], both: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'] },
        Forearm: { left: ['LEFT_FOREARM'], right: ['RIGHT_FOREARM'], both: ['LEFT_FOREARM', 'RIGHT_FOREARM'] },
        Hand: { left: ['LEFT_HAND'], right: ['RIGHT_HAND'], both: ['LEFT_HAND', 'RIGHT_HAND'] },
      },
      Leg: { Knee: { left: ['LEFT_KNEE'], right: ['RIGHT_KNEE'], both: ['LEFT_KNEE', 'RIGHT_KNEE'] } },
    },
    vertexRegionIds: new Array(ANATOMY_VERTEX_COUNT).fill(0),
    vertexCoreWeights: new Array(ANATOMY_VERTEX_COUNT).fill(128),
    ...overrides,
  };
}

describe('resolveInjuryRegionIds', () => {
  const map = makeValidMap();

  it('uses supplied UI mappings for the anatomical acceptance selections', () => {
    expect(resolveInjuryRegionIds(map, { region: 'Torso', area: 'Abdomen / core', side: 'Center', severity: 'Severe' })).toEqual([4]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Forearm', side: 'Both', severity: 'Severe' })).toEqual([11, 17]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Hand', side: 'Both', severity: 'Severe' })).toEqual([13, 19]);
    expect(resolveInjuryRegionIds(map, { region: 'Leg', area: 'Knee', side: 'Both', severity: 'Severe' })).toEqual([22, 28]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Shoulder', side: 'Left', severity: 'Moderate' })).toEqual([8]);
  });

  it('returns empty array for unmapped regions or areas', () => {
    expect(resolveInjuryRegionIds(map, { region: 'Unknown', area: 'X', side: 'Left', severity: 'Minor' })).toEqual([]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Unknown Area', side: 'Left', severity: 'Minor' })).toEqual([]);
  });
});

describe('parseAnatomyMap', () => {
  it('parses a valid anatomy map', () => {
    const validMap = makeValidMap();
    expect(parseAnatomyMap(JSON.stringify(validMap))).toEqual(validMap);
  });

  it('throws on invalid format', () => {
    const invalid = { ...makeValidMap(), format: 'wrong' };
    expect(() => parseAnatomyMap(JSON.stringify(invalid))).toThrow('Invalid Athlora anatomy map asset.');
  });

  it('throws on invalid version', () => {
    const invalid = { ...makeValidMap(), version: 1 };
    expect(() => parseAnatomyMap(JSON.stringify(invalid))).toThrow('Invalid Athlora anatomy map asset.');
  });

  it('throws on mismatched vertex count', () => {
    const invalid = { ...makeValidMap(), source: { sha256: 'test', meshName: 'model', vertexCount: 100, faceCount: 10 } };
    expect(() => parseAnatomyMap(JSON.stringify(invalid))).toThrow('Invalid Athlora anatomy map asset.');
  });

  it('throws on mismatched vertexRegionIds length', () => {
    const invalid = { ...makeValidMap(), vertexRegionIds: [1, 2, 3] };
    expect(() => parseAnatomyMap(JSON.stringify(invalid))).toThrow('Invalid Athlora anatomy map asset.');
  });

  it('throws on mismatched vertexCoreWeights length', () => {
    const invalid = { ...makeValidMap(), vertexCoreWeights: [1, 2] };
    expect(() => parseAnatomyMap(JSON.stringify(invalid))).toThrow('Invalid Athlora anatomy map asset.');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseAnatomyMap('not-json')).toThrow();
  });
});

describe('anatomyRegionNames', () => {
  it('returns the keys from regionNameToId', () => {
    expect(anatomyRegionNames(makeValidMap())).toEqual(
      expect.arrayContaining(['ABDOMEN', 'LEFT_SHOULDER', 'RIGHT_KNEE']),
    );
  });
});

describe('attachAnatomyAttributes', () => {
  function createGeometry(vertexCount: number): BufferGeometry {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(vertexCount * 3);
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    return geometry;
  }

  it('attaches all four attributes to a valid geometry', () => {
    const geometry = createGeometry(ANATOMY_VERTEX_COUNT);
    attachAnatomyAttributes(geometry, makeValidMap());

    expect(geometry.getAttribute('anatomyRegion')).toBeDefined();
    expect(geometry.getAttribute('anatomyCoreWeight')).toBeDefined();
    expect(geometry.getAttribute('injuryColor')).toBeDefined();
    expect(geometry.getAttribute('injuryStrength')).toBeDefined();
    expect(geometry.getAttribute('anatomyRegion')!.count).toBe(ANATOMY_VERTEX_COUNT);
  });

  it('throws when position attribute is missing', () => {
    const geometry = new BufferGeometry();
    expect(() => attachAnatomyAttributes(geometry, makeValidMap())).toThrow('Anatomy map mismatch');
  });

  it('throws when vertex count does not match', () => {
    const geometry = createGeometry(100);
    expect(() => attachAnatomyAttributes(geometry, makeValidMap())).toThrow('Anatomy map mismatch');
  });
});

describe('updateInjuryAttributes', () => {
  function createPreparedGeometry(regionIds: number[], coreWeights: number[]) {
    const validMap = makeValidMap({ vertexRegionIds: regionIds, vertexCoreWeights: coreWeights });
    const geometry = new BufferGeometry();
    const positions = new Float32Array(ANATOMY_VERTEX_COUNT * 3);
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    attachAnatomyAttributes(geometry, validMap);
    return { geometry, validMap };
  }

  it('colors vertices for mapped injuries without throwing', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    regionIds[0] = 4;
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(255);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [
      { region: 'Torso', area: 'Abdomen / core', side: 'Center', severity: 'Severe' },
    ], null, '');

    const colorAttr = geometry.getAttribute('injuryColor') as BufferAttribute;
    const strengthAttr = geometry.getAttribute('injuryStrength') as BufferAttribute;
    expect(colorAttr).toBeDefined();
    expect(strengthAttr).toBeDefined();
    const colors = colorAttr.array as Float32Array;
    expect(colors[0]).toBeGreaterThan(0);
  });

  it('applies preview injuries with reduced scale', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    regionIds[0] = 4;
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(255);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [], {
      region: 'Torso', area: 'Abdomen / core', side: 'Center', severity: 'Minor',
    }, '');

    const strengthAttr = geometry.getAttribute('injuryStrength') as BufferAttribute;
    expect((strengthAttr.array as Float32Array)[0]).toBeGreaterThan(0);
  });

  it('applies debug region highlighting', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    regionIds[0] = 4;
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(255);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [], null, 'ABDOMEN');

    const colorAttr = geometry.getAttribute('injuryColor') as BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    expect(colors[0]).toBeGreaterThan(0);
  });

  it('clears attributes when no injuries or debug region', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    regionIds[0] = 4;
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(255);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [], null, '');

    const strengthAttr = geometry.getAttribute('injuryStrength') as BufferAttribute;
    expect((strengthAttr.array as Float32Array).every((v) => v === 0)).toBe(true);
  });

  it('keeps highest severity when multiple injuries map to same region', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    regionIds[0] = 8;
    regionIds[1] = 8;
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(255);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [
      { region: 'Arm', area: 'Shoulder', side: 'Left', severity: 'Minor' },
      { region: 'Arm', area: 'Shoulder', side: 'Left', severity: 'Severe' },
    ], null, '');

    const strengthAttr = geometry.getAttribute('injuryStrength') as BufferAttribute;
    expect((strengthAttr.array as Float32Array)[0]).toBeGreaterThan(0);
  });

  it('handles empty injury list and unknown debug region', () => {
    const regionIds = new Array(ANATOMY_VERTEX_COUNT).fill(0);
    const coreWeights = new Array(ANATOMY_VERTEX_COUNT).fill(128);
    const { geometry, validMap } = createPreparedGeometry(regionIds, coreWeights);

    updateInjuryAttributes(geometry, validMap, [], null, 'NONEXISTENT_REGION');

    const strengthAttr = geometry.getAttribute('injuryStrength') as BufferAttribute;
    expect((strengthAttr.array as Float32Array).every((v) => v === 0)).toBe(true);
  });
});
