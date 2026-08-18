import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createPasswordTicket, deleteCurrentAccount } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button, Card, Input, Modal } from '../../components';
import { useCurrentUser } from './CurrentUserContext';
import styles from './AuthPage.module.css';

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'The account service is unavailable. Please try again.';
}

export function AuthPage() {
  const { logout, user } = useAuth0();
  const currentUser = useCurrentUser();
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
