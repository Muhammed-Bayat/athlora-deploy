import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createPasswordTicket, deleteCurrentAccount } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button, Card, Input, Modal, Select } from '../../components';
import { useCurrentUser } from './CurrentUserContext';
import { useWorkspace } from './WorkspaceContext';
import { leaveCurrentWorkspace, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMemberRole } from '../../api/workspaces';
import { approveClubJoinRequest, listClubJoinRequests, listClubs, rejectClubJoinRequest } from '../../api/clubs';
import type { ClubJoinRequest, WorkspaceMember } from '../../types';
import { ClubBrandingCard } from './ClubBrandingCard';
import { useAthloraAssistant } from '../assistant/AthloraAssistantProvider';
import styles from './AuthPage.module.css';

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'The account service is unavailable. Please try again.';
}

export function AuthPage() {
  const { logout, user } = useAuth0();
  const currentUser = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const { stopAthloraAssistant } = useAthloraAssistant();
  const isCoach = activeWorkspace.role === 'coach';
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(isCoach);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [clubJoinRequests, setClubJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [clubJoinRequestsLoading, setClubJoinRequestsLoading] = useState(isCoach);
  const [clubJoinRequestError, setClubJoinRequestError] = useState<string | null>(null);
  const [clubRequestBusy, setClubRequestBusy] = useState<string | null>(null);
  const [activeClubId, setActiveClubId] = useState<string | null>(null);
  const hasAuth0Password = currentUser?.auth0Id.startsWith('auth0|') ?? false;

  const requestPasswordChange = async () => {
    setTicketBusy(true);
    setTicketUrl(null);
    setPasswordError(null);
    try {
      setTicketUrl(await createPasswordTicket());
    } catch (requestError) {
      setPasswordError(message(requestError));
    } finally {
      setTicketBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE') return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCurrentAccount();
      void stopAthloraAssistant();
      logout({ logoutParams: { returnTo: window.location.origin } });
    } catch (requestError) {
      setDeleteError(message(requestError));
      setDeleteBusy(false);
    }
  };

  const leaveClub = async () => {
    if (confirmation !== 'LEAVE') return;
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      void stopAthloraAssistant();
      await leaveCurrentWorkspace();
      window.dispatchEvent(new Event('athlora-workspace-left'));
    } catch (requestError) {
      setLeaveError(message(requestError));
      setLeaveBusy(false);
    }
  };

  useEffect(() => {
    if (!isCoach) return;
    let active = true;
    setMembersLoading(true);
    setMemberError(null);
    void listWorkspaceMembers(activeWorkspace.id).then((response) => {
      if (active) setMembers(response.data);
    }).catch((requestError: unknown) => {
      if (active) setMemberError(message(requestError));
    }).finally(() => {
      if (active) setMembersLoading(false);
    });
    return () => { active = false; };
  }, [activeWorkspace.id, isCoach]);

  useEffect(() => {
    if (!isCoach) return;
    let active = true;
    setClubJoinRequestsLoading(true);
    setClubJoinRequestError(null);
    void listClubs().then((response) => {
      const club = response.data.find((candidate) => candidate.workspaceId === activeWorkspace.id);
      if (!club) return [];
      if (active) setActiveClubId(club.id);
      return listClubJoinRequests(club.id).then((requests) => requests.data);
    }).then((requests) => {
      if (active) setClubJoinRequests(requests);
    }).catch((requestError: unknown) => {
      if (active) setClubJoinRequestError(message(requestError));
    }).finally(() => {
      if (active) setClubJoinRequestsLoading(false);
    });
    return () => { active = false; };
  }, [activeWorkspace.id, isCoach]);

  const changeMemberRole = async (member: WorkspaceMember, role: 'coach' | 'assistant') => {
    setMemberBusy(member.userId);
    setMemberError(null);
    try {
      await updateWorkspaceMemberRole(activeWorkspace.id, member.userId, role);
      setMembers((current) => current.map((item) => item.userId === member.userId ? { ...item, role } : item));
    } catch (requestError) {
      setMemberError(message(requestError));
    } finally {
      setMemberBusy(null);
    }
  };

  const removeMember = async (member: WorkspaceMember) => {
    setMemberBusy(member.userId);
    setMemberError(null);
    try {
      await removeWorkspaceMember(activeWorkspace.id, member.userId);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
    } catch (requestError) {
      setMemberError(message(requestError));
    } finally {
      setMemberBusy(null);
    }
  };

  const reviewClubRequest = async (request: ClubJoinRequest, decision: 'approved' | 'rejected', role?: 'coach' | 'assistant') => {
    if (!activeClubId) return;
    setClubRequestBusy(request.id);
    setClubJoinRequestError(null);
    try {
      if (decision === 'approved' && role) await approveClubJoinRequest(activeClubId, request.id, role);
      if (decision === 'rejected') await rejectClubJoinRequest(activeClubId, request.id);
      setClubJoinRequests((current) => current.filter((candidate) => candidate.id !== request.id));
    } catch (requestError) {
      setClubJoinRequestError(message(requestError));
    } finally { setClubRequestBusy(null); }
  };

  return (
    <section className={styles.page} aria-labelledby="account-heading">
      <header><p>Identity and access</p><h1 id="account-heading">Account settings</h1><span>Manage sign-in security and your Athlora Club.</span></header>
      <Card className={styles.profile}>
        <div className={styles.avatar}>{(currentUser?.name ?? user?.name ?? 'A').slice(0, 1).toUpperCase()}</div>
        <div><h2>{currentUser?.name ?? user?.name ?? 'Athlora user'}</h2><p>{currentUser?.email ?? user?.email}</p><small>{currentUser?.role ?? 'coach'} account</small></div>
      </Card>

      <div className={styles.grid}>
        <Card className={styles.setting}>
          <p>Authentication</p><h2>Password and sign-in</h2>
          <span>Auth0 securely manages your credentials. Athlora never receives or stores your password.</span>
          <div className={styles.actions}>
            {hasAuth0Password ? <Button onClick={() => void requestPasswordChange()} disabled={ticketBusy}>{ticketBusy ? 'Creating link...' : 'Change password'}</Button> : null}
            <Button variant="secondary" onClick={() => { void stopAthloraAssistant(); logout({ logoutParams: { returnTo: window.location.origin } }); }}>Sign out</Button>
          </div>
          {ticketUrl && <p className={styles.ticket} role="status">Your secure link is ready. <a href={ticketUrl}>Continue to Auth0</a>. The link expires in 15 minutes.</p>}
          {!hasAuth0Password && <p className={styles.ticket}>Your password is managed by your identity provider.</p>}
          {passwordError && <p className={styles.error} role="alert">{passwordError}</p>}
        </Card>

        <ClubBrandingCard />

        <Card className={styles.danger}>
          <p>Club membership</p><h2>Leave {activeWorkspace.name}</h2>
          <span>Leave this Club without deleting your account. Your past event records and live logging attribution remain in place.</span>
          <Button variant="danger" onClick={() => { setLeaveError(null); setConfirmation(''); setLeaveOpen(true); }}>Leave club</Button>
        </Card>

        <Card className={styles.danger}>
          <p>Danger zone</p><h2>Delete account</h2>
          <span>Permanently remove your Auth0 identity and Athlora Club access, including athletes, events, assignments, timeline entries, and results.</span>
          <Button variant="danger" onClick={() => { setDeleteError(null); setConfirmation(''); setDeleteOpen(true); }}>Delete my account</Button>
        </Card>
      </div>

      {isCoach && <Card className={styles.members}>
        <div><p>Club join requests</p><h2>Pending requests</h2><span>Choose the role each approved member will have in {activeWorkspace.name}.</span></div>
        {clubJoinRequestError && <p className={styles.error} role="alert">{clubJoinRequestError}</p>}
        {clubJoinRequestsLoading ? <p role="status">Loading Club requests...</p> : clubJoinRequests.length === 0 ? <p className={styles.muted}>No pending Club requests.</p> : <ul className={styles.memberList}>{clubJoinRequests.map((request) => <li key={request.id}><span><strong>{request.userName ?? 'Applicant'}</strong><small>{request.userEmail ?? 'Email unavailable'}</small></span><div className={styles.actions}><Button variant="ghost" onClick={() => void reviewClubRequest(request, 'approved', 'assistant')} disabled={clubRequestBusy !== null}>{clubRequestBusy === request.id ? 'Saving...' : 'Approve assistant'}</Button><Button variant="ghost" onClick={() => void reviewClubRequest(request, 'approved', 'coach')} disabled={clubRequestBusy !== null}>Approve coach</Button><Button variant="ghost" onClick={() => void reviewClubRequest(request, 'rejected')} disabled={clubRequestBusy !== null}>Reject</Button></div></li>)}</ul>}
      </Card>}

      {isCoach && <Card className={styles.members}>
        <div><p>Club access</p><h2>Club members</h2><span>Everyone with access to {activeWorkspace.name}.</span></div>
        {memberError && <p className={styles.error} role="alert">{memberError}</p>}
        {membersLoading ? <p role="status">Loading Club members...</p> : <ul className={`${styles.memberList} ${styles.clubMemberList}`}>{members.map((member) => <li key={member.userId}><span><strong>{member.name}{member.userId === currentUser?.id ? ' (you)' : ''}</strong><small>{member.email} · {member.role}</small></span><Select className={styles.roleSelect} aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => void changeMemberRole(member, event.target.value as 'coach' | 'assistant')} disabled={memberBusy !== null} options={[{ value: 'coach', label: 'Coach' }, { value: 'assistant', label: 'Assistant' }]} /><Button variant="ghost" onClick={() => void removeMember(member)} disabled={memberBusy !== null}>{memberBusy === member.userId ? 'Removing...' : 'Remove'}</Button></li>)}</ul>}
      </Card>}

      <Modal open={deleteOpen} title="Permanently delete account" onClose={() => { if (!deleteBusy) setDeleteOpen(false); }} closeDisabled={deleteBusy}>
        <div className={styles.confirmation}>
          <p>This cannot be undone. Type <strong>DELETE</strong> to confirm permanent removal of your identity and coaching data.</p>
          <label htmlFor="account-delete-confirmation">Confirmation</label>
          <Input id="account-delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleteBusy} autoComplete="off" />
          {deleteError && <p className={styles.error} role="alert">{deleteError}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Keep account</Button>
            <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleteBusy || confirmation !== 'DELETE'}>{deleteBusy ? 'Deleting account...' : 'Delete permanently'}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={leaveOpen} title={`Leave ${activeWorkspace.name}`} onClose={() => { if (!leaveBusy) setLeaveOpen(false); }} closeDisabled={leaveBusy}>
        <div className={styles.confirmation}>
          <p>You will lose access to this Club and return to Club setup. Your past records, including live-event entries, remain visible in this Club. Type <strong>LEAVE</strong> to confirm.</p>
          <label htmlFor="club-leave-confirmation">Confirmation</label>
          <Input id="club-leave-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={leaveBusy} autoComplete="off" />
          {leaveError && <p className={styles.error} role="alert">{leaveError}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setLeaveOpen(false)} disabled={leaveBusy}>Stay in club</Button>
            <Button variant="danger" onClick={() => void leaveClub()} disabled={leaveBusy || confirmation !== 'LEAVE'}>{leaveBusy ? 'Leaving...' : 'Leave club'}</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
