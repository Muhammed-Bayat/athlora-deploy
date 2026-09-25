import { describe, expect, it } from 'vitest';
import { assertPublicSessionEntryContent } from './sessionPerformances.js';

describe('public session entry restrictions', () => {
  it('rejects private notes from public logger entries', () => {
    let error: unknown;
    try {
      assertPublicSessionEntryContent({
        entryType: 'note', value: null, unit: null, isFoul: false, incidentType: null, noteText: 'Private note', deviceId: null,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ status: 422, code: 'PUBLIC_LOGGER_ENTRY_RESTRICTED' });
  });

  it('allows public discipline observations without a note', () => {
    expect(() => assertPublicSessionEntryContent({
      entryType: 'attempt', value: 6.45, unit: 'metres', isFoul: false, incidentType: null, noteText: null, deviceId: null,
    })).not.toThrow();
  });
});
