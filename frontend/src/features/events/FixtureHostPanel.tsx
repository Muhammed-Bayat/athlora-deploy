import { useEffect, useState, type FormEvent } from 'react';
import {
  createFixtureInvitation,
  listFixtureInvitations,
  listFixtureRosters,
  listHostedFixtureResults,
  recordFixtureWithdrawal,
  resendFixtureInvitation,
  revokeFixtureInvitation,
  overrideHostFixtureResult,
  refreshFixtureNotifications,
} from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { listClubs } from '../../api/clubs';
import { Button, Card, Input } from '../../components';
import type { AthleticsEvent, Club, FixtureInvitation, FixtureTeamRoster, Result } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND') {
    return 'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.';
  }
  return error instanceof ApiError ? error.message : 'Fixture details could not be updated.';
}

function formatResult(result: Result): string {
  if (result.manualOverride !== null && result.manualOverride !== undefined) return `${result.manualOverride}s (corrected)`;
  if (result.outcome === 'dq') return 'DQ';
  if (result.outcome === 'dnf') return 'DNF';
  if (result.outcome === 'dns') return 'DNS';
  return result.finalResult !== null ? `${result.finalResult}s` : '—';
}

export function FixtureHostPanel({ event, canOperate, isCoach }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean }) {
  const { activeWorkspace } = useWorkspace();
  const [invitations, setInvitations] = useState<FixtureInvitation[]>([]);
  const [rosters, setRosters] = useState<FixtureTeamRoster[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubSearch, setClubSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<{ athleteId: string; athleteName: string } | null>(null);
  const [correctTime, setCorrectTime] = useState('');
  const [correctReason, setCorrectReason] = useState('');

  const reload = () => {
    void Promise.all([listFixtureInvitations(event.id), listFixtureRosters(event.id), listHostedFixtureResults(event.id)])
      .then(([inviteResponse, rosterResponse, resultResponse]) => {
        setInvitations(inviteResponse.data);
        setRosters(rosterResponse.data);
        setResults(resultResponse.data);
      })
      .catch(() => { /* Fixture data is supplementary to the event detail. */ });
  };

  useEffect(() => {
    void Promise.all([listFixtureInvitations(event.id), listFixtureRosters(event.id), listHostedFixtureResults(event.id)])
      .then(([inviteResponse, rosterResponse, resultResponse]) => {
        setInvitations(inviteResponse.data);
        setRosters(rosterResponse.data);
        setResults(resultResponse.data);
      })
      .catch(() => { /* Fixture data is supplementary to the event detail. */ });
  }, [event.id]);

  const searchClubs = (query: string) => {
    setClubSearch(query);
    void listClubs(query).then(({ data }) => setClubs(data)).catch(() => setClubs([]));
  };

  if (!canOperate) return null;
  const eligible = event.type === 'competition' && event.discipline === '100m' && event.status === 'scheduled';
  const inviteClub = async (club: Club) => {
    setBusy(true); setError(null);
    try {
      const invitation = await createFixtureInvitation(event.id, { targetClubId: club.id });
      setInvitations((current) => [invitation, ...current]);
      setClubs((current) => current.filter((item) => item.id !== club.id));
      refreshFixtureNotifications();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const resend = async (invitation: FixtureInvitation) => {
    setBusy(true); setError(null);
    try {
      const replacement = await resendFixtureInvitation(event.id, invitation.id);
      setInvitations((current) => current.map((item) => item.id === invitation.id ? replacement : item));
      refreshFixtureNotifications();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const revoke = async (invitation: FixtureInvitation) => {
    setBusy(true); setError(null);
    try { await revokeFixtureInvitation(event.id, invitation.id); setInvitations((current) => current.filter((item) => item.id !== invitation.id)); refreshFixtureNotifications(); }
    catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const withdraw = async (workspaceId: string) => {
    setBusy(true); setError(null);
    try { await recordFixtureWithdrawal(event.id, workspaceId); reload(); }
    catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const submitCorrection = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!correctTarget || !correctTime || !correctReason.trim()) return;
    setBusy(true); setError(null);
    try {
      await overrideHostFixtureResult(event.id, correctTarget.athleteId, { manualOverride: Number(correctTime), overrideReason: correctReason.trim() });
      setCorrectTarget(null); setCorrectTime(''); setCorrectReason('');
      reload();
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };

  return <Card>
    <header><h2>Participating clubs</h2></header>
    {rosters.length > 0 && <section aria-labelledby={`fixture-rosters-${event.id}`}><h3 id={`fixture-rosters-${event.id}`}>Accepted</h3>{rosters.map(({ team, participants }, index) => <article key={team.workspaceId}><h4>{team.workspaceName}</h4><p>{participants.length === 0 ? 'No athletes selected.' : participants.map((participant) => participant.athlete.name).join(', ')}</p>{isCoach && event.status !== 'scheduled' && index > 0 && team.status !== 'withdrawn' && <Button variant="ghost" onClick={() => void withdraw(team.workspaceId)} disabled={busy}>Record withdrawal</Button>}</article>)}</section>}
    {invitations.filter((invitation) => invitation.status === 'pending' || invitation.status === 'change_requested').length > 0 && <section aria-labelledby={`fixture-pending-${event.id}`}><h3 id={`fixture-pending-${event.id}`}>Pending</h3><ul>{invitations.filter((invitation) => invitation.status === 'pending' || invitation.status === 'change_requested').map((invitation) => <li key={invitation.id}><strong>{invitation.targetWorkspaceName ?? invitation.email}</strong> · {invitation.status === 'pending' ? 'Invited' : 'Changes requested'}<Button variant="ghost" onClick={() => void resend(invitation)} disabled={busy}>Resend</Button><Button variant="ghost" onClick={() => void revoke(invitation)} disabled={busy}>Revoke</Button></li>)}</ul></section>}
    {eligible && <section aria-labelledby={`fixture-search-${event.id}`}><h3 id={`fixture-search-${event.id}`}>Invite a club</h3><label htmlFor={`fixture-club-search-${event.id}`}>Search registered clubs</label><Input id={`fixture-club-search-${event.id}`} value={clubSearch} onChange={(change) => searchClubs(change.target.value)} disabled={busy} />{clubs.length > 0 && <ul>{clubs.filter((club) => club.workspaceId !== activeWorkspace.id && !invitations.some((invitation) => invitation.targetWorkspaceId === club.workspaceId && (invitation.status === 'pending' || invitation.status === 'accepted' || invitation.status === 'change_requested'))).map((club) => <li key={club.id}><strong>{club.name}</strong><Button variant="ghost" onClick={() => void inviteClub(club)} disabled={busy}>Invite</Button></li>)}</ul>}</section>}
    {error && <p role="alert">{error}</p>}
    {results.length > 0 && <section aria-labelledby={`fixture-results-${event.id}`}><h3 id={`fixture-results-${event.id}`}>Shared results</h3><table><thead><tr><th>Athlete</th><th>Result</th><th>Placing</th><th>PB</th><th>SB</th><th aria-label="Actions" /></tr></thead><tbody>{results.map((result) => {
      const team = rosters.find(({ participants }) => participants.some((p) => p.athleteId === result.athleteId));
      const athlete = team?.participants.find((p) => p.athleteId === result.athleteId);
      return <tr key={result.athleteId}><td>{athlete?.athlete.name ?? 'Unknown'}{team && <span> · {team.team.workspaceName}</span>}</td><td>{formatResult(result)}</td><td>{result.placing ?? '—'}</td><td>{result.isPb ? 'PB' : ''}</td><td>{result.isSb ? 'SB' : ''}</td><td>{canOperate && event.status === 'in_progress' && <Button variant="ghost" onClick={() => setCorrectTarget({ athleteId: result.athleteId, athleteName: athlete?.athlete.name ?? 'Unknown' })} disabled={busy}>Correct</Button>}</td></tr>;
    })}</tbody></table></section>}
    {correctTarget && <section><h3>Correct {correctTarget.athleteName}</h3><form onSubmit={(formEvent) => void submitCorrection(formEvent)}><label htmlFor="correct-time">New time (seconds)</label><Input id="correct-time" type="number" step="0.01" min="0" value={correctTime} onChange={(change) => setCorrectTime(change.target.value)} required disabled={busy} /><label htmlFor="correct-reason">Reason</label><Input id="correct-reason" value={correctReason} onChange={(change) => setCorrectReason(change.target.value)} required disabled={busy} /><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save correction'}</Button><Button variant="secondary" onClick={() => { setCorrectTarget(null); setCorrectTime(''); setCorrectReason(''); }} disabled={busy}>Cancel</Button></form></section>}
  </Card>;
}
