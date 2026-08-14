import { describe, expect, it } from 'vitest';
import { ApiError } from '../middleware/errors.js';
import {
  applyTimelineEntryPatch,
  parseAthleteCreatePayload,
  parseAthleteReplacementPayload,
  parseEventCreatePayload,
  parseEventReplacementPayload,
  parseResultOverridePayload,
  parseTimelineEntryCreatePayload,
  parseTimelineEntryPatchPayload,
  validateTimelineEntryState,
  type ValidationIssue,
} from './payloads.js';

const ATHLETE_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';

function captureValidationError(action: () => unknown): ApiError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiError);
  return caught as ApiError;
}

function expectValidationError(action: () => unknown, issues: ValidationIssue[]): void {
  const error = captureValidationError(action);
  expect({
    status: error.status,
    code: error.code,
    message: error.message,
    details: error.details,
  }).toEqual({
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: { issues },
  });
}

describe('athlete payloads', () => {
  it('normalizes create and replacement payloads with omitted nullable fields', () => {
    expect(parseAthleteCreatePayload({ name: '  Ada Runner  ', dob: '2000-02-29' })).toEqual({
      name: 'Ada Runner',
      dob: '2000-02-29',
      gender: null,
      squad: null,
      notes: null,
    });
    expect(parseAthleteReplacementPayload({ name: 'Ada Runner' })).toEqual({
      name: 'Ada Runner',
      dob: null,
      gender: null,
      squad: null,
      notes: null,
    });
    expect(parseAthleteCreatePayload({ name: 'Ada Runner', squad: '   ' }).squad).toBeNull();
  });

  it('rejects malformed dates, blank names, unknown fields, and server fields in order', () => {
    expectValidationError(
      () =>
        parseAthleteCreatePayload({
          name: '   ',
          dob: '2025-02-29',
          id: ATHLETE_ID,
          coachId: ATHLETE_ID,
          surprise: true,
        }),
      [
        { path: 'coachId', code: 'unknown_field', message: 'Field is not allowed' },
        {
          path: 'dob',
          code: 'invalid_format',
          message: 'Expected a real date in YYYY-MM-DD format or null',
        },
        { path: 'id', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'name', code: 'blank', message: 'Must not be blank' },
        { path: 'surprise', code: 'unknown_field', message: 'Field is not allowed' },
      ],
    );
  });

  it('uses the exact validation envelope for a non-object payload', () => {
    expectValidationError(() => parseAthleteCreatePayload([]), [
      { path: '$', code: 'invalid_type', message: 'Expected payload to be an object' },
    ]);
  });
});

describe('event payloads', () => {
  it('defaults create status and normalizes optional fields', () => {
    expect(
      parseEventCreatePayload({
        type: 'competition',
        title: '  County Final ',
        date: '2028-02-29',
        time: '09:05',
        discipline: '100m',
        locationName: '  Main track ',
        latitude: -90,
        longitude: 180,
      }),
    ).toEqual({
      type: 'competition',
      discipline: '100m',
      title: 'County Final',
      date: '2028-02-29',
      time: '09:05:00',
      locationName: 'Main track',
      latitude: -90,
      longitude: 180,
      status: 'scheduled',
    });
  });

  it('requires status for full replacement while nulling omitted optional fields', () => {
    expectValidationError(
      () =>
        parseEventReplacementPayload({
          type: 'training',
          title: 'Starts',
          date: '2026-08-14',
        }),
      [{ path: 'status', code: 'required', message: 'Field is required' }],
    );

    expect(
      parseEventReplacementPayload({
        type: 'training',
        title: 'Starts',
        date: '2026-08-14',
        status: 'in_progress',
      }),
    ).toEqual({
      type: 'training',
      discipline: null,
      title: 'Starts',
      date: '2026-08-14',
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
      status: 'in_progress',
    });
  });

  it('rejects invalid calendar, time, coordinate, enum, and discipline values', () => {
    expectValidationError(
      () =>
        parseEventCreatePayload({
          type: 'race',
          discipline: null,
          title: 'Meet',
          date: '1900-02-29',
          time: '23:59:60',
          latitude: 90.01,
          longitude: '180',
        }),
      [
        {
          path: 'date',
          code: 'invalid_format',
          message: 'Expected a real date in YYYY-MM-DD format',
        },
        { path: 'latitude', code: 'out_of_range', message: 'Expected a number from -90 to 90' },
        { path: 'longitude', code: 'invalid_type', message: 'Expected a finite number or null' },
        {
          path: 'time',
          code: 'invalid_format',
          message: 'Expected a time in HH:mm or HH:mm:ss format',
        },
        {
          path: 'type',
          code: 'invalid_value',
          message: 'Expected one of: competition, training',
        },
      ],
    );

    expectValidationError(
      () =>
        parseEventCreatePayload({
          type: 'training',
          discipline: '200m',
          title: 'Meet',
          date: '2026-08-14',
        }),
      [{ path: 'discipline', code: 'invalid_value', message: 'Expected 100m or null' }],
    );
  });
});

