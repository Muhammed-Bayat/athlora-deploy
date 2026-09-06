import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Card, Input } from '../../components';
import { ApiError } from '../../api/client';
import { createClub, listClubs, listMyClubJoinRequests, requestToJoinClub, withdrawClubJoinRequest } from '../../api/clubs';
import type { Club, ClubJoinRequest } from '../../types';
import styles from './ClubOnboarding.module.css';

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Could not update your Club access. Please try again.';
}

export function ClubOnboarding({ onMembershipAvailable }: { onMembershipAvailable: () => void }) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [requests, setRequests] = useState<ClubJoinRequest[]>([]);
  const [search, setSearch] = useState('');
  const [clubName, setClubName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const membershipRefreshRequested = useRef(false);

  const load = async (query = search) => {
    const [clubResponse, requestResponse] = await Promise.all([listClubs(query), listMyClubJoinRequests()]);
    setClubs(clubResponse.data);
    setRequests(requestResponse.data);
  };

  useEffect(() => {
    void Promise.all([listClubs(), listMyClubJoinRequests()]).then(([clubResponse, requestResponse]) => {
      setClubs(clubResponse.data);
      setRequests(requestResponse.data);
    }).catch((loadError: unknown) => setError(errorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (requests.some((request) => request.status === 'approved')) {
      if (!membershipRefreshRequested.current) {
        membershipRefreshRequested.current = true;
        onMembershipAvailable();
      }
      return;
    }
    if (!requests.some((request) => request.status === 'pending')) return;

    let active = true;
    const refreshRequests = async () => {
      try {
        const response = await listMyClubJoinRequests();
        if (!active) return;
        setRequests(response.data);
        if (response.data.some((request) => request.status === 'approved') && !membershipRefreshRequested.current) {
          membershipRefreshRequested.current = true;
          onMembershipAvailable();
        }
      } catch (refreshError: unknown) {
        if (active) setError(errorMessage(refreshError));
      }
    };
    const interval = window.setInterval(() => void refreshRequests(), 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [onMembershipAvailable, requests]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await createClub(clubName.trim());
      onMembershipAvailable();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally { setBusy(false); }
  };

  const searchClubs = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null);
    try { await load(search); } catch (searchError) { setError(errorMessage(searchError)); } finally { setBusy(false); }
  };

  const requestJoin = async (clubId: string) => {
    setBusy(true); setError(null);
    try { await requestToJoinClub(clubId); await load(); } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const withdraw = async (requestId: string) => {
    setBusy(true); setError(null);
    try { await withdrawClubJoinRequest(requestId); await load(); } catch (withdrawError) { setError(errorMessage(withdrawError)); } finally { setBusy(false); }
  };

  const pendingClubIds = new Set(requests.filter((request) => request.status === 'pending').map((request) => request.clubId));
  const clubNameFor = (request: ClubJoinRequest) => request.clubName ?? clubs.find((club) => club.id === request.clubId)?.name ?? 'Club';

  return <main className={styles.page} aria-labelledby="club-onboarding-heading">
    <section className={styles.intro}>
      <p>Club access</p><h1 id="club-onboarding-heading">Set up your Club</h1>
      <span>Create the Club you coach, or request access to one that already exists.</span>
    </section>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.grid}>
      <Card className={styles.card}>
        <p>Create</p><h2>Start a Club</h2><span>You will become its coach and can invite your staff afterwards.</span>
        <form onSubmit={(event) => void create(event)}><label htmlFor="club-name">Club name</label><Input id="club-name" value={clubName} onChange={(event) => setClubName(event.target.value)} disabled={busy} required /><Button type="submit" disabled={busy || !clubName.trim()}>{busy ? 'Creating...' : 'Create Club'}</Button></form>
      </Card>
      <Card className={styles.card}>
        <p>Join</p><h2>Find a Club</h2><span>Search all Clubs and send a request to its coaches.</span>
        <form onSubmit={(event) => void searchClubs(event)}><label htmlFor="club-search">Club name</label><Input id="club-search" value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} /><Button type="submit" variant="secondary" disabled={busy}>Search</Button></form>
        <ul className={styles.clubList}>{clubs.map((club) => <li key={club.id}><strong>{club.name}</strong><Button variant="ghost" onClick={() => void requestJoin(club.id)} disabled={busy || pendingClubIds.has(club.id)}>{pendingClubIds.has(club.id) ? 'Request pending' : 'Request to join'}</Button></li>)}</ul>
      </Card>
    </div>
    {requests.length > 0 && <Card className={styles.requests}><p>Requests</p><h2>Your Club requests</h2><ul>{requests.map((request) => <li key={request.id}><span><strong>{clubNameFor(request)}</strong><small>{request.status.replace('_', ' ')}</small></span>{request.status === 'pending' && <Button variant="ghost" onClick={() => void withdraw(request.id)} disabled={busy}>Withdraw</Button>}</li>)}</ul><Button variant="secondary" onClick={onMembershipAvailable} disabled={busy}>Check access again</Button></Card>}
  </main>;
}
