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
} from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { Button, Card, Input } from '../../components';
import type { AthleticsEvent, FixtureInvitation, FixtureTeamRoster, Result } from '../../types';

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
  const [invitations, setInvitations] = useState<FixtureInvitation[]>([]);
  const [rosters, setRosters] = useState<FixtureTeamRoster[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
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

  if (!canOperate) return null;
  const eligible = event.type === 'competition' && event.discipline === '100m' && event.status === 'scheduled';
  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setBusy(true); setError(null); setLink(null);
    try {
      const invitation = await createFixtureInvitation(event.id, { email: email.trim() });
      setEmail('');
      setInvitations((current) => [invitation, ...current]);
      if (invitation.token) setLink(`${window.location.origin}/fixture-invitations/${invitation.token}`);
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const resend = async (invitation: FixtureInvitation) => {
    setBusy(true); setError(null);
    try {
      const replacement = await resendFixtureInvitation(event.id, invitation.id);
      setInvitations((current) => current.map((item) => item.id === invitation.id ? replacement : item));
      if (replacement.token) setLink(`${window.location.origin}/fixture-invitations/${replacement.token}`);
    } catch (requestError) { setError(message(requestError)); } finally { setBusy(false); }
  };
  const revoke = async (invitation: FixtureInvitation) => {
    setBusy(true); setError(null);
    try { await revokeFixtureInvitation(event.id, invitation.id); setInvitations((current) => current.filter((item) => item.id !== invitation.id)); }
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
    <header><p>Cross-workspace fixture</p><h2>Participating teams</h2><span>Each guest team controls only its own roster. Changes to date, time, venue, or teams require reacceptance.</span></header>
    {eligible && <form onSubmit={(formEvent) => void submit(formEvent)}>
      <label htmlFor={`fixture-email-${event.id}`}>Guest team coach email</label>
      <Input id={`fixture-email-${event.id}`} type="email" value={email} onChange={(change) => setEmail(change.target.value)} required disabled={busy} />
      <p>Workspace members, including assistants, already have event access. Fixture guests accept from a separate workspace.</p>
      <Button type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create fixture invitation'}</Button>
    </form>}
    {!eligible && <p>Fixtures can only be invited to scheduled 100m competitions.</p>}
    {link && <p role="status">Share this email-bound invitation link: <a href={link}>{link}</a></p>}
    {error && <p role="alert">{error}</p>}
    {invitations.length > 0 && <section aria-labelledby={`fixture-invitations-${event.id}`}><h3 id={`fixture-invitations-${event.id}`}>Invitation history</h3><ul>{invitations.map((invitation) => <li key={invitation.id}><strong>{invitation.email}</strong> · {invitation.status.replace('_', ' ')} · revision {invitation.revision}{invitation.responseMessage ? `: ${invitation.responseMessage}` : ''}{invitation.status !== 'accepted' && invitation.status !== 'revoked' && event.status === 'scheduled' && <><Button variant="ghost" onClick={() => void resend(invitation)} disabled={busy}>Resend</Button><Button variant="ghost" onClick={() => void revoke(invitation)} disabled={busy}>Revoke</Button></>}</li>)}</ul></section>}
    {rosters.length > 0 && <section aria-labelledby={`fixture-rosters-${event.id}`}><h3 id={`fixture-rosters-${event.id}`}>Team rosters</h3>{rosters.map(({ team, participants }, index) => <article key={team.workspaceId}><h4>{team.workspaceName} · {team.status.replace('_', ' ')}</h4><p>{participants.length === 0 ? 'No athletes selected.' : participants.map((participant) => participant.athlete.name).join(', ')}</p>{isCoach && event.status !== 'scheduled' && index > 0 && team.status !== 'withdrawn' && <Button variant="ghost" onClick={() => void withdraw(team.workspaceId)} disabled={busy}>Record withdrawal</Button>}</article>)}</section>}
    {results.length > 0 && <section aria-labelledby={`fixture-results-${event.id}`}><h3 id={`fixture-results-${event.id}`}>Shared results</h3><table><thead><tr><th>Athlete</th><th>Result</th><th>Placing</th><th>PB</th><th>SB</th><th aria-label="Actions" /></tr></thead><tbody>{results.map((result) => {
      const team = rosters.find(({ participants }) => participants.some((p) => p.athleteId === result.athleteId));
      const athlete = team?.participants.find((p) => p.athleteId === result.athleteId);
      return <tr key={result.athleteId}><td>{athlete?.athlete.name ?? 'Unknown'}{team && <span> · {team.team.workspaceName}</span>}</td><td>{formatResult(result)}</td><td>{result.placing ?? '—'}</td><td>{result.isPb ? 'PB' : ''}</td><td>{result.isSb ? 'SB' : ''}</td><td>{canOperate && event.status === 'in_progress' && <Button variant="ghost" onClick={() => setCorrectTarget({ athleteId: result.athleteId, athleteName: athlete?.athlete.name ?? 'Unknown' })} disabled={busy}>Correct</Button>}</td></tr>;
    })}</tbody></table></section>}
    {correctTarget && <section><h3>Correct {correctTarget.athleteName}</h3><form onSubmit={(formEvent) => void submitCorrection(formEvent)}><label htmlFor="correct-time">New time (seconds)</label><Input id="correct-time" type="number" step="0.01" min="0" value={correctTime} onChange={(change) => setCorrectTime(change.target.value)} required disabled={busy} /><label htmlFor="correct-reason">Reason</label><Input id="correct-reason" value={correctReason} onChange={(change) => setCorrectReason(change.target.value)} required disabled={busy} /><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save correction'}</Button><Button variant="secondary" onClick={() => { setCorrectTarget(null); setCorrectTime(''); setCorrectReason(''); }} disabled={busy}>Cancel</Button></form></section>}
  </Card>;
}