describe('timeline create payloads', () => {
  it('normalizes the fixed discipline/unit and permits incidents on non-note entries', () => {
    expect(
      parseTimelineEntryCreatePayload({
        athleteId: ATHLETE_ID,
        entryType: 'attempt',
        value: 10.81,
        incidentType: 'lane_infringement',
        isFoul: false,
        deviceId: null,
      }),
    ).toEqual({
      athleteId: ATHLETE_ID,
      discipline: '100m',
      entryType: 'attempt',
      value: 10.81,
      unit: 'seconds',
      isFoul: false,
      incidentType: 'lane_infringement',
      noteText: null,
      deviceId: null,
    });
  });

  it('accepts explicit null value and unit together', () => {
    expect(
      parseTimelineEntryCreatePayload({
        athleteId: ATHLETE_ID,
        entryType: 'attempt',
        value: null,
        unit: null,
        incidentType: 'dns',
      }),
    ).toMatchObject({ value: null, unit: null, incidentType: 'dns' });
  });

  it('keeps value and unit null together when no race time is supplied', () => {
    expect(
      parseTimelineEntryCreatePayload({
        athleteId: ATHLETE_ID,
        entryType: 'penalty',
        incidentType: 'false_start',
      }),
    ).toMatchObject({ value: null, unit: null, incidentType: 'false_start' });
  });

  it('accepts a trimmed note with no measurement or incident state', () => {
    expect(
      parseTimelineEntryCreatePayload({
        athleteId: ATHLETE_ID,
        discipline: '100m',
        entryType: 'note',
        noteText: '  Wind picked up  ',
      }),
    ).toEqual({
      athleteId: ATHLETE_ID,
      discipline: '100m',
      entryType: 'note',
      value: null,
      unit: null,
      isFoul: false,
      incidentType: null,
      noteText: 'Wind picked up',
      deviceId: null,
    });
  });

  it('rejects zero, non-finite, foul, malformed UUID, and non-contract constants', () => {
    expectValidationError(
      () =>
        parseTimelineEntryCreatePayload({
          athleteId: 'not-a-uuid',
          discipline: null,
          entryType: 'attempt',
          value: 0,
          unit: 'metres',
          isFoul: true,
        }),
      [
        { path: 'athleteId', code: 'invalid_format', message: 'Expected a canonical UUID' },
        { path: 'discipline', code: 'invalid_value', message: 'Expected 100m' },
        { path: 'isFoul', code: 'invalid_value', message: 'Expected false' },
        { path: 'unit', code: 'invalid_value', message: 'Expected seconds' },
        {
          path: 'value',
          code: 'invalid_value',
          message: 'Expected a positive finite race time or null',
        },
      ],
    );

    expectValidationError(
      () =>
        parseTimelineEntryCreatePayload({
          athleteId: ATHLETE_ID,
          entryType: 'attempt',
          value: Number.POSITIVE_INFINITY,
        }),
      [
        {
          path: 'value',
          code: 'invalid_value',
          message: 'Expected a positive finite race time or null',
        },
      ],
    );
  });

  it('enforces note state and rejects server-controlled fields', () => {
    expectValidationError(
      () =>
        parseTimelineEntryCreatePayload({
          athleteId: ATHLETE_ID,
          entryType: 'note',
          value: 1,
          unit: 'seconds',
          incidentType: 'dq',
          id: ATHLETE_ID,
          recordedBy: ATHLETE_ID,
        }),
      [
        { path: 'id', code: 'unknown_field', message: 'Field is not allowed' },
        {
          path: 'incidentType',
          code: 'invalid_state',
          message: 'A note entry cannot have an incident',
        },
        { path: 'noteText', code: 'required', message: 'A note entry requires noteText' },
        { path: 'recordedBy', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'unit', code: 'invalid_state', message: 'A note entry cannot have a unit' },
        { path: 'value', code: 'invalid_state', message: 'A note entry cannot have a value' },
      ],
    );
  });
});

