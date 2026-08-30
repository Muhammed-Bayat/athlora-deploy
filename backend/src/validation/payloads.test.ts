import { describe, expect, it } from 'vitest';
import { ApiError } from '../middleware/errors.js';
import {
  applyTimelineEntryPatch,
  parseAthleteCreatePayload,
  parseAthleteListQuery,
  parseAthleteReplacementPayload,
  parseAthleteStatusPayload,
  parseEventCreatePayload,
  parseEventListQuery,
  parseEventParticipantCreatePayload,
  parseEventParticipantReplacementPayload,
  parseEventReplacementPayload,
  parseFixtureInvitationCreatePayload,
  parseFixtureInvitationResponsePayload,
  parseResultOverridePayload,
  parseTimelineEntryCreatePayload,
  parseTimelineEntryDeletePayload,
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

describe('event participant payloads', () => {
  it('parses strict assignment and RSVP replacement payloads', () => {
    expect(parseEventParticipantCreatePayload({ athleteId: ATHLETE_ID })).toEqual({
      athleteId: ATHLETE_ID,
    });
    expect(parseEventParticipantReplacementPayload({ rsvpStatus: 'yes' })).toEqual({
      rsvpStatus: 'yes',
    });
  });

  it('rejects malformed identifiers and server-controlled assignment fields', () => {
    expectValidationError(
      () =>
        parseEventParticipantCreatePayload({
          athleteId: 'not-a-uuid',
          eventId: ATHLETE_ID,
          rsvpStatus: 'yes',
        }),
      [
        {
          path: 'athleteId',
          code: 'invalid_format',
          message: 'Expected a canonical UUID',
        },
        { path: 'eventId', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'rsvpStatus', code: 'unknown_field', message: 'Field is not allowed' },
      ],
    );
  });

  it('requires a supported RSVP status for replacement', () => {
    expectValidationError(
      () => parseEventParticipantReplacementPayload({ rsvpStatus: 'maybe', athleteId: ATHLETE_ID }),
      [
        { path: 'athleteId', code: 'unknown_field', message: 'Field is not allowed' },
        {
          path: 'rsvpStatus',
          code: 'invalid_value',
          message: 'Expected one of: pending, yes, no',
        },
      ],
    );
  });
});

describe('athlete payloads', () => {
  it('normalizes create and replacement payloads with omitted nullable fields', () => {
    expect(parseAthleteCreatePayload({ name: '  Ada Runner  ', dob: '2000-02-29', squadIds: [] })).toEqual({
      name: 'Ada Runner',
      dob: '2000-02-29',
      gender: null,
      squadIds: [],
      notes: null,
    });
    expect(parseAthleteReplacementPayload({ name: 'Ada Runner', squadIds: [] })).toEqual({
      name: 'Ada Runner',
      dob: null,
      gender: null,
      squadIds: [],
      notes: null,
    });
    expect(parseAthleteCreatePayload({ name: 'Ada Runner', squadIds: [] }).squadIds).toEqual([]);
  });

  it('rejects malformed dates, blank names, unknown fields, and server fields in order', () => {
    expectValidationError(
      () =>
        parseAthleteCreatePayload({
          name: '   ',
          dob: '2025-02-29',
          id: ATHLETE_ID,
          coachId: ATHLETE_ID,
          squadIds: [],
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

describe('athlete list queries', () => {
  it('defaults to the active roster with no filters', () => {
    expect(parseAthleteListQuery({})).toEqual({ includeArchived: false });
  });

  it('parses includeArchived and trimmed name and squad ID filters', () => {
    expect(
      parseAthleteListQuery({ includeArchived: 'true', name: '  ari ', squadId: ATHLETE_ID }),
    ).toEqual({ includeArchived: true, name: 'ari', squadId: ATHLETE_ID });
    expect(parseAthleteListQuery({ includeArchived: 'false' })).toEqual({ includeArchived: false });
  });

  it('parses an exact lifecycle status filter', () => {
    expect(parseAthleteListQuery({ status: 'inactive' })).toEqual({ includeArchived: false, status: 'inactive' });
  });

  it('rejects unknown, malformed, blank, and non-string query values', () => {
    expectValidationError(
      () => parseAthleteListQuery({ includeArchived: 'banana', page: '1', name: '   ', squadId: 5 }),
      [
        { path: 'includeArchived', code: 'invalid_value', message: 'Expected "true" or "false"' },
        { path: 'name', code: 'blank', message: 'Must not be blank' },
        { path: 'page', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'squadId', code: 'invalid_type', message: 'Expected a string' },
      ],
    );
  });
});

describe('athlete lifecycle payloads', () => {
  it('accepts only a supported target status', () => {
    expect(parseAthleteStatusPayload({ status: 'archived' })).toEqual({ status: 'archived' });
    expectValidationError(() => parseAthleteStatusPayload({ status: 'paused' }), [
      { path: 'status', code: 'invalid_value', message: 'Expected one of: active, inactive, archived' },
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
      discipline: '100m',
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

describe('event list queries', () => {
  it('defaults to no filters', () => {
    expect(parseEventListQuery({})).toEqual({});
  });

  it('parses type, status, and inclusive date range filters', () => {
    expect(
      parseEventListQuery({ type: 'competition', status: 'completed', dateFrom: ' 2026-01-01 ' }),
    ).toEqual({ type: 'competition', status: 'completed', dateFrom: '2026-01-01' });
    expect(parseEventListQuery({ dateTo: '2026-12-31' })).toEqual({ dateTo: '2026-12-31' });
  });

  it('rejects unknown, invalid-enum, blank, and malformed-date values', () => {
    expectValidationError(
      () =>
        parseEventListQuery({
          type: 'race',
          status: 'done',
          dateFrom: '2026-02-29',
          dateTo: 'not-a-date',
          page: '1',
        }),
      [
        { path: 'dateFrom', code: 'invalid_format', message: 'Expected a real date in YYYY-MM-DD format' },
        { path: 'dateTo', code: 'invalid_format', message: 'Expected a real date in YYYY-MM-DD format' },
        { path: 'page', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'status', code: 'invalid_value', message: 'Expected one of: scheduled, in_progress, completed, cancelled' },
        { path: 'type', code: 'invalid_value', message: 'Expected one of: competition, training' },
      ],
    );
  });

  it('rejects an inverted date range', () => {
    expectValidationError(
      () => parseEventListQuery({ dateFrom: '2026-08-14', dateTo: '2026-08-01' }),
      [
        {
          path: 'dateFrom',
          code: 'invalid_range',
          message: 'dateFrom must not be after dateTo',
        },
      ],
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
        expectedVersion: 2,
        value: null,
        incidentType: null,
        noteText: null,
      }),
    ).toEqual({ expectedVersion: 2, value: null, incidentType: null, noteText: null });
    expect(parseTimelineEntryPatchPayload({ expectedVersion: 3, entryType: 'split' })).toEqual({
      expectedVersion: 3,
      entryType: 'split',
    });
  });

  it('requires a positive expected version and at least one editable field', () => {
    expectValidationError(() => parseTimelineEntryPatchPayload({}), [
      { path: '$', code: 'empty_payload', message: 'At least one editable field is required' },
      { path: 'expectedVersion', code: 'required', message: 'Field is required' },
    ]);
    expectValidationError(() => parseTimelineEntryPatchPayload({ expectedVersion: 0 }), [
      { path: '$', code: 'empty_payload', message: 'At least one editable field is required' },
      { path: 'expectedVersion', code: 'invalid_value', message: 'Expected a positive integer' },
    ]);
    expectValidationError(() => parseTimelineEntryPatchPayload({
      expectedVersion: 2_147_483_648,
      value: 10.9,
    }), [
      { path: 'expectedVersion', code: 'invalid_value', message: 'Expected a positive integer' },
    ]);
  });

  it('rejects immutable, audit, and server-controlled fields', () => {
    expectValidationError(
      () => parseTimelineEntryPatchPayload({
        expectedVersion: 2,
        value: 10.9,
        athleteId: ATHLETE_ID,
        deviceId: 'watch-1',
        unit: 'seconds',
        version: 2,
      }),
      [
        { path: 'athleteId', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'deviceId', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'unit', code: 'unknown_field', message: 'Field is not allowed' },
        { path: 'version', code: 'unknown_field', message: 'Field is not allowed' },
      ],
    );
  });

  it('validates cross-field state separately after a sparse patch is merged', () => {
    const patch = parseTimelineEntryPatchPayload({
      expectedVersion: 1,
      entryType: 'note',
      noteText: '  Review video ',
    });
    const { expectedVersion: _expectedVersion, ...editable } = patch;
    const merged = {
      entryType: 'attempt' as const,
      value: 10.9,
      unit: 'seconds' as const,
      incidentType: null,
      noteText: null,
      ...editable,
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

    expect(applyTimelineEntryPatch(state, {
      expectedVersion: 1,
      value: null,
      incidentType: 'dns',
    })).toEqual({
      ...state,
      value: null,
      unit: null,
      incidentType: 'dns',
    });
  });

  it('parses a strict version-aware delete payload', () => {
    expect(parseTimelineEntryDeletePayload({ expectedVersion: 4 })).toEqual({ expectedVersion: 4 });
    expectValidationError(() => parseTimelineEntryDeletePayload({ expectedVersion: 1.5 }), [
      { path: 'expectedVersion', code: 'invalid_value', message: 'Expected a positive integer' },
    ]);
    expectValidationError(() => parseTimelineEntryDeletePayload({ expectedVersion: 4, id: ATHLETE_ID }), [
      { path: 'id', code: 'unknown_field', message: 'Field is not allowed' },
    ]);
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

describe('fixture invitation payloads', () => {
  it('normalizes invitation email and accepts valid response states', () => {
    expect(parseFixtureInvitationCreatePayload({ email: ' Guest@Example.com ' })).toEqual({
      email: 'guest@example.com', expiresInDays: 7,
    });
    expect(parseFixtureInvitationResponsePayload({ response: 'change_requested', message: ' Move the start time ' })).toEqual({
      response: 'change_requested', message: 'Move the start time',
    });
  });

  it('requires a bounded expiry and a message only for change requests', () => {
    expectValidationError(
      () => parseFixtureInvitationCreatePayload({ email: 'guest@example.com', expiresInDays: 31 }),
      [{ path: 'expiresInDays', code: 'invalid_value', message: 'Expected an integer from 1 to 30' }],
    );
    expectValidationError(
      () => parseFixtureInvitationResponsePayload({ response: 'change_requested' }),
      [{ path: 'message', code: 'required', message: 'A change request needs a message' }],
    );
    expectValidationError(
      () => parseFixtureInvitationResponsePayload({ response: 'accepted', message: 'Thanks' }),
      [{ path: 'message', code: 'not_allowed', message: 'Only change requests may include a message' }],
    );
  });
});
