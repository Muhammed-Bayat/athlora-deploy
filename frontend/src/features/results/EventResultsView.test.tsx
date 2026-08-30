import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  Athlete,
  AthleticsEvent,
  EventParticipantSummary,
  Result,
  TimelineEntry,
} from '../../types';
import { EventResultsView } from './EventResultsView';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function event(overrides: Partial<Pick<AthleticsEvent, 'id' | 'type' | 'status'>> = {}) {
  return {
    id: EVENT_ID,
    type: 'competition' as const,
    status: 'completed' as const,
    ...overrides,
  };
}

function result(athleteId: string, overrides: Partial<Result> = {}): Result {
  return {
    eventId: EVENT_ID,
    athleteId,
    discipline: '100m',
    outcome: 'valid',
    finalResult: 11.24,
    unit: 'seconds',
    placing: 1,
    isPb: false,
    isSb: false,
    manualOverride: null,
    overrideReason: null,
    overriddenBy: null,
    overrideAt: null,
    updatedAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  };
}

function participant(
  athleteId: string,
  name: string,
  overrides: Partial<EventParticipantSummary> = {},
): EventParticipantSummary {
  return {
    eventId: EVENT_ID,
    athleteId,
    rsvpStatus: 'yes',
    athlete: { id: athleteId, name, squadNames: ['Sprint'], archivedAt: null, status: 'active' },
    statusReviewRequired: false,
    ...overrides,
  };
}

function athlete(athleteId: string, name: string, overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: athleteId,
    coachId: 'coach-1',
    name,
    dob: null,
    gender: null,
    squads: [],
    notes: null,
    archivedAt: null,
    status: 'active',
    statusChangedAt: '2026-08-01T10:00:00.000Z',
    statusChangedBy: 'coach-1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function timelineEntry(
  id: string,
  athleteId: string,
  incidentType: TimelineEntry['incidentType'],
  overrides: Partial<TimelineEntry> = {},
): TimelineEntry {
  return {
    id,
    eventId: EVENT_ID,
    athleteId,
    discipline: '100m',
    entryType: 'penalty',
    value: null,
    unit: null,
    isFoul: false,
    incidentType,
    noteText: null,
    recordedBy: 'coach-1',
    version: 1,
    deviceId: null,
    createdAt: '2026-08-17T09:00:00.000Z',
    updatedAt: '2026-08-17T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function renderView({
  eventValue = event(),
  results = [],
  participants = [],
  timeline = [],
  athletes = [],
  currentUser = null,
  onCorrect,
}: {
  eventValue?: ReturnType<typeof event>;
  results?: Result[];
  participants?: EventParticipantSummary[];
  timeline?: TimelineEntry[];
  athletes?: Athlete[];
  currentUser?: { id: string; name: string } | null;
  onCorrect?: React.ComponentProps<typeof EventResultsView>['onCorrect'];
} = {}) {
  return render(
    <EventResultsView
      event={eventValue}
      results={results}
      participants={participants}
      timeline={timeline}
      athletes={athletes}
      currentUser={currentUser}
      onCorrect={onCorrect}
    />,
  );
}

