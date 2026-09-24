import { describe, expect, it } from 'vitest';
import { deriveTrackTime } from './resultDerivation.js';

const attempt = (id: string, value: number) => ({ id, entryType: 'attempt' as const, value, isFoul: false, incidentType: null, deletedAt: null });

describe('deriveTrackTime with coach-selected entry', () => {
  it('prefers the selected attempt over the latest attempt', () => {
    const entries = [attempt('a', 11.5), attempt('b', 11.2), attempt('c', 11.4)];
    expect(deriveTrackTime(entries, 'competition', 'a')).toEqual({ value: 11.5, incident: null, outcome: 'valid' });
    expect(deriveTrackTime(entries, 'competition')).toEqual({ value: 11.4, incident: null, outcome: 'valid' });
  });

  it('falls back to latest when the selected entry is missing', () => {
    const entries = [attempt('a', 11.5), attempt('b', 11.2)];
    expect(deriveTrackTime(entries, 'competition', 'missing')).toEqual({ value: 11.2, incident: null, outcome: 'valid' });
  });
});
