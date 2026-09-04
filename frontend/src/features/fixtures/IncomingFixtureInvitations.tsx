import { useEffect, useState } from 'react';
import { Button, Card, Input } from '../../components';
import { ApiError } from '../../api/client';
import {
  listIncomingFixtureInvitations,
  respondToIncomingFixtureInvitation,
} from '../../api/fixtures';
import type { IncomingFixtureInvitation } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Fixture invitation could not be updated.';
}

export function IncomingFixtureInvitations({ compact = false }: { compact?: boolean }) {
  const { activeWorkspace } = useWorkspace();
  const [invitations, setInvitations] = useState<IncomingFixtureInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeMessage, setChangeMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void listIncomingFixtureInvitations().then(({ data }) => {
      if (current) setInvitations(data);
    }).catch((requestError: unknown) => {
      if (current) setError(message(requestError));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [activeWorkspace.id]);

  const respond = async (invitation: IncomingFixtureInvitation, response: 'accepted' | 'declined' | 'change_requested') => {
    if (response === 'change_requested' && !changeMessage.trim()) return;
    setBusyId(invitation.id);
    setError(null);
    try {
      await respondToIncomingFixtureInvitation(
        invitation.id,
        response,
        response === 'change_requested' ? changeMessage.trim() : undefined,
      );
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setChangeFor(null);
      setChangeMessage('');
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusyId(null);
    }
  };

  if (loading || invitations.length === 0) return null;
  return <section aria-labelledby="incoming-fixtures-heading">
    <header><p>Event invitations</p><h2 id="incoming-fixtures-heading">{invitations.length} incoming fixture invitation{invitations.length === 1 ? '' : 's'}</h2></header>
    {error && <p role="alert">{error}</p>}
    {invitations.map((invitation) => <Card key={invitation.id}>
      <h3>{invitation.event.title}</h3>
      <p>{invitation.event.date} · {invitation.event.time ?? 'Time not set'} · {invitation.event.locationName ?? 'Venue not set'}</p>
      {!compact && <p>Review the event details before accepting. Your team’s roster stays private from the host until event participation is active.</p>}
       {changeFor === invitation.id ? <div><label htmlFor={`fixture-change-${invitation.id}`}>Requested changes</label><Input id={`fixture-change-${invitation.id}`} value={changeMessage} onChange={(event) => setChangeMessage(event.target.value)} disabled={busyId === invitation.id} /><Button variant="secondary" onClick={() => void respond(invitation, 'change_requested')} disabled={busyId === invitation.id || !changeMessage.trim()}>Send request</Button><Button variant="ghost" onClick={() => { setChangeFor(null); setChangeMessage(''); }} disabled={busyId === invitation.id}>Cancel</Button></div> : <div><Button onClick={() => void respond(invitation, 'accepted')} disabled={busyId === invitation.id}>{busyId === invitation.id ? 'Saving...' : 'Accept event'}</Button><Button variant="secondary" onClick={() => setChangeFor(invitation.id)} disabled={busyId === invitation.id}>Request changes</Button><Button variant="ghost" onClick={() => void respond(invitation, 'declined')} disabled={busyId === invitation.id}>Decline</Button></div>}
    </Card>)}
  </section>;
}
