import { describe, expect, it } from 'vitest';
import { isRealtimeTargetRelevant } from './useRealtimeRoom';

describe('session invalidation targeting', () => {
  it('accepts event-wide legacy invalidations but excludes other sessions and entrants', () => {
    expect(isRealtimeTargetRelevant({ eventId: 'event' }, 'event', 'session', 'entrant')).toBe(true);
    expect(isRealtimeTargetRelevant({ eventId: 'other' }, 'event', 'session')).toBe(false);
    expect(isRealtimeTargetRelevant({ eventId: 'event', disciplineSessionId: 'other' }, 'event', 'session')).toBe(false);
    expect(isRealtimeTargetRelevant({ eventId: 'event', disciplineSessionId: 'session', entrantId: 'other' }, 'event', 'session', 'entrant')).toBe(false);
    expect(isRealtimeTargetRelevant({ eventId: 'event', disciplineSessionId: 'session', entrantId: 'entrant' }, 'event', 'session', 'entrant')).toBe(true);
    expect(isRealtimeTargetRelevant({ eventId: 'event', disciplineSessionId: 'session' }, 'event')).toBe(true);
  });
});