describe('EventResultsView', () => {
  it('sorts unsorted competition results by effective time and preserves backend tied placings', () => {
    const participants = [
      participant('delta', 'Delta Runner'),
      participant('cara', 'Cara Runner'),
      participant('alpha', 'Alpha Runner'),
      participant('beta', 'Beta Runner'),
    ];
    const results = [
      result('delta', { finalResult: 11.2, placing: 4 }),
      result('cara', { finalResult: 11.5, placing: 2, manualOverride: 11 }),
      result('alpha', { finalResult: 10.8, placing: 1 }),
      result('beta', { finalResult: 11, placing: 2 }),
    ];

    renderView({ participants, results });

    const rows = within(screen.getByRole('list', { name: 'Event results' })).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/Runner$/).textContent)).toEqual([
      'Alpha Runner',
      'Beta Runner',
      'Cara Runner',
      'Delta Runner',
    ]);
    expect(within(rows[0]).getByLabelText('Place 1')).toHaveTextContent('1');
    expect(within(rows[1]).getByLabelText('Place 2')).toHaveTextContent('2');
    expect(within(rows[2]).getByLabelText('Place 2')).toHaveTextContent('2');
    expect(within(rows[3]).getByLabelText('Place 4')).toHaveTextContent('4');
    expect(within(rows[2]).getByText('11.00s')).toBeInTheDocument();
    expect(within(rows[2]).getByText('11.50s')).toBeInTheDocument();
  });

  it('shows training best times without placing text', () => {
    renderView({
      eventValue: event({ type: 'training' }),
      participants: [participant('athlete-1', 'Training Runner')],
      results: [result('athlete-1', { finalResult: 11.04, placing: 1 })],
    });

    expect(screen.getByText(/Placings are intentionally omitted/)).toBeInTheDocument();
    expect(screen.getByText('Best time')).toBeInTheDocument();
    expect(screen.queryByText('Place')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Place 1')).not.toBeInTheDocument();
  });

  it('shows active false-start and lane-infringement penalties but ignores deleted entries', () => {
    renderView({
      participants: [participant('athlete-1', 'Penalty Runner')],
      results: [result('athlete-1')],
      timeline: [
        timelineEntry('entry-1', 'athlete-1', 'false_start'),
        timelineEntry('entry-2', 'athlete-1', 'false_start'),
        timelineEntry('entry-3', 'athlete-1', 'lane_infringement'),
        timelineEntry('entry-4', 'athlete-1', 'false_start', {
          deletedAt: '2026-08-17T09:30:00.000Z',
        }),
      ],
    });

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('False start ×2')).toBeInTheDocument();
    expect(within(row).getByText('Lane infringement')).toBeInTheDocument();
    expect(within(row).queryByText('None recorded')).not.toBeInTheDocument();
  });

  it('distinguishes DQ, DNF, DNS, and no result while keeping no result last', () => {
    const participants = [
      participant('waiting', 'Waiting Runner'),
      participant('dns', 'DNS Runner'),
      participant('finisher', 'Finisher'),
      participant('dq', 'DQ Runner'),
      participant('dnf', 'DNF Runner'),
    ];
    const results = [
      result('waiting', { outcome: 'no_result', finalResult: null, unit: null, placing: null }),
      result('dns', { outcome: 'dns', finalResult: null, unit: null, placing: null }),
      result('finisher', { finalResult: 10.92, placing: 1 }),
      result('dq', { outcome: 'dq', finalResult: null, unit: null, placing: null }),
      result('dnf', { outcome: 'dnf', finalResult: null, unit: null, placing: null }),
    ];

    renderView({ participants, results });

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Finisher')).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByText('Waiting Runner')).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByText('No result recorded')).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByText('No result')).toBeInTheDocument();
    expect(within(rows.find((row) => row.textContent?.includes('DQ Runner'))!).getAllByText('Disqualified')).toHaveLength(2);
    expect(within(rows.find((row) => row.textContent?.includes('DNF Runner'))!).getAllByText('Did not finish')).toHaveLength(2);
    expect(within(rows.find((row) => row.textContent?.includes('DNS Runner'))!).getAllByText('Did not start')).toHaveLength(2);
  });

  it('renders PB/SB for an assigned partial athlete and identifies an archived historical result', () => {
    renderView({
      participants: [participant('assigned', 'Assigned Runner', {
        athlete: { id: 'assigned', name: 'Assigned Runner', squadNames: ['Development'], archivedAt: null, status: 'active' },
      })],
      results: [
        result('assigned', { finalResult: 10.75, isPb: true, isSb: true }),
        result('historical', { finalResult: 11.7, placing: 2 }),
      ],
      athletes: [athlete('historical', 'Former Runner', {
        squads: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Senior', archivedAt: null, createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' }],
        archivedAt: '2026-07-01T10:00:00.000Z',
      })],
    });

    const assignedRow = screen.getByText('Assigned Runner').closest('li')!;
    expect(assignedRow).toHaveTextContent('Development');
    expect(within(assignedRow).getByText('PB')).toBeInTheDocument();
    expect(within(assignedRow).getByText('SB')).toBeInTheDocument();
    expect(within(assignedRow).queryByText('Historical result')).not.toBeInTheDocument();

    const historicalRow = screen.getByText('Former Runner').closest('li')!;
    expect(historicalRow).toHaveTextContent('Senior');
    expect(within(historicalRow).getByText('Archived')).toBeInTheDocument();
    expect(within(historicalRow).getByText('Historical result')).toBeInTheDocument();
  });

  it('shows an effective override alongside its derived value and audit metadata', async () => {
    const onCorrect = vi.fn();
    const correctedResult = result('athlete-1', {
      finalResult: 11.24,
      manualOverride: 11.01,
      overrideReason: 'Photo finish review',
      overriddenBy: 'coach-1',
      overrideAt: '2026-08-17T10:05:00.000Z',
    });
    renderView({
      participants: [participant('athlete-1', 'Corrected Runner')],
      results: [correctedResult],
      currentUser: { id: 'coach-1', name: 'Coach Avery' },
      onCorrect,
    });

    const row = screen.getByRole('listitem');
    expect(within(row).getAllByText('11.01s')).toHaveLength(2);
    expect(within(row).getByText('11.24s')).toBeInTheDocument();
    expect(within(row).getByText('Manual correction')).toBeInTheDocument();
    expect(row).toHaveTextContent('by Coach Avery (you)');
    expect(within(row).getByText('17 Aug 2026, 10:05 UTC')).toHaveAttribute(
      'datetime',
      '2026-08-17T10:05:00.000Z',
    );
    expect(within(row).getByText('Photo finish review')).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Review correction' }));
    expect(onCorrect).toHaveBeenCalledWith(
      { athleteName: 'Corrected Runner', result: correctedResult },
      expect.any(HTMLButtonElement),
    );
  });

  it('shows an assigned athlete without a materialized result as a non-correctable partial row', () => {
    renderView({
      eventValue: event({ status: 'in_progress' }),
      participants: [participant('waiting', 'Waiting Runner')],
      onCorrect: vi.fn(),
    });

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('No result recorded')).toBeInTheDocument();
    expect(within(row).getByText('Log an entry before correcting.')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Correct time' })).not.toBeInTheDocument();
  });

  it('keeps a void outcome authoritative while retaining override audit history', () => {
    renderView({
      participants: [participant('athlete-1', 'Disqualified Runner')],
      results: [result('athlete-1', {
        outcome: 'dq',
        finalResult: null,
        unit: null,
        placing: null,
        manualOverride: 10.8,
        overrideReason: 'Timing review before incident',
        overriddenBy: 'another-user-id',
        overrideAt: '2026-08-17T10:05:00.000Z',
      })],
      onCorrect: vi.fn(),
    });

    const row = screen.getByRole('listitem');
    expect(within(row).getAllByText('Disqualified')).toHaveLength(2);
    expect(within(row).getByText('10.80s')).toBeInTheDocument();
    expect(row).toHaveTextContent('User another-');
    expect(row).toHaveTextContent('incident outcome takes precedence');
    expect(within(row).getByRole('button', { name: 'Review correction' })).toBeInTheDocument();
  });

  it.each([
    ['scheduled', false],
    ['cancelled', true],
  ] as const)('keeps corrections read-only for a %s event', (status, isCancelled) => {
    renderView({
      eventValue: event({ status }),
      participants: [participant('athlete-1', 'Read-only Runner')],
      results: [result('athlete-1')],
      onCorrect: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /Correct time|Review correction/ })).not.toBeInTheDocument();
    expect(screen.getByText('Corrections are read-only for this event status.')).toBeInTheDocument();
    if (isCancelled) {
      expect(screen.getByText(/Results are preserved as read-only history/)).toBeInTheDocument();
    } else {
      expect(screen.queryByText(/Results are preserved as read-only history/)).not.toBeInTheDocument();
    }
  });
});
