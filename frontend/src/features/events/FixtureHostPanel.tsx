import { useEffect, useState, type FormEvent } from 'react';
import {
  createFixtureInvitation,
  listFixtureInvitations,
  listFixtureRosters,
  recordFixtureWithdrawal,
  resendFixtureInvitation,
  revokeFixtureInvitation,
} from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { Button, Card, Input } from '../../components';
import type { AthleticsEvent, FixtureInvitation, FixtureTeamRoster } from '../../types';

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND') {
    return 'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.';
  }
  return error instanceof ApiError ? error.message : 'Fixture details could not be updated.';
}

export function FixtureHostPanel({ event, isCoach }: { event: AthleticsEvent; isCoach: boolean }) {
  const [invitations, setInvitations] = useState<FixtureInvitation[]>([]);
  const [rosters, setRosters] = useState<FixtureTeamRoster[]>([]);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    void Promise.all([listFixtureInvitations(event.id), listFixtureRosters(event.id)])
      .then(([inviteResponse, rosterResponse]) => {
        setInvitations(inviteResponse.data);
        setRosters(rosterResponse.data);
      })
      .catch(() => { /* Fixture data is supplementary to the event detail. */ });
  };

  useEffect(() => {
    void Promise.all([listFixtureInvitations(event.id), listFixtureRosters(event.id)])
      .then(([inviteResponse, rosterResponse]) => {
        setInvitations(inviteResponse.data);
        setRosters(rosterResponse.data);
      })
      .catch(() => { /* Fixture data is supplementary to the event detail. */ });
  }, [event.id]);

  if (!isCoach) return null;
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

  return <Card>
    <header><p>Cross-workspace fixture</p><h2>Participating teams</h2><span>Each guest team controls only its own roster. Changes to date, time, venue, or teams require reacceptance.</span></header>
    {eligible && <form onSubmit={(formEvent) => void submit(formEvent)}>
      <label htmlFor={`fixture-email-${event.id}`}>Guest coach email</label>
      <Input id={`fixture-email-${event.id}`} type="email" value={email} onChange={(change) => setEmail(change.target.value)} required disabled={busy} />
      <Button type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create fixture invitation'}</Button>
    </form>}
    {!eligible && <p>Fixtures can only be invited to scheduled 100m competitions.</p>}
    {link && <p role="status">Share this email-bound invitation link: <a href={link}>{link}</a></p>}
    {error && <p role="alert">{error}</p>}
    {invitations.length > 0 && <section aria-labelledby={`fixture-invitations-${event.id}`}><h3 id={`fixture-invitations-${event.id}`}>Invitation history</h3><ul>{invitations.map((invitation) => <li key={invitation.id}><strong>{invitation.email}</strong> · {invitation.status.replace('_', ' ')} · revision {invitation.revision}{invitation.responseMessage ? `: ${invitation.responseMessage}` : ''}{invitation.status !== 'accepted' && invitation.status !== 'revoked' && event.status === 'scheduled' && <><Button variant="ghost" onClick={() => void resend(invitation)} disabled={busy}>Resend</Button><Button variant="ghost" onClick={() => void revoke(invitation)} disabled={busy}>Revoke</Button></>}</li>)}</ul></section>}
    {rosters.length > 0 && <section aria-labelledby={`fixture-rosters-${event.id}`}><h3 id={`fixture-rosters-${event.id}`}>Team rosters</h3>{rosters.map(({ team, participants }, index) => <article key={team.workspaceId}><h4>{team.workspaceName} · {team.status.replace('_', ' ')}</h4><p>{participants.length === 0 ? 'No athletes selected.' : participants.map((participant) => participant.athlete.name).join(', ')}</p>{event.status !== 'scheduled' && index > 0 && team.status !== 'withdrawn' && <Button variant="ghost" onClick={() => void withdraw(team.workspaceId)} disabled={busy}>Record withdrawal</Button>}</article>)}</section>}
  </Card>;
}