describe('timeline patch and merged state', () => {
  it('preserves explicit nulls and omits absent fields', () => {
    expect(
      parseTimelineEntryPatchPayload({
        value: null,
        incidentType: null,
        noteText: null,
        deviceId: null,
      }),
    ).toEqual({ value: null, incidentType: null, noteText: null, deviceId: null });
    expect(parseTimelineEntryPatchPayload({ entryType: 'split' })).toEqual({ entryType: 'split' });
    expect(parseTimelineEntryPatchPayload({ deviceId: '   ' })).toEqual({ deviceId: null });
  });

  it('rejects an empty patch and immutable/server-controlled fields', () => {
    expectValidationError(() => parseTimelineEntryPatchPayload({}), [
      { path: '$', code: 'empty_payload', message: 'At least one field is required' },
    ]);
    expectValidationError(
      () => parseTimelineEntryPatchPayload({ athleteId: ATHLETE_ID, unit: 'seconds', version: 2 }),
      [
        { path: 'athleteId', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'unit', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'version', code: 'unknown_field', message: 'Field is not allowed' },
      ],
    );
  });

  it('validates cross-field state separately after a sparse patch is merged', () => {
    const patch = parseTimelineEntryPatchPayload({ entryType: 'note', noteText: '  Review video ' });
    const merged = {
      entryType: 'attempt' as const,
      value: 10.9,
      unit: 'seconds' as const,
      incidentType: null,
      noteText: null,
      ...patch,
    };

    expectValidationError(() => validateTimelineEntryState(merged), [
      { path: 'unit', code: 'invalid_state', message: 'A note entry cannot have a unit' },
      { path: 'value', code: 'invalid_state', message: 'A note entry cannot have a value' },
    ]);
  });

  it('rejects note text on a non-note merged state', () => {
    expectValidationError(
      () =>
        validateTimelineEntryState({
          entryType: 'penalty',
          value: null,
          unit: null,
          incidentType: 'false_start',
          noteText: 'not allowed',
        }),
      [
        {
          path: 'noteText',
          code: 'invalid_state',
          message: 'Only a note entry can have noteText',
        },
      ],
    );
  });

  it('rejects a seconds unit without a value in merged state', () => {
    expectValidationError(
      () =>
        validateTimelineEntryState({
          entryType: 'attempt',
          value: null,
          unit: 'seconds',
          incidentType: 'dns',
          noteText: null,
        }),
      [
        {
          path: 'unit',
          code: 'invalid_state',
          message: 'A value and seconds unit must either both be present or both be null',
        },
      ],
    );
  });

  it('derives the fixed unit while applying a sparse patch', () => {
    const state = {
      entryType: 'attempt' as const,
      value: 10.9,
      unit: 'seconds' as const,
      incidentType: null,
      noteText: null,
    };

    expect(applyTimelineEntryPatch(state, { value: null, incidentType: 'dns' })).toEqual({
      ...state,
      value: null,
      unit: null,
      incidentType: 'dns',
    });
  });
});

describe('result override payloads', () => {
  it('accepts a positive override with a trimmed reason and paired nulls to clear', () => {
    expect(parseResultOverridePayload({ manualOverride: 10.72, overrideReason: '  Photo finish ' })).toEqual(
      { manualOverride: 10.72, overrideReason: 'Photo finish' },
    );
    expect(parseResultOverridePayload({ manualOverride: null, overrideReason: null })).toEqual({
      manualOverride: null,
      overrideReason: null,
    });
  });

  it('rejects zero, blank reasons, unpaired values, and derived/audit fields', () => {
    expectValidationError(
      () => parseResultOverridePayload({ manualOverride: 0, overrideReason: '   ' }),
      [
        {
          path: 'manualOverride',
          code: 'invalid_value',
          message: 'Expected a positive finite race time or null',
        },
        { path: 'overrideReason', code: 'blank', message: 'Must not be blank' },
      ],
    );

    expectValidationError(
      () => parseResultOverridePayload({ manualOverride: null, overrideReason: 'Keep this' }),
      [
        {
          path: 'overrideReason',
          code: 'invalid_state',
          message: 'overrideReason must be null when clearing an override',
        },
      ],
    );

    expectValidationError(
      () =>
        parseResultOverridePayload({
          manualOverride: 10.7,
          overrideReason: 'Correction',
          finalResult: 10.8,
          isPb: true,
          overriddenBy: ATHLETE_ID,
          overrideAt: '2026-08-14T10:00:00Z',
        }),
      [
        { path: 'finalResult', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'isPb', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'overriddenBy', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'overrideAt', code: 'unknown_field', message: 'Field is not allowed' },
      ],
    );
  });
});
