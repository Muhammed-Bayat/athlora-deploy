import { describe, expect, it } from 'vitest';
import { ApiError } from '../middleware/errors.js';
import {
  parseAthleteCreatePayload,
  parseAthleteListQuery,
  parseSquadPayload,
} from './payloads.js';

const SQUAD_A = '11111111-1111-4111-8111-111111111111';
const SQUAD_B = '22222222-2222-4222-8222-222222222222';

describe('squad contracts', () => {
  it('accepts an athlete with several unique squad memberships', () => {
    expect(parseAthleteCreatePayload({ name: 'Ari Runner', squadIds: [SQUAD_A, SQUAD_B] })).toMatchObject({
      name: 'Ari Runner', squadIds: [SQUAD_A, SQUAD_B],
    });
  });

  it('rejects duplicate and malformed squad memberships', () => {
    expect(() => parseAthleteCreatePayload({ name: 'Ari Runner', squadIds: [SQUAD_A, SQUAD_A, 'bad'] })).toThrow(ApiError);
  });

  it('uses canonical squad IDs for roster filters and trims squad names', () => {
    expect(parseAthleteListQuery({ squadId: SQUAD_A })).toEqual({ includeArchived: false, squadId: SQUAD_A });
    expect(parseSquadPayload({ name: '  Sprint  ' })).toEqual({ name: 'Sprint' });
  });
});
