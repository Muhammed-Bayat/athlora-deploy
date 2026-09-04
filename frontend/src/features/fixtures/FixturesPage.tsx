import { useEffect, useState, type FormEvent } from 'react';
import { listAthletes } from '../../api/athletes';
import { addGuestFixtureParticipant, createGuestFixtureEntry, listGuestFixtureParticipants, listGuestFixtureResults, listGuestFixtures, overrideGuestFixtureResult, removeGuestFixtureParticipant, updateGuestFixtureParticipant, withdrawGuestFixture } from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { Button, Card, EmptyState, Input } from '../../components';
import type { Athlete, EventParticipantSummary, FixtureDetail, Result, RsvpStatus } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Fixture data could not be updated.';
}

export function FixturesPage() {
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [fixtures, setFixtures] = useState<FixtureDetail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [athleteId, setAthleteId] = useState('');
  const [resultAthleteId, setResultAthleteId] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = fixtures.find((fixture) => fixture.event.id === selectedId) ?? null;

  const load = () => {
    void Promise.all([listGuestFixtures(), listAthletes({ status: 'active' })])
      .then(([fixtureResponse, athleteResponse]) => {
        setFixtures(fixtureResponse.data);
        setAthletes(athleteResponse.data);
        setSelectedId((current) => (current && fixtureResponse.data.some((fixture) => fixture.event.id === current) ? current : (fixtureResponse.data[0]?.event.id ?? null)));
      })
      .catch((requestError: unknown) => setError(message(requestError)));
  };
  useEffect(() => {
    load();
  }, [activeWorkspace.id]);
  useEffect(() => {
    if (!selectedId) {
      setParticipants([]);
      setResults([]);
      return;
    }
    void Promise.all([listGuestFixtureParticipants(selectedId), listGuestFixtureResults(selectedId)])
      .then(([participantResponse, resultResponse]) => {
        setParticipants(participantResponse.data);
        setResults(resultResponse.data);
      })
      .catch((requestError: unknown) => setError(message(requestError)));
  }, [selectedId]);
  const reloadSelected = () => {
    if (selectedId) {
      void Promise.all([listGuestFixtureParticipants(selectedId), listGuestFixtureResults(selectedId)])
        .then(([p, r]) => {
          setParticipants(p.data);
          setResults(r.data);
        })
        .catch((requestError: unknown) => setError(message(requestError)));
    }
    load();
  };
  const add = async () => {
    if (!selectedId || !athleteId) return;
    setBusy(true);
    setError(null);
    try {
      await addGuestFixtureParticipant(selectedId, athleteId);
      setAthleteId('');
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };
  const updateRsvp = async (participant: EventParticipantSummary, rsvpStatus: RsvpStatus) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await updateGuestFixtureParticipant(selectedId, participant.athleteId, rsvpStatus);
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (participant: EventParticipantSummary) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await removeGuestFixtureParticipant(selectedId, participant.athleteId);
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };
  const record = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !resultAthleteId || !time) return;
    setBusy(true);
    setError(null);
    try {
      await createGuestFixtureEntry(selectedId, {
        athleteId: resultAthleteId,
        entryType: 'attempt',
        value: Number(time),
        unit: 'seconds',
      });
      setTime('');
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };
  const correct = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !resultAthleteId || !time || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await overrideGuestFixtureResult(selectedId, resultAthleteId, {
        manualOverride: Number(time),
        overrideReason: reason.trim(),
      });
      setTime('');
      setReason('');
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawGuestFixture(selectedId);
      reloadSelected();
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="fixtures-heading">
      <header>
        <p>Guest team access</p>
        <h1 id="fixtures-heading">Fixtures</h1>
        <span>Manage only this workspace’s roster and results.</span>
      </header>
      {error && <p role="alert">{error}</p>}
      {fixtures.length === 0 ? (
        <EmptyState title="No accepted fixtures" description="Accepted fixture invitations will appear here." />
      ) : (
        <div>
          <label htmlFor="fixture-select">Fixture</label>
          <select id="fixture-select" value={selectedId ?? ''} onChange={(change) => setSelectedId(change.target.value)}>
            {fixtures.map((fixture) => (
              <option key={fixture.event.id} value={fixture.event.id}>
                {fixture.event.title} · {fixture.event.date}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <Card>
                <h2>{selected.event.title}</h2>
                <p>
                  {selected.event.date} · {selected.event.time ?? 'Time not set'} · {selected.event.locationName ?? 'Venue not set'}
                </p>
                <p>
                  Fixture revision {selected.revision}. Team status: <strong>{selected.teamStatus.replace('_', ' ')}</strong>.
                </p>
                {selected.teamStatus === 'reacceptance_required' && <p role="status">Roster and result access will reopen after your coach reaccepts the updated invitation link.</p>}
                {isCoach && selected.event.status === 'scheduled' && selected.teamStatus === 'accepted' && (
                  <Button variant="danger" onClick={() => void withdraw()} disabled={busy}>
                    Withdraw team
                  </Button>
                )}
              </Card>
              <Card>
                <h2>Our roster</h2>
                {isCoach && selected.event.status === 'scheduled' && selected.teamStatus === 'accepted' && (
                  <>
                    <label htmlFor="fixture-athlete">Assign active athlete</label>
                    <select id="fixture-athlete" value={athleteId} onChange={(change) => setAthleteId(change.target.value)}>
                      <option value="">Select athlete</option>
                      {athletes
                        .filter((athlete) => !participants.some((participant) => participant.athleteId === athlete.id))
                        .map((athlete) => (
                          <option key={athlete.id} value={athlete.id}>
                            {athlete.name}
                          </option>
                        ))}
                    </select>
                    <Button onClick={() => void add()} disabled={busy || !athleteId}>
                      Assign athlete
                    </Button>
                  </>
                )}
                <ul>
                  {participants.map((participant) => (
                    <li key={participant.athleteId}>
                      <strong>{participant.athlete.name}</strong> ·{' '}
                      <select aria-label={`RSVP for ${participant.athlete.name}`} value={participant.rsvpStatus} onChange={(change) => void updateRsvp(participant, change.target.value as RsvpStatus)} disabled={!isCoach || busy || selected.event.status !== 'scheduled' || selected.teamStatus !== 'accepted'}>
                        <option value="pending">Pending</option>
                        <option value="yes">Attending</option>
                        <option value="no">Not attending</option>
                      </select>
                      {isCoach && selected.event.status === 'scheduled' && selected.teamStatus === 'accepted' && (
                        <Button variant="ghost" onClick={() => void remove(participant)} disabled={busy}>
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
              {selected.event.status === 'in_progress' && selected.teamStatus === 'accepted' && (
                <Card>
                  <h2>Record or correct our result</h2>
                  <form onSubmit={(event) => void record(event)}>
                    <label htmlFor="fixture-result-athlete">Athlete</label>
                    <select id="fixture-result-athlete" value={resultAthleteId} onChange={(change) => setResultAthleteId(change.target.value)} required>
                      <option value="">Select athlete</option>
                      {participants.map((participant) => (
                        <option key={participant.athleteId} value={participant.athleteId}>
                          {participant.athlete.name}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="fixture-time">Finish time (seconds)</label>
                    <Input id="fixture-time" type="number" min="0.01" step="0.01" value={time} onChange={(change) => setTime(change.target.value)} required />
                    <Button type="submit" disabled={busy}>
                      Record time
                    </Button>
                  </form>
                  <form onSubmit={(event) => void correct(event)}>
                    <label htmlFor="fixture-reason">Correction reason</label>
                    <Input id="fixture-reason" value={reason} onChange={(change) => setReason(change.target.value)} required />
                    <Button type="submit" disabled={busy}>
                      Apply correction
                    </Button>
                  </form>
                  <ul>
                    {results.map((result) => (
                      <li key={result.athleteId}>
                        {participants.find((participant) => participant.athleteId === result.athleteId)?.athlete.name ?? 'Athlete'}: {result.manualOverride ?? result.finalResult ?? 'No result'}
                        {result.manualOverride !== null ? ' (manual correction)' : ''}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
