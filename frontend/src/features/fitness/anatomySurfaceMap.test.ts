import { describe, expect, it } from 'vitest';
import { resolveInjuryRegionIds, type AnatomyMap } from './anatomySurfaceMap';

const map = {
  format: 'athlora-anatomy-map',
  version: 2,
  source: { sha256: 'test', meshName: 'model', vertexCount: 79534, faceCount: 120000 },
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
  vertexRegionIds: [],
  vertexCoreWeights: [],
} satisfies AnatomyMap;

describe('resolveInjuryRegionIds', () => {
  it('uses supplied UI mappings for the anatomical acceptance selections', () => {
    expect(resolveInjuryRegionIds(map, { region: 'Torso', area: 'Abdomen / core', side: 'Center', severity: 'Severe' })).toEqual([4]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Forearm', side: 'Both', severity: 'Severe' })).toEqual([11, 17]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Hand', side: 'Both', severity: 'Severe' })).toEqual([13, 19]);
    expect(resolveInjuryRegionIds(map, { region: 'Leg', area: 'Knee', side: 'Both', severity: 'Severe' })).toEqual([22, 28]);
    expect(resolveInjuryRegionIds(map, { region: 'Arm', area: 'Shoulder', side: 'Left', severity: 'Moderate' })).toEqual([8]);
  });
});
