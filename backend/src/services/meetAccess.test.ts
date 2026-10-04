import { describe, expect, it } from 'vitest';
import type { MeetActor } from '../types/meets.js';
import { canOfficializeEntrant } from './meetAccess.js';

const coach: Extract<MeetActor, { userId: string }> = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222', role: 'coach' };
const publicLogger: MeetActor = { publicLoggerSessionId: '33333333-3333-4333-8333-333333333333', publicLoggerLinkId: '44444444-4444-4444-8444-444444444444', publicLoggerName: 'Timekeeper', publicLoggerClub: 'North Club' };

describe('canOfficializeEntrant', () => {
  it('allows a coach only for entrants registered by their own club', () => {
    expect(canOfficializeEntrant(coach, coach.workspaceId)).toBe(true);
    expect(canOfficializeEntrant(coach, '55555555-5555-4555-8555-555555555555')).toBe(false);
  });

  it('never lets a public logger session officialize results', () => {
    expect(canOfficializeEntrant(publicLogger, coach.workspaceId)).toBe(false);
  });
});
