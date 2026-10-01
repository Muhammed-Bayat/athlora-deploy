import { useEffect, useState } from 'react';
import {
  createFixtureInvitation,
  listFixtureInvitations,
  listFixtureRosters,
  recordFixtureWithdrawal,
  resendFixtureInvitation,
  revokeFixtureInvitation,
  refreshFixtureNotifications,
} from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { listClubs } from '../../api/clubs';
import { Button, Card, ClubBadge, Input } from '../../components';
import type { AthleticsEvent, Club, FixtureInvitation, FixtureTeamRoster } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND') {
    return 'This event is unavailable in the selected workspace. Select its host workspace and reopen the event.';
  }
  return error instanceof ApiError ? error.message : 'Fixture details could not be updated.';
}

export function FixtureHostPanel({ event, canOperate, isCoach, usesSessionRosters = false }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean; usesSessionRosters?: boolean }) {
  const { activeWorkspace } = useWorkspace();
  const [invitations, setInvitations] = useState<FixtureInvitation[]>([]);
  const [rosters, setRosters] = useState<FixtureTeamRoster[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubSearch, setClubSearch] = useState('');
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
    let current = true;
    const load = () => void Promise.all([listFixtureInvitations(event.id), listFixtureRosters(event.id)])
      .then(([inviteResponse, rosterResponse]) => {
        if (!current) return;
        setInvitations(inviteResponse.data);
        setRosters(rosterResponse.data);
      })
      .catch(() => { /* Fixture data is supplementary to the event detail. */ });
    load();
    const refreshTimer = window.setInterval(load, 15_000);
    return () => {
      current = false;
      window.clearInterval(refreshTimer);
    };
  }, [event.id]);

  const searchClubs = (query: string) => {
    setClubSearch(query);
    void listClubs(query).then(({ data }) => setClubs(data)).catch(() => setClubs([]));
  };

  if (!canOperate) return null;
  const eligible = event.status === 'scheduled';
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

  return <Card>
    <header><h2>Participating clubs</h2></header>
    {rosters.length > 0 && <section aria-labelledby={`fixture-rosters-${event.id}`}><h3 id={`fixture-rosters-${event.id}`}>Our roster</h3>{rosters.filter(({ team }) => team.workspaceId === activeWorkspace.id).map(({ team, participants }) => <article key={team.workspaceId}><h4><ClubBadge name={team.workspaceName} branding={team.branding} size="sm" decorative />{team.workspaceName}</h4>{!usesSessionRosters && <p>{participants.length === 0 ? 'No athletes selected.' : participants.map((participant) => participant.athlete.name).join(', ')}</p>}</article>)}</section>}
    {rosters.some(({ team }) => team.workspaceId !== activeWorkspace.id && team.status === 'accepted') && <section aria-labelledby={`fixture-accepted-${event.id}`}><h3 id={`fixture-accepted-${event.id}`}>Accepted</h3><ul>{rosters.filter(({ team }) => team.workspaceId !== activeWorkspace.id && team.status === 'accepted').map(({ team }) => <li key={team.workspaceId}><ClubBadge name={team.workspaceName} branding={team.branding} size="sm" decorative />{team.workspaceName} · Accepted{isCoach && event.status === 'scheduled' && <Button variant="ghost" onClick={() => void withdraw(team.workspaceId)} disabled={busy}>Record withdrawal</Button>}</li>)}</ul></section>}
    {rosters.some(({ team }) => team.workspaceId !== activeWorkspace.id && team.status === 'reacceptance_required') && <section aria-labelledby={`fixture-reacceptance-${event.id}`}><h3 id={`fixture-reacceptance-${event.id}`}>Re-acceptance required</h3><ul>{rosters.filter(({ team }) => team.workspaceId !== activeWorkspace.id && team.status === 'reacceptance_required').map(({ team }) => <li key={team.workspaceId}><ClubBadge name={team.workspaceName} branding={team.branding} size="sm" decorative />{team.workspaceName} · Awaiting re-acceptance of updated terms</li>)}</ul></section>}
    {invitations.filter((invitation) => invitation.status === 'pending' || invitation.status === 'change_requested').length > 0 && <section aria-labelledby={`fixture-pending-${event.id}`}><h3 id={`fixture-pending-${event.id}`}>Pending</h3><ul>{invitations.filter((invitation) => invitation.status === 'pending' || invitation.status === 'change_requested').map((invitation) => <li key={invitation.id}>{invitation.status === 'pending' ? <><strong>{invitation.targetWorkspaceName ?? invitation.email}</strong> · Invited</> : <><strong>{invitation.targetWorkspaceName ?? invitation.email}</strong> requested a change</>}{invitation.responseMessage && <p><strong>Request:</strong> {invitation.responseMessage}{invitation.respondedAt && ` (${new Date(invitation.respondedAt).toLocaleString()})`}</p>}<Button variant="ghost" onClick={() => void resend(invitation)} disabled={busy}>Resend</Button><Button variant="ghost" onClick={() => void revoke(invitation)} disabled={busy}>Revoke</Button></li>)}</ul></section>}
    {invitations.filter((invitation) => invitation.status === 'declined' || invitation.status === 'revoked').length > 0 && <section aria-labelledby={`fixture-responses-${event.id}`}><h3 id={`fixture-responses-${event.id}`}>Responses</h3><ul>{invitations.filter((invitation) => invitation.status === 'declined' || invitation.status === 'revoked').map((invitation) => <li key={invitation.id}><strong>{invitation.targetWorkspaceName ?? invitation.email}</strong> · {invitation.status === 'declined' ? 'Declined' : 'Revoked'}{invitation.responseMessage && <p><strong>Response:</strong> {invitation.responseMessage}{invitation.respondedAt && ` (${new Date(invitation.respondedAt).toLocaleString()})`}</p>}</li>)}</ul></section>}
    {eligible && <section aria-labelledby={`fixture-search-${event.id}`}><h3 id={`fixture-search-${event.id}`}>Invite a club</h3><label htmlFor={`fixture-club-search-${event.id}`}>Search registered clubs</label><Input id={`fixture-club-search-${event.id}`} value={clubSearch} onChange={(change) => searchClubs(change.target.value)} disabled={busy} />{clubs.length > 0 && <ul>{clubs.filter((club) => club.workspaceId !== activeWorkspace.id && !invitations.some((invitation) => invitation.targetWorkspaceId === club.workspaceId && (invitation.status === 'pending' || invitation.status === 'accepted' || invitation.status === 'change_requested'))).map((club) => <li key={club.id}><strong>{club.name}</strong><Button variant="ghost" onClick={() => void inviteClub(club)} disabled={busy}>Invite</Button></li>)}</ul>}</section>}
    {error && <p role="alert">{error}</p>}
  </Card>;
}
