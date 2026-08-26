import { useEffect, useState, type FormEvent } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createPasswordTicket, deleteCurrentAccount } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button, Card, Input, Modal } from '../../components';
import { useCurrentUser } from './CurrentUserContext';
import { useWorkspace } from './WorkspaceContext';
import { inviteWorkspaceMember, listWorkspaceInvitations, listWorkspaceMembers, removeWorkspaceMember, resendWorkspaceInvitation, revokeWorkspaceInvitation, updateWorkspaceMemberRole } from '../../api/workspaces';
import type { WorkspaceInvitation, WorkspaceMember } from '../../types';
import styles from './AuthPage.module.css';

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'The account service is unavailable. Please try again.';
}

export function AuthPage() {
  const { logout, user } = useAuth0();
  const currentUser = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(isCoach);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'coach' | 'assistant'>('assistant');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
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
      logout({ logoutParams: { returnTo: window.location.origin } });
    } catch (requestError) {
      setDeleteError(message(requestError));
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    if (!isCoach) return;
    let active = true;
    setMembersLoading(true);
    setMemberError(null);
    void Promise.all([listWorkspaceMembers(activeWorkspace.id), listWorkspaceInvitations(activeWorkspace.id)]).then(([memberResponse, invitationResponse]) => {
      if (active) { setMembers(memberResponse.data); setInvitations(invitationResponse.data); }
    }).catch((requestError: unknown) => {
      if (active) setMemberError(message(requestError));
    }).finally(() => {
      if (active) setMembersLoading(false);
    });
    return () => { active = false; };
  }, [activeWorkspace.id, isCoach]);

  const inviteMember = async (event: FormEvent) => {
    event.preventDefault();
    setInviteBusy(true);
    setMemberError(null);
    setInviteLink(null);
    try {
      const invitation = await inviteWorkspaceMember(activeWorkspace.id, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail('');
      setInvitations((current) => [invitation, ...current]);
      setInviteLink(`${window.location.origin}/invitations/${invitation.token}`);
    } catch (requestError) {
      setMemberError(message(requestError));
    } finally {
      setInviteBusy(false);
    }
  };

  const revokeInvitation = async (invitation: WorkspaceInvitation) => {
    setInviteBusy(true);
    setMemberError(null);
    try {
      await revokeWorkspaceInvitation(activeWorkspace.id, invitation.id);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      if (inviteLink?.endsWith(`/${invitation.token}`)) setInviteLink(null);
    } catch (requestError) {
      setMemberError(message(requestError));
    } finally {
      setInviteBusy(false);
    }
  };

  const resendInvitation = async (invitation: WorkspaceInvitation) => {
    setInviteBusy(true);
    setMemberError(null);
    try {
      const replacement = await resendWorkspaceInvitation(activeWorkspace.id, invitation.id);
      setInvitations((current) => current.map((item) => item.id === invitation.id ? replacement : item));
      setInviteLink(`${window.location.origin}/invitations/${replacement.token}`);
    } catch (requestError) {
      setMemberError(message(requestError));
    } finally {
      setInviteBusy(false);
    }
  };

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

  return (
    <section className={styles.page} aria-labelledby="account-heading">
      <header><p>Identity and access</p><h1 id="account-heading">Account settings</h1><span>Manage sign-in security and your Athlora workspace.</span></header>
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
            <Button variant="secondary" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Sign out</Button>
          </div>
          {ticketUrl && <p className={styles.ticket} role="status">Your secure link is ready. <a href={ticketUrl}>Continue to Auth0</a>. The link expires in 15 minutes.</p>}
          {!hasAuth0Password && <p className={styles.ticket}>Your password is managed by your identity provider.</p>}
          {passwordError && <p className={styles.error} role="alert">{passwordError}</p>}
        </Card>

        <Card className={styles.danger}>
          <p>Danger zone</p><h2>Delete account</h2>
          <span>Permanently remove your Auth0 identity and Athlora workspace, including athletes, events, assignments, timeline entries, and results.</span>
          <Button variant="danger" onClick={() => { setDeleteError(null); setConfirmation(''); setDeleteOpen(true); }}>Delete my account</Button>
        </Card>
      </div>

      {isCoach && <Card className={styles.members}>
        <div><p>Workspace access</p><h2>Members and invitations</h2><span>Invite coaches or assistants to {activeWorkspace.name}.</span></div>
        <form className={styles.inviteForm} onSubmit={(event) => void inviteMember(event)}>
          <label htmlFor="workspace-invite-email">Email address</label>
          <Input id="workspace-invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required disabled={inviteBusy} />
          <label htmlFor="workspace-invite-role">Workspace role</label>
          <select id="workspace-invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'coach' | 'assistant')} disabled={inviteBusy}><option value="assistant">Assistant</option><option value="coach">Coach</option></select>
          <Button type="submit" disabled={inviteBusy}>{inviteBusy ? 'Sending...' : 'Create invitation'}</Button>
        </form>
        {inviteLink && <p className={styles.ticket} role="status">Invitation created. <a href={inviteLink}>Open invitation link</a>.</p>}
        {memberError && <p className={styles.error} role="alert">{memberError}</p>}
        {membersLoading ? <p role="status">Loading workspace members...</p> : <><ul className={styles.memberList}>{members.map((member) => <li key={member.userId}><span><strong>{member.name}{member.userId === currentUser?.id ? ' (you)' : ''}</strong><small>{member.email} · {member.role}</small></span><select aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => void changeMemberRole(member, event.target.value as 'coach' | 'assistant')} disabled={memberBusy !== null}><option value="coach">Coach</option><option value="assistant">Assistant</option></select><Button variant="ghost" onClick={() => void removeMember(member)} disabled={memberBusy !== null}>{memberBusy === member.userId ? 'Removing...' : 'Remove'}</Button></li>)}</ul>{invitations.length > 0 && <section className={styles.pendingInvitations} aria-labelledby="pending-invitations-heading"><h3 id="pending-invitations-heading">Pending invitations</h3><ul>{invitations.map((invitation) => <li key={invitation.id}><span>{invitation.email} · {invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span><Button variant="ghost" onClick={() => void resendInvitation(invitation)} disabled={inviteBusy}>Resend</Button><Button variant="ghost" onClick={() => { setInviteLink(`${window.location.origin}/invitations/${invitation.token}`); }} disabled={!invitation.token}>Open link</Button><Button variant="ghost" onClick={() => void revokeInvitation(invitation)} disabled={inviteBusy}>Revoke</Button></li>)}</ul></section>}</>}
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
    </section>
  );
}
